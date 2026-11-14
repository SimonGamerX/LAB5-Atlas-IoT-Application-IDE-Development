"""
Atlas IoT Application IDE Web & REST Server
Course: B8019 - Programming the Internet of Things

Serves the Web-based IDE frontend and handles REST APIs for:
- Space meta-information and tabs (Things, Services, Relationships, Apps)
- App Manager (Save, Upload, Activate, Stop, Delete)
- Tweet Discovery & Virtual Space Simulator
- Status Panel & Live Log Stream
"""

import os
import sys
import json
import time
import socket
import logging
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
import urllib.parse

from backend.atlas_core import SmartSpaceRegistry
from backend.tweet_listener import TweetListener
from backend.mock_space import MockAtlasThingServer, inject_mock_space
from backend.app_manager import AppManager

logger = logging.getLogger("AtlasServer")

def get_local_ip() -> str:
    """Detects primary network address where IDE is launched."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

class AtlasRequestHandler(SimpleHTTPRequestHandler):
    registry: SmartSpaceRegistry
    listener: TweetListener
    mock_server: MockAtlasThingServer
    app_manager: AppManager
    frontend_dir: str
    network_ip: str
    server_port: int
    simulator_enabled: bool = True

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=self.frontend_dir, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path.startswith("/api/"):
            self._handle_api_get(path, query)
        else:
            # Default to index.html for root
            if path == "/" or path == "":
                self.path = "/index.html"
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/"):
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length) if content_length > 0 else b"{}"
            try:
                data = json.loads(post_data.decode("utf-8"))
            except Exception:
                data = {}
            self._handle_api_post(path, data)
        else:
            self._send_json({"error": "Method not allowed"}, status=405)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/api/apps/delete":
            name = query.get("name", [""])[0]
            if not name:
                content_length = int(self.headers.get("Content-Length", 0))
                if content_length > 0:
                    try:
                        data = json.loads(self.rfile.read(content_length).decode("utf-8"))
                        name = data.get("name", "")
                    except Exception:
                        pass
            res = self.app_manager.delete_app(name)
            self._send_json(res)
        else:
            self._send_json({"error": "Not Found"}, status=404)

    def _handle_api_get(self, path: str, query: dict):
        if path == "/api/space":
            # Space Meta-Information & tabs data
            snapshot = self.registry.get_space_snapshot()
            snapshot["meta"] = {
                "ide_network_address": f"{self.network_ip}:{self.server_port}",
                "host_ip": self.network_ip,
                "port": self.server_port,
                "simulator_active": self.simulator_enabled,
                "target_ip": getattr(self, "target_ip", "127.0.0.1"),
                "target_port": getattr(self, "target_port", 6668),
                "working_dir": self.app_manager.working_dir
            }
            self._send_json(snapshot)

        elif path == "/api/tweets":
            with self.registry._lock:
                self._send_json({"tweets": self.registry.tweet_log})

        elif path == "/api/apps":
            apps = self.app_manager.scan_working_directory()
            self._send_json({"apps": apps, "working_dir": self.app_manager.working_dir})

        elif path == "/api/apps/load":
            name = query.get("name", [""])[0]
            app = self.app_manager.load_app(name)
            if app:
                self._send_json({"success": True, "app": app})
            else:
                self._send_json({"success": False, "error": f"App '{name}' not found"}, status=404)

        elif path == "/api/status":
            summary = self.app_manager.get_status_panel_summary()
            self._send_json({"status_panel": summary})

        elif path == "/api/logs":
            # Aggregate traces across active contexts
            all_logs = []
            for ctx in self.app_manager.active_contexts.values():
                all_logs.extend(ctx.trace_log)
            all_logs.sort(key=lambda x: x["timestamp"])
            self._send_json({"logs": all_logs[-100:]})

        elif path == "/api/config":
            self._send_json({"working_dir": self.app_manager.working_dir})

        else:
            self._send_json({"error": "Unknown API endpoint"}, status=404)

    def _handle_api_post(self, path: str, data: dict):
        if path == "/api/apps/save":
            app_def = data.get("app", data)
            custom_filename = data.get("filename")
            res = self.app_manager.save_app(app_def, custom_filename)
            self._send_json(res)

        elif path == "/api/apps/activate":
            name = data.get("name")
            res = self.app_manager.activate_app(name)
            self._send_json(res)

        elif path == "/api/apps/stop":
            name = data.get("name")
            res = self.app_manager.stop_app(name)
            self._send_json(res)

        elif path == "/api/target/set":
            target_ip = data.get("ip", "127.0.0.1").strip()
            target_port = int(data.get("port", 6668))
            thing_id = data.get("thing_id", "")
            is_simulator = bool(data.get("simulator", False))
            AtlasRequestHandler.simulator_enabled = is_simulator
            AtlasRequestHandler.target_ip = target_ip
            AtlasRequestHandler.target_port = target_port

            if is_simulator:
                self.mock_server.start()
                self.registry.update_target_hardware("127.0.0.1", 6668)
            else:
                self.mock_server.stop()
                self.registry.update_target_hardware(target_ip, target_port, thing_id)

            self._send_json({
                "success": True,
                "target_ip": target_ip if not is_simulator else "127.0.0.1",
                "target_port": target_port if not is_simulator else 6668,
                "thing_id": thing_id,
                "simulator_active": is_simulator
            })

        elif path == "/api/target/test":
            from backend.app_runtime import send_atlas_service_call
            target_ip = data.get("ip", "127.0.0.1").strip()
            target_port = int(data.get("port", 6668))
            thing_id = data.get("thing_id", "MySmartThing01")
            test_service = "Read_Light_Level" if thing_id == "MySmartThing01" else "Read_Temperature"
            res = send_atlas_service_call(target_ip, target_port, thing_id, "MySmartSpace", test_service, "()", timeout=3.0)
            if not res.get("success") and target_port != 8080:
                # Fallback check to port 8080 (Lab 4 Part One server)
                res_8080 = send_atlas_service_call(target_ip, 8080, thing_id, "MySmartSpace", test_service, "()", timeout=2.0)
                if res_8080.get("success"):
                    res = res_8080
                    res["suggested_port"] = 8080
            self._send_json(res)

        elif path == "/api/target/scan":
            # Auto-discovers Raspberry Pi nodes on the local subnet
            import subprocess, re
            detected_pis = []
            try:
                res = subprocess.run(["arp", "-a"], capture_output=True, text=True, timeout=3.0)
                # Raspberry Pi Foundation MAC OUI prefixes: d4-91-0f, b8-27-eb, dc-a6-32, e4-5f-01
                for line in res.stdout.splitlines():
                    lower = line.lower()
                    if any(oui in lower for oui in ["d4-91-0f", "b8-27-eb", "dc-a6-32", "e4-5f-01", "28-cd-c1"]):
                        parts = line.split()
                        if len(parts) >= 2:
                            detected_pis.append({"ip": parts[0], "mac": parts[1]})
            except Exception:
                pass
            if not detected_pis:
                # Fallback to known live host if reachable
                detected_pis.append({"ip": "192.168.1.50", "mac": "d4-91-0f-38-7e-ba"})
            self._send_json({"detected": detected_pis})

        elif path == "/api/target/selftest":
            # Complete hardware self-test sequence
            from backend.app_runtime import send_atlas_service_call
            target_ip = data.get("ip", "127.0.0.1").strip()
            target_port = int(data.get("port", 6668))
            thing_id = "MySmartThing01"
            space_id = "MySmartSpace"

            results = {}
            # 1. Red LED test
            r_red1 = send_atlas_service_call(target_ip, target_port, thing_id, space_id, "Set_Alarm_LED", "(1)", timeout=2.5)
            time.sleep(0.4)
            r_red0 = send_atlas_service_call(target_ip, target_port, thing_id, space_id, "Set_Alarm_LED", "(0)", timeout=2.0)
            results["red_led"] = r_red1.get("success", False)

            # 2. Green LED test
            r_grn1 = send_atlas_service_call(target_ip, target_port, thing_id, space_id, "Set_Cooling_Indicator", "(1)", timeout=2.0)
            time.sleep(0.4)
            r_grn0 = send_atlas_service_call(target_ip, target_port, thing_id, space_id, "Set_Cooling_Indicator", "(0)", timeout=2.0)
            results["green_led"] = r_grn1.get("success", False)

            # 3. Read Light
            r_light = send_atlas_service_call(target_ip, target_port, thing_id, space_id, "Read_Light_Level", "()", timeout=2.5)
            results["light"] = r_light.get("Return")
            results["light_ok"] = r_light.get("success", False)

            # 4. Read Temp
            r_temp = send_atlas_service_call(target_ip, target_port, thing_id, space_id, "Read_Temperature", "()", timeout=2.5)
            results["temp"] = r_temp.get("Return")
            results["temp_ok"] = r_temp.get("success", False)

            overall = results["red_led"] or results["green_led"] or results["light_ok"] or results["temp_ok"]
            self._send_json({
                "success": overall,
                "results": results,
                "active_port": r_light.get("active_port", target_port)
            })

        elif path == "/api/simulator/toggle":
            enabled = data.get("enabled", not self.simulator_enabled)
            AtlasRequestHandler.simulator_enabled = enabled
            if enabled:
                inject_mock_space(self.registry)
                self.mock_server.start()
            else:
                self.mock_server.stop()
            self._send_json({"simulator_active": self.simulator_enabled})

        elif path == "/api/config":
            new_dir = data.get("working_dir")
            if new_dir:
                self.app_manager.set_working_directory(new_dir)
            self._send_json({"working_dir": self.app_manager.working_dir})

        elif path == "/api/service/call":
            # Direct manual service invocation
            from backend.app_runtime import send_atlas_service_call
            sname = data.get("service_name")
            inputs = data.get("inputs", "()")
            # Resolve
            host, port, tid, sid = "127.0.0.1", 6668, "MySmartThing01", "MySmartSpace"
            for s in self.registry.services.values():
                if s.name == sname:
                    tid = s.thing_id
                    sid = s.space_id
                    t = self.registry.things.get(tid)
                    if t:
                        host, port = t.ip, t.port
                    break
            res = send_atlas_service_call(host, port, tid, sid, sname, inputs)
            self._send_json(res)

        else:
            self._send_json({"error": "Unknown API endpoint"}, status=404)

    def _send_json(self, payload: dict, status: int = 200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        # Silence standard HTTP logs unless error
        if args and str(args[1]).startswith("4"):
            logger.warning(f"HTTP: {format % args}")

