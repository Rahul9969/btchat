import asyncio
from bleak import BleakScanner

COMPANY_ID = 0x02FF # Check both just in case
COMPANY_ID_OLD = 0xFFFF

async def run():
    print("Starting chunk scanner for 20 seconds...")
    def callback(device, adv):
        if adv.manufacturer_data:
            if COMPANY_ID in adv.manufacturer_data or COMPANY_ID_OLD in adv.manufacturer_data:
                print(f"Device: {device.address} -> {adv.manufacturer_data}")
            
    scanner = BleakScanner(callback, scanning_mode="active")
    await scanner.start()
    await asyncio.sleep(20.0)
    await scanner.stop()
    print("Done")

if __name__ == '__main__':
    asyncio.run(run())
