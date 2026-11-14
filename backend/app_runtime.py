"""
Atlas IoT Application Execution Runtime Engine
Course: B8019 - Programming the Internet of Things

Implements:
- Direct TCP 6668 unicast service invoker (Official Atlas Thing Middleware)
- Direct HTTP 8080 fallback (Lab 4 Part One server)
- Type 1: Sequential Services {S1, S2, ..., Sn}
- Type 2: Order-based Relationships (A succeeds -> B)
- Type 3: Condition-based Relationships (A return value op threshold -> B)
- Real-time logging and breadboard status dispatch
"""

import socket
import json
import time
import threading
import logging
import urllib.request
from typing import Dict, Any, List, Optional, Callable

logger = logging.getLogger("AppRuntime")

def parse_service_result(raw_result: Any) -> Any:
    """Extracts numeric or clean string return value from Atlas response."""
    if raw_result is None or raw_result == "No Output":
        return 0
    if isinstance(raw_result, (int, float)):
        return raw_result
    s = str(raw_result).strip()
    try:
        if "." in s:
            return float(s)
        return int(s)
    except ValueError:
        return s

def send_atlas_service_call(host: str, port: int, thing_id: str, space_id: str,
                            service_name: str, inputs: str = "()", timeout: float = 3.0) -> Dict[str, Any]:
    """
    Sends service call to the hardware:
    - If port is 8080: uses HTTP POST /call (Lab 4 Part One C++ REST Server)
    - Otherwise (default 6668): uses raw TCP socket JSON (Atlas Thing Middleware)
    """
    t0 = time.time()
    clean_inputs = str(inputs).strip()
    if not clean_inputs.startswith("("):
        clean_inputs = f"({clean_inputs})"

    # 1. LAB 4 PART ONE (HTTP REST on Port 8080)
    if int(port) == 8080:
        try:
            url = f"http://{host}:{port}/call"
            # Extract single param value from "(val)" -> "val"
            param_val = clean_inputs.replace("(", "").replace(")", "").strip()
            payload = json.dumps({"service_name": service_name, "param": param_val}).encode("utf-8")
            req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw_body = resp.read().decode("utf-8")
                latency_ms = int((time.time() - t0) * 1000)
                data = json.loads(raw_body)
                val = parse_service_result(data.get("return_value", data.get("state", 0)))
                return {
                    "success": True,
                    "Return": val,
                    "Value": val,
                    "Status": "SUCCESS" if data.get("status") == "SUCCESS" else "ERROR",
                    "latency_ms": latency_ms,
                    "raw": data
                }
        except Exception as e:
            latency_ms = int((time.time() - t0) * 1000)
            return {
                "success": False,
                "error": f"HTTP 8080 call to {host}:{port} failed: {e}",
                "latency_ms": latency_ms,
                "Return": None,
                "Value": None
            }

    # 2. ATLAS THING MIDDLEWARE (Raw TCP Socket on Port 6668)
    payload = {
        "Tweet Type": "Service call",
        "Thing ID": thing_id or "MySmartThing01",
        "Space ID": space_id or "MySmartSpace",
        "Service Name": service_name,
        "Service Inputs": clean_inputs
    }

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((host, int(port)))
        sock.sendall(json.dumps(payload).encode("utf-8"))
        raw_resp = sock.recv(4096).decode("utf-8", errors="ignore").strip()
        sock.close()
        latency_ms = int((time.time() - t0) * 1000)

        try:
            resp_data = json.loads(raw_resp)
        except json.JSONDecodeError:
            resp_data = {"raw": raw_resp}

        # Check status from Atlas reply
        status_desc = resp_data.get("Status Description", "")
        status = resp_data.get("Status", "Successful")
        is_success = "unsuccessful" not in status.lower() and "incorrect" not in status_desc.lower()

        # Atlas returns result in "Service Result"
        raw_val = resp_data.get("Service Result", resp_data.get("Return", resp_data.get("Value")))
        clean_val = parse_service_result(raw_val)

        return {
            "success": is_success,
            "Return": clean_val,
            "Value": clean_val,
            "Status": "SUCCESS" if is_success else "ERROR",
            "latency_ms": latency_ms,
            "raw": resp_data
        }

    except Exception as e:
        latency_ms = int((time.time() - t0) * 1000)
        return {
            "success": False,
            "error": f"TCP {port} connection to {host} failed: {e}",
            "latency_ms": latency_ms,
            "Return": None,
            "Value": None
        }

class AppExecutionContext:
    def __init__(self, app_def: Dict[str, Any], registry, on_event: Optional[Callable[[Dict[str, Any]], None]] = None):
        self.app_def = app_def
        self.registry = registry
        self.on_event = on_event
        self.name = app_def.get("name", "UnnamedApp")
        self.status = "Created"
        self.start_time: Optional[float] = None
        self.end_time: Optional[float] = None
        self.thread: Optional[threading.Thread] = None
        self.stop_requested = threading.Event()
        self.last_results: Dict[str, Any] = {}
        self.trace_log: List[Dict[str, Any]] = []

    def log(self, message: str, level: str = "INFO", details: Optional[Dict[str, Any]] = None):
        entry = {
            "timestamp": time.time(),
            "time_str": time.strftime("%H:%M:%S"),
            "app_name": self.name,
            "level": level,
            "message": message,
            "details": details or {}
        }
        self.trace_log.append(entry)
        if len(self.trace_log) > 200:
            self.trace_log.pop(0)
        if self.on_event:
            self.on_event(entry)

    def start(self):
        if self.status == "Active":
            return
        self.status = "Active"
        self.start_time = time.time()
        self.stop_requested.clear()
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.name = f"AppThread-{self.name}"
        self.thread.start()
        self.log(f"App '{self.name}' activated at {time.strftime('%H:%M:%S')}.", level="START")

    def stop(self):
        if self.status != "Active":
            return
        self.stop_requested.set()
        self.status = "Stopped"
        self.end_time = time.time()
        self.log(f"App '{self.name}' manually stopped.", level="STOP")

    def _resolve_service_target(self, service_name: str) -> tuple:
        """Finds host, port, thing_id, space_id from the registry."""
        snapshot = self.registry.get_space_snapshot()
        for s in snapshot["services"]:
            if s["name"] == service_name:
                thing_id = s["thing_id"]
                space_id = s.get("space_id", "MySmartSpace")
                for t in snapshot["things"]:
                    if t["thing_id"] == thing_id:
                        return t.get("ip", "127.0.0.1"), int(t.get("port", 6668)), thing_id, space_id
                return "127.0.0.1", 6668, thing_id, space_id
        return "127.0.0.1", 6668, "MySmartThing01", "MySmartSpace"

    def _eval_comparison(self, left_val: Any, op: str, right_val: Any) -> bool:
        try:
            lf = float(left_val)
            rf = float(right_val)
            if op == ">": return lf > rf
            if op == "<": return lf < rf
            if op == ">=": return lf >= rf
            if op == "<=": return lf <= rf
            if op in ("==", "="): return lf == rf
            if op in ("!=", "<>"): return lf != rf
        except (ValueError, TypeError):
            ls, rs = str(left_val).strip(), str(right_val).strip()
            if op in ("==", "="): return ls == rs
            if op in ("!=", "<>"): return ls != rs
        return False

    def _run(self):
        loop_mode = self.app_def.get("loop", False)
        loop_interval = float(self.app_def.get("loop_interval_sec", 3.0))
        steps = self.app_def.get("steps", [])

        iteration = 0
        try:
            while not self.stop_requested.is_set():
                iteration += 1
                if loop_mode:
                    self.log(f"--- Iteration #{iteration} ---", level="CYCLE")

                for idx, step in enumerate(steps):
                    if self.stop_requested.is_set():
                        break

                    step_type = step.get("type", "Type1")
                    desc = step.get("description", f"Step #{idx+1}")

                    # TYPE 1: Sequential Single Service
                    if step_type == "Type1" or step_type == "sequential":
                        service_name = step.get("service")
                        inputs = step.get("inputs", "()")
                        host, port, thing_id, space_id = self._resolve_service_target(service_name)
                        self.log(f"Calling {service_name}{inputs} on {host}:{port}...")
                        res = send_atlas_service_call(host, port, thing_id, space_id, service_name, inputs)
                        ret_val = res.get("Return")
                        self.last_results[service_name] = ret_val
                        if not res.get("success"):
                            self.log(f"[ERROR] Service '{service_name}' failed: {res.get('error')}", level="ERROR")
                        else:
                            self.log(f"Service '{service_name}' returned: {ret_val} ({res['latency_ms']}ms)", level="INFO")

                    # TYPE 2: Order-based Relationship (Run B only if A succeeds)
                    elif step_type == "Type2" or step_type == "order":
                        service_a = step.get("service_a")
                        service_b = step.get("service_b")
                        inputs_a = step.get("inputs_a", "()")
                        inputs_b = step.get("inputs_b", "(1)")

                        ha, pa, ta, sa = self._resolve_service_target(service_a)
                        res_a = send_atlas_service_call(ha, pa, ta, sa, service_a, inputs_a)
                        val_a = res_a.get("Return")
                        self.last_results[service_a] = val_a

                        if res_a.get("success") and res_a.get("Status") == "SUCCESS":
                            self.log(f"Order condition met: '{service_a}' completed successfully. Triggering '{service_b}'.")
                            hb, pb, tb, sb = self._resolve_service_target(service_b)
                            res_b = send_atlas_service_call(hb, pb, tb, sb, service_b, inputs_b)
                            self.last_results[service_b] = res_b.get("Return")
                            self.log(f"Service '{service_b}' executed on {hb}:{pb} -> {res_b.get('Return')}")
                        else:
                            self.log(f"Order check: Service A '{service_a}' did not succeed. Skipping Service B.", level="WARN")

                    # TYPE 3: Condition-based Relationship (Run B if A return value op val)
                    elif step_type == "Type3" or step_type == "condition":
                        service_a = step.get("service_a")
                        service_b = step.get("service_b")
                        inputs_a = step.get("inputs_a", "()")
                        inputs_b = step.get("inputs_b", "(1)")
                        op = step.get("operator", ">")
                        thresh = step.get("threshold", 0)

                        ha, pa, ta, sa = self._resolve_service_target(service_a)
                        res_a = send_atlas_service_call(ha, pa, ta, sa, service_a, inputs_a)
                        val_a = res_a.get("Return")
                        self.last_results[service_a] = val_a

                        cond_met = self._eval_comparison(val_a, op, thresh)
                        self.log(f"Condition test: '{service_a}'={val_a} {op} {thresh} -> {cond_met}")

                        if cond_met:
                            hb, pb, tb, sb = self._resolve_service_target(service_b)
                            res_b = send_atlas_service_call(hb, pb, tb, sb, service_b, inputs_b)
                            self.last_results[service_b] = res_b.get("Return")
                            self.log(f"Triggered action '{service_b}' with {inputs_b} on {hb}:{pb}")
                        else:
                            else_service = step.get("else_service")
                            if else_service:
                                he, pe, te, se = self._resolve_service_target(else_service)
                                else_inputs = step.get("else_inputs", "(0)")
                                send_atlas_service_call(he, pe, te, se, else_service, else_inputs)
                                self.log(f"Condition not met. Triggered fallback '{else_service}' with {else_inputs} on {he}:{pe}")

                    time.sleep(0.4)

                if not loop_mode:
                    break
                else:
                    time.sleep(loop_interval)

            if not self.stop_requested.is_set():
                self.status = "Completed"
                self.end_time = time.time()
                self.log(f"App '{self.name}' completed.", level="DONE")
        except Exception as e:
            self.status = "Stopped"
            self.end_time = time.time()
            self.log(f"Exception during execution of '{self.name}': {e}", level="ERROR")
