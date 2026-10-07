import asyncio
from bleak import BleakScanner

async def run():
    print("Starting scan for 10 seconds...")
    def callback(device, adv):
        if adv.manufacturer_data:
            print(f"Device: {device.name} / {device.address} -> {adv.manufacturer_data}")
            
    scanner = BleakScanner(callback, scanning_mode="active")
    await scanner.start()
    await asyncio.sleep(10.0)
    await scanner.stop()
    print("Done")

if __name__ == "__main__":
    asyncio.run(run())
