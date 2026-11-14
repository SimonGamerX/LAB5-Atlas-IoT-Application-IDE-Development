#!/usr/bin/env python3
"""
Atlas IoT Application IDE - Main Launcher
Course: B8019 - Programming the Internet of Things
Semester I 2026-2027 Academic Year - Prof. Sumi Helal

Launches:
- Multicast UDP (232.1.1.1:1235) and MQTT background tweet listeners
- Atlas Thing TCP 6668 Virtual Space & Service Server
- Application Manager and Storage (.iot format)
- Full GUI Web IDE on http://localhost:5050
"""

import os
import sys
import time
import socket
import logging
import webbrowser
import threading

from backend.atlas_core import SmartSpaceRegistry
from backend.tweet_listener import TweetListener
from backend.mock_space import MockAtlasThingServer, inject_mock_space
from backend.app_manager import AppManager
from backend.server import ThreadedHTTPServer, AtlasRequestHandler, get_local_ip

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("Main")

PORT = 5050
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")
APPS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "apps_storage")

def main():
    print("=" * 65)
    print("   ATLAS IoT APPLICATION IDE & DEMONSTRATION PLATFORM")
    print("   Course: B8019 - Programming the Internet of Things")
    print("   Professor: Sumi Helal | Academic Year 2026-2027")
    print("=" * 65)

    # Parse optional RPi IP from command line (e.g. python run_ide.py 192.168.1.150 6668)
    target_rpi_ip = "127.0.0.1"
    target_rpi_port = 6668
    simulator_enabled = True

    if len(sys.argv) > 1 and not sys.argv[1].startswith("-"):
        target_rpi_ip = sys.argv[1].strip()
        target_rpi_port = int(sys.argv[2]) if len(sys.argv) > 2 else 6668
        simulator_enabled = False
        print(f"[!] REAL HARDWARE MODE ENABLED: Targeting Raspberry Pi at {target_rpi_ip}:{target_rpi_port}")

    # 1. Initialize Smart Space Registry
    registry = SmartSpaceRegistry(space_id="MySmartSpace")

    # 2. Start Background Tweet Listener (Multicast + MQTT)
    listener = TweetListener(registry)
    listener.start()

    # 3. Setup Hardware Target & Simulator
    mock_server = MockAtlasThingServer(port=6668, host="127.0.0.1")
    if simulator_enabled:
        mock_server.start()
        print(f"[i] Mock Simulator listening on 127.0.0.1:6668 (can switch to real RPi in dashboard)")
    inject_mock_space(registry, rpi_ip=target_rpi_ip, port=target_rpi_port)

    # 4. Initialize App Manager
    app_manager = AppManager(working_dir=APPS_DIR, registry=registry)

    # 5. Configure Request Handler
    local_ip = get_local_ip()
    AtlasRequestHandler.registry = registry
    AtlasRequestHandler.listener = listener
    AtlasRequestHandler.mock_server = mock_server
    AtlasRequestHandler.app_manager = app_manager
    AtlasRequestHandler.frontend_dir = FRONTEND_DIR
    AtlasRequestHandler.network_ip = local_ip
    AtlasRequestHandler.server_port = PORT
    AtlasRequestHandler.simulator_enabled = simulator_enabled
    AtlasRequestHandler.target_ip = target_rpi_ip
    AtlasRequestHandler.target_port = target_rpi_port

    # 6. Bind HTTP Server
    server_address = ("0.0.0.0", PORT)
    try:
        httpd = ThreadedHTTPServer(server_address, AtlasRequestHandler)
    except OSError:
        # Fallback port if 5050 is occupied
        httpd = ThreadedHTTPServer(("0.0.0.0", 5051), AtlasRequestHandler)
        AtlasRequestHandler.server_port = 5051

    actual_port = AtlasRequestHandler.server_port
    ide_url = f"http://localhost:{actual_port}"
    lan_url = f"http://{local_ip}:{actual_port}"

    print(f"\n[+] Atlas Smart Space Registry initialized.")
    print(f"[+] UDP Multicast Listener running on 232.1.1.1:1235")
    print(f"[+] TCP Service Server active on port 6668")
    print(f"[+] Working Directory: {os.path.abspath(APPS_DIR)}")
    print(f"[+] Discovered {len(registry.things)} Thing(s), {len(registry.services)} Service(s), {len(registry.relationships)} Relationship(s)")
    print("-" * 65)
    print(f"[>>>] IDE Web Interface is LIVE:")
    print(f"      Local Access:   {ide_url}")
    print(f"      Network Access: {lan_url}")
    print("-" * 65)
    print("Press Ctrl+C to terminate the IDE.\n")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Atlas IDE Server...")
    finally:
        listener.stop()
        mock_server.stop()
        httpd.server_close()
        print("IDE halted cleanly.")

if __name__ == "__main__":
    main()

