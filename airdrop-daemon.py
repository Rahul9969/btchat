"""
AirDrop-X Native Daemon Entrypoint
Launches daemon.py
"""
import runpy

if __name__ == "__main__":
    runpy.run_module("daemon", run_name="__main__")
