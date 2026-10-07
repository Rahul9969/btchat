import asyncio
from winrt.windows.devices.bluetooth.advertisement import (
    BluetoothLEAdvertisementPublisher,
    BluetoothLEAdvertisement,
    BluetoothLEManufacturerData,
    BluetoothLEAdvertisementPublisherStatus
)
from winrt.windows.storage.streams import DataWriter

async def main():
    writer = DataWriter()
    writer.write_bytes(b'A' * 19)
    md = BluetoothLEManufacturerData()
    md.company_id = 0x02FF
    md.data = writer.detach_buffer()

    adv = BluetoothLEAdvertisement()
    adv.manufacturer_data.append(md)

    pub = BluetoothLEAdvertisementPublisher(adv)
    pub.start()
    print("Started")
    await asyncio.sleep(2)
    pub.stop()

if __name__ == '__main__':
    asyncio.run(main())
