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
            is_simulator = bool(data.get("simulator", False))
            AtlasRequestHandler.simulator_enabled = is_simulator
            AtlasRequestHandler.target_ip = target_ip
            AtlasRequestHandler.target_port = target_port

            if is_simulator:
                self.mock_server.start()
                self.registry.update_target_hardware("127.0.0.1", 6668)
            else:
                self.mock_server.stop()
                self.registry.update_target_hardware(target_ip, target_port)

            self._send_json({
                "success": True,
                "target_ip": target_ip if not is_simulator else "127.0.0.1",
                "target_port": target_port if not is_simulator else 6668,
                "simulator_active": is_simulator
            })

        elif path == "/api/target/test":
            from backend.app_runtime import send_atlas_service_call
            target_ip = data.get("ip", "127.0.0.1").strip()
            target_port = int(data.get("port", 6668))
            res = send_atlas_service_call(target_ip, target_port, "MySmartThing01", "MySmartSpace", "Read_Light_Level", "()", timeout=3.0)
            if not res.get("success") and target_port != 8080:
                # Fallback check to port 8080 (Lab 4 Part One server)
                res_8080 = send_atlas_service_call(target_ip, 8080, "MySmartThing01", "MySmartSpace", "Read_Light_Level", "()", timeout=2.0)
                if res_8080.get("success"):
                    res = res_8080
                    res["suggested_port"] = 8080
            self._send_json(res)

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

