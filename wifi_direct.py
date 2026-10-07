import asyncio
import logging
import socket
import os
from winrt.windows.devices.wifidirect import (
    WiFiDirectAdvertisementPublisher,
    WiFiDirectAdvertisementListenStateDiscoverability,
    WiFiDirectConfigurationMethod,
    WiFiDirectDevice,
    WiFiDirectConnectionParameters
)
from winrt.windows.security.credentials import PasswordCredential
from winrt.windows.devices.enumeration import DeviceInformation

logger = logging.getLogger("AirDrop-X.WiFiDirect")

PORT = 8888
CHUNK_SIZE = 65536
RECEIVED_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "received_files")
os.makedirs(RECEIVED_DIR, exist_ok=True)

class WiFiDirectManager:
    def __init__(self):
        self.publisher = None
        self.device = None
        self.tcp_server = None
        self.current_pin = None
        self.peer_connected_event = asyncio.Event()
        self.peer_ip = None
        self.on_file_received = None
        self.on_progress = None

    async def host_send_file(self, file_path: str, pin: str, progress_callback=None):
        """
        Hosts a Wi-Fi Direct network using a temporary PIN and starts
        a TCP server that sends the file to the first authenticated client.
        """
        logger.info(f"Hosting Wi-Fi Direct Group to send file with PIN: {pin}")
        self.current_pin = pin
        self.peer_connected_event.clear()

        try:
            self.publisher = WiFiDirectAdvertisementPublisher()
            self.publisher.advertisement.listen_state_discoverability = (
                WiFiDirectAdvertisementListenStateDiscoverability.INTENSIVE
            )
            self.publisher.advertisement.is_autonomous_group_owner_enabled = True
            self.publisher.start()
            logger.info("Wi-Fi Direct Advertisement Publisher started.")
        except Exception as e:
            logger.warning(f"WinRT Wi-Fi Direct Publisher Notice: {e}")

        # Start TCP server to send the file
        file_size = os.path.getsize(file_path)
        filename = os.path.basename(file_path)

        async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
            client_addr = writer.get_extra_info('peername')
            logger.info(f"TCP Client connected from {client_addr} to receive file")
            self.peer_connected_event.set()

            try:
                # 1. Authenticate with PIN (4 bytes)
                auth_pin_bytes = await asyncio.wait_for(reader.readexactly(4), timeout=10.0)
                client_pin = auth_pin_bytes.decode('utf-8', errors='ignore')
                
                if self.current_pin and client_pin != self.current_pin:
                    logger.error(f"Unauthorized TCP connection attempt! PIN '{client_pin}' != '{self.current_pin}'")
                    writer.close()
                    await writer.wait_closed()
                    return

                # 2. Send Header: [2 bytes: NameLen] [8 bytes: Size] [FileName]
                encoded_name = filename.encode('utf-8')
                header = (
                    len(encoded_name).to_bytes(2, 'big') +
                    file_size.to_bytes(8, 'big') +
                    encoded_name
                )
                writer.write(header)
                await writer.drain()

                # 3. Stream File Data
                bytes_sent = 0
                with open(file_path, "rb") as f:
                    while bytes_sent < file_size:
                        chunk = f.read(CHUNK_SIZE)
                        if not chunk:
                            break
                        writer.write(chunk)
                        await writer.drain()
                        bytes_sent += len(chunk)

                        if progress_callback:
                            percent = int((bytes_sent / file_size) * 100) if file_size > 0 else 100
                            await progress_callback(bytes_sent, file_size, percent, 'upload')

                # 4. Wait for receiver ACK
                ack = await asyncio.wait_for(reader.read(2), timeout=10.0)
                if ack == b"OK":
                    logger.info(f"Successfully sent '{filename}' ({bytes_sent} bytes)")
                else:
                    logger.warning(f"Transfer completed but unexpected ACK: {ack}")

            except Exception as e:
                logger.error(f"Error sending file via TCP: {e}")
            finally:
                try:
                    writer.close()
                    await writer.wait_closed()
                except Exception:
                    pass
                # Stop the server after one transfer
                if self.tcp_server:
                    self.tcp_server.close()

        try:
            if self.tcp_server:
                self.tcp_server.close()
                await self.tcp_server.wait_closed()
            self.tcp_server = await asyncio.start_server(handle_client, '0.0.0.0', PORT)
            logger.info(f"Secure TCP Server listening on port {PORT}")
        except Exception as e:
            logger.error(f"Failed to start TCP Server: {e}")


    async def connect_receive_file(self, pin: str, host_ip: str, progress_callback=None, on_file_received=None):
        """
        Connects to a Wi-Fi Direct group (or local IP) and receives a file.
        Enforces 5MB size limit and validates received bytes.
        """
        logger.info(f"Connecting to {host_ip}:{PORT} to receive file with PIN: {pin}")
        
        try:
            # Try to connect via Wi-Fi Direct if not localhost
            if host_ip != "127.0.0.1":
                selector = WiFiDirectDevice.get_device_selector()
                devices = await DeviceInformation.find_all_async(selector)
                
                if devices and devices.size > 0:
                    host_device_id = devices.get_at(0).id
                    connection_params = WiFiDirectConnectionParameters()
                    connection_params.preference_ordered_configuration_methods.append(
                        WiFiDirectConfigurationMethod.PIN_DISPLAY
                    )
                    cred = PasswordCredential()
                    cred.password = pin
                    self.device = await WiFiDirectDevice.from_id_async(host_device_id, connection_params)
                    logger.info("Connected to Wi-Fi Direct Group")

            # Connect TCP Client
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(host_ip, PORT),
                timeout=15.0
            )

            # 1. Send 4-byte Authentication PIN
            writer.write(pin.encode('utf-8')[:4])
            await writer.drain()

            # 2. Header parsing:
            header = await asyncio.wait_for(reader.readexactly(10), timeout=10.0)
            filename_len = int.from_bytes(header[:2], 'big')
            file_size = int.from_bytes(header[2:10], 'big')

            # MAX_SIZE limit check (5MB)
            if file_size > 5 * 1024 * 1024:
                logger.error(f"File too large: {file_size} bytes. Limit is 5MB.")
                writer.close()
                await writer.wait_closed()
                return False

            raw_filename = await asyncio.wait_for(reader.readexactly(filename_len), timeout=10.0)
            filename = os.path.basename(raw_filename.decode('utf-8', errors='replace'))
            if not filename:
                filename = f"file_{int(os.urandom(2).hex(), 16)}.dat"

            save_path = os.path.join(RECEIVED_DIR, filename)
            logger.info(f"Receiving '{filename}' ({file_size} bytes) -> {save_path}")

            # 3. Stream file contents
            received_bytes = 0
            with open(save_path, 'wb') as f:
                while received_bytes < file_size:
                    to_read = min(CHUNK_SIZE, file_size - received_bytes)
                    chunk = await asyncio.wait_for(reader.read(to_read), timeout=15.0)
                    if not chunk:
                        break
                    f.write(chunk)
                    received_bytes += len(chunk)
                    
                    if progress_callback:
                        percent = int((received_bytes / file_size) * 100) if file_size > 0 else 100
                        await progress_callback(received_bytes, file_size, percent, 'download')

            # Validate received bytes matches file_size
            if received_bytes != file_size:
                logger.error(f"Transfer incomplete. Expected {file_size}, got {received_bytes}")
                writer.close()
                await writer.wait_closed()
                return False

            # 4. Send acknowledgment back to client
            writer.write(b"OK")
            await writer.drain()
            logger.info(f"Successfully received '{filename}'")

            if on_file_received:
                await on_file_received(filename, save_path, received_bytes)

            writer.close()
            await writer.wait_closed()
            return True

        except Exception as e:
            logger.error(f"Error receiving file: {e}")
            return False

    def teardown(self):
        """Destroys the Wi-Fi Direct group and closes open sockets cleanly."""
        logger.info("Tearing down Wi-Fi Direct resources...")
        self.current_pin = None
        self.peer_connected_event.clear()
        
        if self.publisher:
            try:
                self.publisher.stop()
            except Exception:
                pass
            self.publisher = None

        if self.device:
            try:
                self.device.close()
            except Exception:
                pass
            self.device = None

        if self.tcp_server:
            try:
                self.tcp_server.close()
            except Exception:
                pass
            self.tcp_server = None
