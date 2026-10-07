import asyncio
import time
from winrt.windows.devices.bluetooth.advertisement import (
    BluetoothLEAdvertisementPublisher,
    BluetoothLEAdvertisement,
    BluetoothLEManufacturerData,
)
from winrt.windows.storage.streams import DataWriter

async def main():
    publisher = BluetoothLEAdvertisementPublisher()
    
    msg_id = 1
    total_chunks = 4
    chunks = [b'A'*16, b'B'*16, b'C'*16, b'D'*5]
    
    end_time = time.time() + 8.0
    while time.time() < end_time:
        for idx, chunk in enumerate(chunks):
            writer = DataWriter()
            writer.write_byte(msg_id & 0xFF)
            writer.write_byte(idx & 0xFF)
            writer.write_byte(total_chunks & 0xFF)
            writer.write_bytes(chunk)

            md = BluetoothLEManufacturerData()
            md.company_id = 0x02FF
            md.data = writer.detach_buffer()

            adv = BluetoothLEAdvertisement()
            adv.manufacturer_data.append(md)

            try:
                publisher.stop()
            except Exception:
                pass
            publisher = BluetoothLEAdvertisementPublisher(adv)
            try:
                publisher.start()
            except Exception as e:
                print(f"Failed to start: {e}")
                
            await asyncio.sleep(0.3)
            
    try:
        publisher.stop()
    except:
        pass

if __name__ == '__main__':
    asyncio.run(main())
