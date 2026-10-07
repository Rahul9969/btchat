import asyncio
from winrt.windows.devices.bluetooth.advertisement import (
    BluetoothLEAdvertisementPublisher,
    BluetoothLEAdvertisement,
    BluetoothLEManufacturerData,
)
from winrt.windows.storage.streams import DataWriter

async def main():
    chunks = [b'A'*16, b'B'*16, b'C'*16, b'D'*5]
    pubs = []
    
    for idx, chunk in enumerate(chunks):
        writer = DataWriter()
        writer.write_byte(1)
        writer.write_byte(idx)
        writer.write_byte(4)
        writer.write_bytes(chunk)

        md = BluetoothLEManufacturerData()
        md.company_id = 0x02FF
        md.data = writer.detach_buffer()

        adv = BluetoothLEAdvertisement()
        adv.manufacturer_data.append(md)

        pub = BluetoothLEAdvertisementPublisher(adv)
        try:
            pub.start()
            print(f"Started publisher for chunk {idx}")
            pubs.append(pub)
        except Exception as e:
            print(f"Failed to start publisher {idx}: {e}")
            
    await asyncio.sleep(8.0)
    
    for pub in pubs:
        pub.stop()

if __name__ == '__main__':
    asyncio.run(main())
