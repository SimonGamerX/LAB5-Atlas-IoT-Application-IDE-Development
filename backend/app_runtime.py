"""
Atlas IoT Application Execution Runtime Engine
Course: B8019 - Programming the Internet of Things

Implements:
- Type 1: Sequential Services {S1, S2, ..., Sn}
- Type 2: Order-based Relationships (A succeeds -> B)
- Type 3: Condition-based Relationships (A return value op threshold -> B)
- Type 4: Interactive steps (user input / prompt / notification)
- Type 5: Logical compound conditions (AND / OR over return values)
- Optional looping support for continuous monitoring
- Network invoker via TCP unicast (port 6668) with fallback to mock
"""

import socket
import json
import time
import threading
import logging
from typing import Dict, Any, List, Optional, Callable

logger = logging.getLogger("AppRuntime")

def send_atlas_service_call(host: str, port: int, thing_id: str, space_id: str,
                            service_name: str, inputs: str = "()", timeout: float = 3.0) -> Dict[str, Any]:
    """Sends a unicast JSON service call to Atlas Thing Middleware on TCP port 6668."""
    payload = {
        "Tweet Type": "Service call",
        "Thing ID": thing_id,
        "Space ID": space_id or "MySmartSpace",
        "Service Name": service_name,
        "Service Inputs": str(inputs)
    }

    t0 = time.time()
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((host, port))
        sock.sendall(json.dumps(payload).encode("utf-8"))
        raw_resp = sock.recv(4096).decode("utf-8")
        sock.close()
        latency_ms = int((time.time() - t0) * 1000)

        try:
            resp_data = json.loads(raw_resp)
        except json.JSONDecodeError:
            resp_data = {"raw": raw_resp}

        resp_data["latency_ms"] = latency_ms
        resp_data["success"] = True
        return resp_data

    except Exception as e:
        latency_ms = int((time.time() - t0) * 1000)
        return {
            "success": False,
            "error": str(e),
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
        self.status = "Created"  # "Created", "Active", "Stopped", "Completed"
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
                # Find thing's host and port
                for t in snapshot["things"]:
                    if t["thing_id"] == thing_id:
                        return t.get("ip", "127.0.0.1"), t.get("port", 6668), thing_id, space_id
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

                step_failed = False
                for idx, step in enumerate(steps):
                    if self.stop_requested.is_set():
                        break

                    step_type = step.get("type", "Type1")  # Type1, Type2, Type3, Type4, Type5
                    desc = step.get("description", f"Step #{idx+1}")
                    self.log(f"Executing [{step_type}] {desc}...", level="STEP")

                    # TYPE 1: Sequential Single Service
                    if step_type == "Type1" or step_type == "sequential":
                        service_name = step.get("service")
                        inputs = step.get("inputs", "()")
                        host, port, thing_id, space_id = self._resolve_service_target(service_name)
                        res = send_atlas_service_call(host, port, thing_id, space_id, service_name, inputs)
                        ret_val = res.get("Return", res.get("Value"))
                        self.last_results[service_name] = ret_val
                        if not res.get("success"):
                            self.log(f"Type 1 service '{service_name}' failed: {res.get('error')}", level="WARN")
                        else:
                            self.log(f"Service '{service_name}' returned: {ret_val} (latency: {res['latency_ms']}ms)")

                    # TYPE 2: Order-based Relationship (Run B only if A succeeds)
                    elif step_type == "Type2" or step_type == "order":
                        service_a = step.get("service_a")
                        service_b = step.get("service_b")
                        inputs_a = step.get("inputs_a", "()")
                        inputs_b = step.get("inputs_b", "()")

                        ha, pa, ta, sa = self._resolve_service_target(service_a)
                        res_a = send_atlas_service_call(ha, pa, ta, sa, service_a, inputs_a)
                        val_a = res_a.get("Return", res_a.get("Value"))
                        self.last_results[service_a] = val_a

                        if res_a.get("success") and res_a.get("Status", "SUCCESS") == "SUCCESS":
                            self.log(f"Order check: Service A '{service_a}' succeeded. Triggering '{service_b}'.")
                            hb, pb, tb, sb = self._resolve_service_target(service_b)
                            res_b = send_atlas_service_call(hb, pb, tb, sb, service_b, inputs_b)
                            self.last_results[service_b] = res_b.get("Return", res_b.get("Value"))
                            self.log(f"Service B '{service_b}' executed successfully.")
                        else:
                            self.log(f"Order check: Service A '{service_a}' failed. Skipping Service B '{service_b}'.", level="WARN")

                    # TYPE 3: Condition-based Relationship (Run B if A return value op val)
                    elif step_type == "Type3" or step_type == "condition":
                        service_a = step.get("service_a")
                        service_b = step.get("service_b")
                        inputs_a = step.get("inputs_a", "()")
                        inputs_b = step.get("inputs_b", "()")
                        op = step.get("operator", ">")
                        thresh = step.get("threshold", 0)

                        ha, pa, ta, sa = self._resolve_service_target(service_a)
                        res_a = send_atlas_service_call(ha, pa, ta, sa, service_a, inputs_a)
                        val_a = res_a.get("Return", res_a.get("Value"))
                        self.last_results[service_a] = val_a

                        cond_met = self._eval_comparison(val_a, op, thresh)
                        self.log(f"Condition evaluation: '{service_a}'={val_a} {op} {thresh} -> {cond_met}")

                        if cond_met:
                            hb, pb, tb, sb = self._resolve_service_target(service_b)
                            res_b = send_atlas_service_call(hb, pb, tb, sb, service_b, inputs_b)
                            self.last_results[service_b] = res_b.get("Return", res_b.get("Value"))
                            self.log(f"Triggered conditional action '{service_b}'.")
                        else:
                            # Optional else action
                            else_service = step.get("else_service")
                            if else_service:
                                he, pe, te, se = self._resolve_service_target(else_service)
                                else_inputs = step.get("else_inputs", "()")
                                send_atlas_service_call(he, pe, te, se, else_service, else_inputs)
                                self.log(f"Condition not met. Triggered fallback service '{else_service}'.")

                    # TYPE 4: Interactive / Notification Step
                    elif step_type == "Type4" or step_type == "interaction":
                        msg = step.get("message", "Interaction Prompt")
                        self.log(f"[USER INTERACTION]: {msg}", level="INTERACT")

                    # TYPE 5: Compound Logical Expression (AND / OR over multiple services)
                    elif step_type == "Type5" or step_type == "compound":
                        # Evaluates logical rule: Cond 1 (e.g. Temp > 28) AND/OR Cond 2 (e.g. Light < 20)
                        logic_op = step.get("logic_op", "AND").upper()
                        cond1 = step.get("condition1", {})
                        cond2 = step.get("condition2", {})
                        action_service = step.get("action_service")
                        action_inputs = step.get("action_inputs", "()")

                        # Eval Cond 1
                        s1 = cond1.get("service")
                        h1, p1, t1, sp1 = self._resolve_service_target(s1)
                        r1 = send_atlas_service_call(h1, p1, t1, sp1, s1)
                        v1 = r1.get("Return", r1.get("Value"))
                        met1 = self._eval_comparison(v1, cond1.get("operator", ">"), cond1.get("threshold", 0))

                        # Eval Cond 2
                        s2 = cond2.get("service")
                        h2, p2, t2, sp2 = self._resolve_service_target(s2)
                        r2 = send_atlas_service_call(h2, p2, t2, sp2, s2)
                        v2 = r2.get("Return", r2.get("Value"))
                        met2 = self._eval_comparison(v2, cond2.get("operator", "<"), cond2.get("threshold", 0))

                        compound_result = (met1 and met2) if logic_op == "AND" else (met1 or met2)
                        self.log(f"Type 5 Compound: ({s1}={v1} {cond1.get('operator')} {cond1.get('threshold')}: {met1}) {logic_op} ({s2}={v2} {cond2.get('operator')} {cond2.get('threshold')}: {met2}) => {compound_result}")

                        if compound_result and action_service:
                            ha, pa, ta, spa = self._resolve_service_target(action_service)
                            res_act = send_atlas_service_call(ha, pa, ta, spa, action_service, action_inputs)
                            self.log(f"Executed compound action '{action_service}' with inputs {action_inputs}")

                    time.sleep(0.5)

                if not loop_mode:
                    break
                else:
                    time.sleep(loop_interval)

            if not self.stop_requested.is_set():
                self.status = "Completed"
                self.end_time = time.time()
                self.log(f"App '{self.name}' finished execution lifecycle (Completed).", level="DONE")
        except Exception as e:
            self.status = "Stopped"
            self.end_time = time.time()
            self.log(f"Exception during execution of '{self.name}': {e}", level="ERROR")

