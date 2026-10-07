import asyncio
import json
import logging
import os
import base64
import websockets
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
from cryptography.hazmat.primitives.asymmetric import x25519
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from ble_engine import BLEFountainEngine
from wifi_direct import WiFiDirectManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AirDrop-X")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KEY_FILE = os.path.join(BASE_DIR, "private_key.pem")
STAGING_DIR = os.path.join(BASE_DIR, "staging")
RECEIVED_DIR = os.path.join(BASE_DIR, "received_files")
os.makedirs(STAGING_DIR, exist_ok=True)
os.makedirs(RECEIVED_DIR, exist_ok=True)

# ─── Key Management ────────────────────────────────────────────────────────────
if os.path.exists(KEY_FILE):
    with open(KEY_FILE, "rb") as key_file:
        private_key = serialization.load_pem_private_key(
            key_file.read(),
            password=b"airdrop-x-local-dev-key",
        )
else:
    private_key = x25519.X25519PrivateKey.generate()
    with open(KEY_FILE, "wb") as key_file:
        key_file.write(private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.BestAvailableEncryption(b"airdrop-x-local-dev-key")
        ))

public_key = private_key.public_key()
public_bytes = public_key.public_bytes(
    encoding=serialization.Encoding.Raw,
    format=serialization.PublicFormat.Raw
)
peer_id_hex = public_bytes.hex()[:12]

clients = set()
peer_keys = {}            # peer_id_hex -> 32-byte derived ChaCha20 key
peer_public_keys = {}     # peer_id_hex -> 32-byte public key
shaken_peers = set()      # peer_ids we have reciprocated handshake with
ble_engine = BLEFountainEngine()
wifi_direct = WiFiDirectManager()

async def broadcast_handshake():
    """Advertise this node's identity so peers can derive the shared key."""
    handshake_payload = b'\x01' + bytes.fromhex(peer_id_hex) + public_bytes
    await ble_engine.broadcast_message(os.urandom(1)[0], handshake_payload)

async def discovery_heartbeat():
    """Keep discovery working when a nearby laptop starts after this one."""
    while True:
        try:
            await broadcast_handshake()
        except Exception as e:
            logger.warning(f"Periodic BLE discovery beacon failed: {e}")
        await asyncio.sleep(7.0)

def derive_symmetric_key(remote_pub_bytes: bytes) -> bytes:
    """Derives a ChaCha20-Poly1305 symmetric key from X25519 ECDH via HKDF-SHA256."""
    remote_pub = x25519.X25519PublicKey.from_public_bytes(remote_pub_bytes)
    shared_secret = private_key.exchange(remote_pub)
    return HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=b"airdrop-x-chacha20-key",
    ).derive(shared_secret)

async def notify_clients(event_data: dict):
    """Broadcasts a JSON message to all connected local WebSocket UI clients."""
    if not clients:
        return
    msg = json.dumps(event_data)
    for c in list(clients):
        try:
            await c.send(msg)
        except Exception:
            pass

async def handle_incoming_file_offer(pin: str, file_name: str, file_size: int):
    """Coordinates connecting to a Wi-Fi Direct group to receive an offered file."""
    try:
        logger.info(f"Connecting to Wi-Fi Direct group to receive '{file_name}' ({file_size} bytes)...")
        connected = await wifi_direct.connect_to_group(pin)
        
        # In prototype/LAN fallback, host IP defaults to 192.168.137.1 or 127.0.0.1
        host_ip = "192.168.137.1" if connected else "127.0.0.1"
        
        async def on_dl_progress(bytes_rx, total, percent, direction):
            await notify_clients({
                "type": "FILE_PROGRESS",
                "percent": percent,
                "bytes_transferred": bytes_rx,
                "total": total,
                "direction": direction,
                "file_name": file_name
            })

        # Start listening/receiving on local connection if host is acting as TCP client,
        # or connect directly to host server
        logger.info(f"Receiving file from {host_ip}...")
        save_path = os.path.join(RECEIVED_DIR, file_name)
        # Sockets will perform transfer via wifi_direct server or client
    except Exception as e:
        logger.error(f"Failed handling incoming file offer: {e}")

# ─── BLE Mesh Payload Dispatcher ──────────────────────────────────────────────
async def process_ble_payload(payload: bytes):
    """Callback triggered whenever a BLE advertisement burst is fully reconstructed."""
    try:
        if not payload or len(payload) < 7:
            return

        payload_type = payload[0]

        # ── 1. ECDH HANDSHAKE (Type 0x01) ──────────────────────────────────────
        # Format: [TYPE: 1 byte (0x01)] [Sender_ID: 6 bytes] [Public_Key: 32 bytes]
        if payload_type == 0x01 and len(payload) >= 39:
            sender_id = payload[1:7].hex()
            remote_pub = payload[7:39]

            if sender_id == peer_id_hex:
                return # Ignore self broadcast

            logger.info(f"Discovered peer via BLE Handshake: {sender_id}")
            is_new = sender_id not in peer_keys

            # Derive and store ChaCha20-Poly1305 symmetric key via HKDF
            peer_keys[sender_id] = derive_symmetric_key(remote_pub)
            peer_public_keys[sender_id] = remote_pub

            # Inform UI of newly discovered peer
            await notify_clients({
                "type": "PEER_DISCOVERED",
                "peer_id": sender_id
            })

            # Reciprocate handshake if we haven't already shaken hands
            if is_new and sender_id not in shaken_peers:
                shaken_peers.add(sender_id)
                logger.info(f"Reciprocating BLE handshake to peer {sender_id}")
                resp_payload = b'\x01' + bytes.fromhex(peer_id_hex) + public_bytes
                msg_id = os.urandom(1)[0]
                asyncio.create_task(ble_engine.broadcast_message(msg_id, resp_payload))
            return

        # ── 2. WI-FI DIRECT FILE OFFER (Type 0x02) ────────────────────────────
        # Format: [TYPE: 1 (0x02)] [Target: 6] [PIN: 4] [Size: 4] [NameLen: 1] [FileName]
        if payload_type == 0x02 and len(payload) >= 15:
            target_id = payload[1:7].hex()
            pin = payload[7:11].decode('utf-8', errors='ignore')
            file_size = int.from_bytes(payload[11:15], 'big')
            
            name_len = payload[15] if len(payload) > 15 else 0
            file_name = payload[16:16+name_len].decode('utf-8', errors='ignore') if name_len > 0 else "received_file"

            if target_id == peer_id_hex or target_id == "ffffffffffff":
                logger.info(f"Received FILE_OFFER for file '{file_name}' ({file_size} bytes). PIN={pin}")
                await notify_clients({
                    "type": "FILE_INCOMING",
                    "size": file_size,
                    "file_name": file_name,
                    "pin": pin
                })
                asyncio.create_task(handle_incoming_file_offer(pin, file_name, file_size))
            return

        # ── 3. ENCRYPTED PEER MESSAGE ──────────────────────────────────────────
        # Format: [Target_ID: 6 bytes] [Sender_ID: 6 bytes] [Nonce: 12 bytes] [Ciphertext]
        if len(payload) < 24:
            return

        target_id = payload[:6].hex()
        sender_id = payload[6:12].hex()
        nonce = payload[12:24]
        ciphertext = payload[24:]

        if target_id != peer_id_hex and target_id != "ffffffffffff":
            return # Packet not meant for this node

        if sender_id in peer_keys:
            chacha_key = peer_keys[sender_id]
            chacha = ChaCha20Poly1305(chacha_key)
            try:
                decrypted = chacha.decrypt(nonce, ciphertext, None)
                text = decrypted.decode('utf-8', errors='ignore')
                logger.info(f"Decrypted message from {sender_id}: {text[:50]}")
                
                await notify_clients({
                    "type": "MESSAGE_RECEIVED",
                    "peer": sender_id,
                    "payload": text
                })
            except Exception as e:
                logger.error(f"ChaCha20 Decryption failed from {sender_id}: {e}")
        else:
            logger.warning(f"Received message from unknown peer {sender_id}. Requesting handshake...")
            # Automatically request handshake with unknown peer
            handshake = b'\x01' + bytes.fromhex(peer_id_hex) + public_bytes
            asyncio.create_task(ble_engine.broadcast_message(os.urandom(1)[0], handshake))

    except Exception as e:
        logger.error(f"Failed to process BLE payload: {e}")

# ─── Local WebSocket Bridge (UI <-> Daemon) ──────────────────────────────────
async def handle_ws(websocket):
    if hasattr(websocket, 'request') and "token=airdrop_dev_token" not in websocket.request.path:
        await websocket.close(code=1008, reason="Unauthorized")
        return

    clients.add(websocket)
    try:
        # Send STATUS_UPDATE and IDENTITY for UI compatibility
        await websocket.send(json.dumps({
            "type": "STATUS_UPDATE",
            "peer_id": peer_id_hex
        }))
        await websocket.send(json.dumps({
            "type": "IDENTITY",
            "peer_id": peer_id_hex
        }))

        # Send existing active peers discovered so far
        for pid in list(peer_keys.keys()):
            await websocket.send(json.dumps({
                "type": "PEER_DISCOVERED",
                "peer_id": pid
            }))

        async for message in websocket:
            data = json.loads(message)
            msg_type = data.get("type")

            # ── A. BROADCAST HANDSHAKE ─────────────────────────────────────────
            if msg_type == "BROADCAST_HANDSHAKE":
                logger.info("Broadcasting local identity handshake over BLE...")
                asyncio.create_task(broadcast_handshake())
                await websocket.send(json.dumps({
                    "type": "HANDSHAKE_BROADCASTED",
                    "status": "success",
                    "peer_id": peer_id_hex
                }))

            # ── B. SEND TEXT MESSAGE ───────────────────────────────────────────
            elif msg_type == "SEND_MESSAGE":
                target_peer = data["target_peer"]
                if target_peer not in peer_keys:
                    logger.warning(f"Target peer {target_peer} not in peer_keys. Initiating handshake first.")
                    # Trigger handshake broadcast
                    handshake_payload = b'\x01' + bytes.fromhex(peer_id_hex) + public_bytes
                    asyncio.create_task(ble_engine.broadcast_message(os.urandom(1)[0], handshake_payload))
                    await websocket.send(json.dumps({
                        "type": "MESSAGE_ERROR",
                        "error": f"Peer {target_peer} key not yet exchanged. Broadcasting handshake..."
                    }))
                    continue

                chacha_key = peer_keys[target_peer]
                chacha = ChaCha20Poly1305(chacha_key)
                text = data["payload"].encode("utf-8")
                nonce = os.urandom(12)
                ciphertext = chacha.encrypt(nonce, text, None)

                try:
                    target_bytes = bytes.fromhex(target_peer)
                    sender_bytes = bytes.fromhex(peer_id_hex)
                except ValueError:
                    logger.error(f"Invalid hex for target or sender ID: {target_peer}")
                    continue

                full_payload = target_bytes + sender_bytes + nonce + ciphertext
                msg_id = os.urandom(1)[0]
                asyncio.create_task(ble_engine.broadcast_message(msg_id, full_payload))
                await websocket.send(json.dumps({"type": "MESSAGE_SENT", "status": "success"}))

            # ── C. STAGE FILE DATA CHUNK FROM BROWSER UI ───────────────────────
            elif msg_type == "STAGE_FILE_CHUNK":
                file_name = data.get("file_name", "unnamed.dat")
                chunk_b64 = data.get("chunk", "")
                chunk_index = data.get("chunk_index", 0)
                total_chunks = data.get("total_chunks", 1)

                clean_name = os.path.basename(file_name)
                staging_path = os.path.join(STAGING_DIR, clean_name)
                mode = "wb" if chunk_index == 0 else "ab"
                
                with open(staging_path, mode) as f:
                    f.write(base64.b64decode(chunk_b64))

                if chunk_index == total_chunks - 1:
                    logger.info(f"File '{clean_name}' successfully staged ({os.path.getsize(staging_path)} bytes).")
                    await websocket.send(json.dumps({
                        "type": "FILE_STAGED",
                        "file_name": clean_name,
                        "file_path": staging_path,
                        "file_size": os.path.getsize(staging_path)
                    }))

            # ── D. SEND FILE OVER WI-FI DIRECT + BLE OFFER ─────────────────────
            elif msg_type == "SEND_FILE":
                target_peer = data["target_peer"]
                file_name = data.get("file_name") or data.get("payload")
                
                # Check if file exists in staging or absolute path
                staging_candidate = os.path.join(STAGING_DIR, os.path.basename(file_name))
                if os.path.exists(staging_candidate):
                    file_path = staging_candidate
                elif os.path.exists(file_name):
                    file_path = file_name
                else:
                    file_path = staging_candidate
                    # If not staged yet, create dummy if payload was small text
                    if not os.path.exists(file_path):
                        with open(file_path, "wb") as f:
                            f.write(data.get("payload", "").encode("utf-8"))

                real_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
                clean_name = os.path.basename(file_path)

                try:
                    target_bytes = bytes.fromhex(target_peer)
                except ValueError:
                    logger.error(f"Invalid hex for target peer: {target_peer}")
                    continue

                # 4-character hex PIN
                pin = os.urandom(2).hex()

                async def progress_hook(bytes_sent, total, percent, direction):
                    await notify_clients({
                        "type": "FILE_PROGRESS",
                        "percent": percent,
                        "bytes_transferred": bytes_sent,
                        "total": total,
                        "direction": direction,
                        "file_name": clean_name
                    })

                async def file_rx_hook(received_name, path, size):
                    await notify_clients({
                        "type": "FILE_RECEIVED",
                        "file_name": received_name,
                        "path": path,
                        "size": size
                    })

                # Host Wi-Fi direct group and TCP server
                await wifi_direct.host_group(pin, on_file_received=file_rx_hook, on_progress=progress_hook)

                # Broadcast FILE_OFFER with real size and file name via BLE Mesh
                msg_id = os.urandom(1)[0]
                asyncio.create_task(
                    ble_engine.broadcast_file_offer(msg_id, target_bytes, pin, real_size, clean_name)
                )

                # Wait for peer connection or timeout
                async def complete_transfer():
                    has_peer = await wifi_direct.wait_for_peer_connection(timeout=25.0)
                    if has_peer and wifi_direct.peer_ip:
                        await wifi_direct.send_file(wifi_direct.peer_ip, file_path, pin, progress_callback=progress_hook)
                    await notify_clients({
                        "type": "FILE_SENT",
                        "status": "success",
                        "file_name": clean_name,
                        "size": real_size
                    })

                asyncio.create_task(complete_transfer())

    finally:
        clients.remove(websocket)

# ─── Main Entry Point ─────────────────────────────────────────────────────────
async def main():
    logger.info(f"AirDrop-X Windows BLE Daemon Running. Node ID: {peer_id_hex}")

    # Start BLE Passive Scanner in background
    asyncio.create_task(ble_engine.start_passive_scanner(process_ble_payload))

    # Repeated beacons make discovery independent of launch order.
    asyncio.create_task(discovery_heartbeat())

    # Start Local WebSocket Server for UI bridge
    async with websockets.serve(handle_ws, "127.0.0.1", 8765):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
