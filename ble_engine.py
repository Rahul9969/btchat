import asyncio
import logging
import time
from winrt.windows.devices.bluetooth.advertisement import (
    BluetoothLEAdvertisementPublisher,
    BluetoothLEAdvertisement,
    BluetoothLEAdvertisementDataSection,
)
from winrt.windows.storage.streams import DataWriter
from bleak import BleakScanner
from reedsolo import RSCodec

logger = logging.getLogger("AirDrop-X.BLE")

# This ID is part of the over-the-air protocol. Keep it stable on every
# installation; discovery only works when both laptops filter for the same ID.
COMPANY_ID = 0x02FF
# Leave room for BLE and manufacturer headers across common controllers.
PAYLOAD_SIZE = 20

class BLEFountainEngine:
    def __init__(self):
        self.publisher = BluetoothLEAdvertisementPublisher()
        # Increased parity to 14 bytes for improved forward error correction over lossy BLE
        self.rsc = RSCodec(14)
        self.active_broadcast = False
        
        # Buffer keyed by (device_address, msg_id) to prevent chunk interleaving across peers
        self.receive_buffer = {}
        self.receive_timestamps = {}
        # Deduplication cache to prevent multi-delivery during continuous broadcast loops
        self.processed_messages = {}
        self.BUFFER_TTL = 30.0
        
        self._loop = None
        self._callback = None
        # Most Windows Bluetooth adapters expose one advertising set. Starting
        # several publishers at once can leave scanners seeing only one chunk.
        self._broadcast_lock = asyncio.Lock()

    def _evict_stale_buffers(self):
        """Evicts buffers and dedup entries older than BUFFER_TTL to prevent memory leaks."""
        now = time.time()
        stale_buffers = [
            key for key, ts in self.receive_timestamps.items()
            if now - ts > self.BUFFER_TTL
        ]
        for key in stale_buffers:
            self.receive_buffer.pop(key, None)
            self.receive_timestamps.pop(key, None)
            
        stale_processed = [
            key for key, ts in self.processed_messages.items()
            if now - ts > self.BUFFER_TTL
        ]
        for key in stale_processed:
            self.processed_messages.pop(key, None)

    async def broadcast_message(self, msg_id: int, payload: bytes):
        """
        Takes an encrypted payload, applies Reed-Solomon FEC, chunks it,
        and broadcasts it via WinRT BLE Advertising packets.
        """
        async with self._broadcast_lock:
            logger.info(f"Starting BLE broadcast for message {msg_id} ({len(payload)} bytes)")
            self.active_broadcast = True
            try:
                encoded_payload = self.rsc.encode(payload)
            except Exception as e:
                logger.error(f"RS encode failed for message {msg_id}: {e}")
                encoded_payload = payload

            chunks = [
                encoded_payload[i:i + PAYLOAD_SIZE]
                for i in range(0, len(encoded_payload), PAYLOAD_SIZE)
            ]
            if not chunks:
                return

            try:
                # Advertise one chunk at a time. Each remains active long
                # enough for Windows to schedule several advertising events.
                end_time = time.monotonic() + 8.0
                while time.monotonic() < end_time and self.active_broadcast:
                    for idx, chunk in enumerate(chunks):
                        if not self.active_broadcast:
                            break
                        self._update_advertisement(msg_id, idx, len(chunks), chunk)
                        await asyncio.sleep(0.35)
            finally:
                try:
                    self.publisher.stop()
                except Exception:
                    pass
                self.active_broadcast = False
                logger.info(f"BLE broadcast complete for message {msg_id}.")

    def _update_advertisement(self, msg_id: int, chunk_idx: int, total_chunks: int, chunk_data: bytes):
        """Replace the adapter's single advertising set with one mesh chunk."""
        from winrt.windows.devices.bluetooth.advertisement import BluetoothLEManufacturerData

        writer = DataWriter()
        writer.write_byte(msg_id & 0xFF)
        writer.write_byte(chunk_idx & 0xFF)
        writer.write_byte(total_chunks & 0xFF)
        writer.write_bytes(chunk_data)

        manufacturer_data = BluetoothLEManufacturerData()
        manufacturer_data.company_id = COMPANY_ID
        manufacturer_data.data = writer.detach_buffer()
        advertisement = BluetoothLEAdvertisement()
        advertisement.manufacturer_data.append(manufacturer_data)

        try:
            self.publisher.stop()
        except Exception:
            pass
        self.publisher = BluetoothLEAdvertisementPublisher(advertisement)
        try:
            self.publisher.start()
        except Exception as e:
            logger.warning(f"BLE advertiser could not start for chunk {chunk_idx}: {e}")

    async def broadcast_file_offer(self, msg_id: int, target_peer: bytes, pin: str, file_size: int, file_name: str = ""):
        """
        Broadcasts a Wi-Fi Direct FILE_OFFER over the BLE Mesh.
        Format: [TYPE:1 (0x02)] [Target:6] [PIN:4] [Size:4] [NameLen:1] [FileName]
        """
        logger.info(f"Broadcasting FILE_OFFER for peer {target_peer.hex()} with PIN {pin}, size={file_size}")
        name_bytes = file_name.encode('utf-8')[:30] if file_name else b''
        payload = (
            b'\x02' +
            target_peer[:6] +
            pin.encode('utf-8')[:4] +
            int(file_size).to_bytes(4, 'big') +
            len(name_bytes).to_bytes(1, 'big') +
            name_bytes
        )
        await self.broadcast_message(msg_id, payload)

    async def _safe_dispatch(self, decoded: bytes):
        """Safely dispatches decoded payload to the daemon callback."""
        if self._callback:
            try:
                await self._callback(decoded)
            except Exception as e:
                logger.error(f"Error in BLE payload consumer callback: {e}")

    async def start_passive_scanner(self, callback):
        """
        Passively scans for AirDrop-X BLE packets, handles deduplication,
        memory management, and thread-safe dispatch to the event loop.
        """
        logger.info("Starting BLE Passive Mesh Scanner...")
        self._loop = asyncio.get_running_loop()
        self._callback = callback
        
        def detection_callback(device, advertisement_data):
            # Check for our manufacturer specific company ID
            if COMPANY_ID in advertisement_data.manufacturer_data:
                data = advertisement_data.manufacturer_data[COMPANY_ID]
                if len(data) >= 3:
                    msg_id = data[0]
                    chunk_idx = data[1]
                    total_chunks = data[2]
                    chunk_payload = data[3:]
                    
                    # Evict any stale buffers first
                    self._evict_stale_buffers()
                    
                    device_addr = getattr(device, 'address', 'unknown') or 'unknown'
                    buffer_key = (device_addr, msg_id)
                    
                    # Check if this message was recently fully decoded and dispatched
                    now = time.time()
                    if buffer_key in self.processed_messages:
                        if now - self.processed_messages[buffer_key] < 10.0:
                            # Already processed from this continuous burst
                            return
                    
                    if buffer_key not in self.receive_buffer:
                        self.receive_buffer[buffer_key] = {}
                        self.receive_timestamps[buffer_key] = now
                    else:
                        self.receive_timestamps[buffer_key] = now
                        
                    self.receive_buffer[buffer_key][chunk_idx] = bytes(chunk_payload)
                    
                    # If all chunks are gathered, reconstruct and decode
                    if len(self.receive_buffer[buffer_key]) == total_chunks:
                        ordered_chunks = [
                            self.receive_buffer[buffer_key][i]
                            for i in range(total_chunks)
                            if i in self.receive_buffer[buffer_key]
                        ]
                        
                        if len(ordered_chunks) == total_chunks:
                            full_encoded = b''.join(ordered_chunks)
                            try:
                                decoded = self.rsc.decode(full_encoded)[0]
                                logger.info(f"Successfully reconstructed MSG {msg_id} from {device_addr}")
                                # Mark as recently processed to avoid burst duplicates
                                self.processed_messages[buffer_key] = time.time()
                                self.receive_buffer.pop(buffer_key, None)
                                self.receive_timestamps.pop(buffer_key, None)
                                
                                # Thread-safe dispatch back to asyncio event loop
                                if self._loop and self._loop.is_running():
                                    self._loop.call_soon_threadsafe(
                                        lambda d=decoded: asyncio.create_task(self._safe_dispatch(d))
                                    )
                            except Exception as e:
                                logger.warning(f"Failed RS decode for MSG {msg_id} from {device_addr}: {e}")
                                self.receive_buffer.pop(buffer_key, None)
                                self.receive_timestamps.pop(buffer_key, None)

        scanner = BleakScanner(detection_callback, scanning_mode="active")
        await scanner.start()
        logger.info("BLE Scanner active and listening for mesh packets.")
        try:
            await asyncio.Future()
        finally:
            await scanner.stop()
