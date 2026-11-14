"""
Atlas IoT Application Execution Runtime Engine
Course: B8019 - Programming the Internet of Things

Implements:
- Direct TCP 6668 unicast service invoker (Official Atlas Thing Middleware)
- Direct HTTP 8080 fallback (Lab 4 Part One server)
- Type 1: Sequential Services {S1, S2, ..., Sn}
- Type 2: Order-based Relationships (A succeeds -> B)
- Type 3: Condition-based Relationships (A return value op threshold -> B)
- Type 4: Interactive User Input & Output notifications
- Type 5: Compound Logical Expressions (AND, OR, parentheses over service returns)
- Group blocks & Continuous Loop execution
- Real-time logging and breadboard status dispatch
"""

import re
import socket
import json
import time
import threading
import logging
import urllib.request
from typing import Dict, Any, List, Optional, Callable, Tuple

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

def _send_http_8080(host: str, port: int, service_name: str, clean_inputs: str, timeout: float = 2.0, t0: float = None) -> Dict[str, Any]:
    if t0 is None:
        t0 = time.time()
    try:
        url = f"http://{host}:{port}/call"
        param_val = clean_inputs.replace("(", "").replace(")", "").strip()
        if service_name == "Read_Temperature" and not param_val:
            param_val = "C"
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
                "active_port": 8080,
                "raw": data
            }
    except Exception as e:
        latency_ms = int((time.time() - t0) * 1000)
        return {
            "success": False,
            "error": f"HTTP {port} call to {host} failed: {e}",
            "latency_ms": latency_ms,
            "Return": None,
            "Value": None
        }

def _send_tcp_6668(host: str, port: int, thing_id: str, space_id: str, service_name: str, clean_inputs: str, timeout: float = 2.5, t0: float = None) -> Dict[str, Any]:
    if t0 is None:
        t0 = time.time()
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

        status_desc = resp_data.get("Status Description", "")
        status = resp_data.get("Status", "Successful")
        is_success = "unsuccessful" not in status.lower() and "incorrect" not in status_desc.lower()

        raw_val = resp_data.get("Service Result", resp_data.get("Return", resp_data.get("Value")))
        clean_val = parse_service_result(raw_val)

        return {
            "success": is_success,
            "Return": clean_val,
            "Value": clean_val,
            "Status": "SUCCESS" if is_success else "ERROR",
            "latency_ms": latency_ms,
            "active_port": 6668,
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

def send_atlas_service_call(host: str, port: int, thing_id: str, space_id: str,
                            service_name: str, inputs: str = "()", timeout: float = 3.0) -> Dict[str, Any]:
    """
    Sends service call to hardware with smart dual-mode auto-fallback:
    - Automatically tries TCP port 6668 (Atlas Middleware) and HTTP port 8080 (REST Server).
    """
    t0 = time.time()
    clean_inputs = str(inputs).strip()
    if not clean_inputs.startswith("("):
        clean_inputs = f"({clean_inputs})"

    port = int(port)
    if port == 8080:
        res = _send_http_8080(host, 8080, service_name, clean_inputs, timeout=timeout, t0=t0)
        if res.get("success"):
            return res
        if host != "127.0.0.1":
            # Auto-fallback to TCP 6668
            res_6668 = _send_tcp_6668(host, 6668, thing_id, space_id, service_name, clean_inputs, timeout=2.0, t0=t0)
            if res_6668.get("success"):
                return res_6668
        return res
    else:
        res = _send_tcp_6668(host, port, thing_id, space_id, service_name, clean_inputs, timeout=timeout, t0=t0)
        if res.get("success"):
            return res
        if host != "127.0.0.1":
            # Auto-fallback to HTTP 8080
            res_8080 = _send_http_8080(host, 8080, service_name, clean_inputs, timeout=2.0, t0=t0)
            if res_8080.get("success"):
                return res_8080
        return res

class LogicalExpressionEvaluator:
    """
    Safe recursive-descent boolean parser & evaluator for Type 5 constructs.
    Supports: AND, OR, '(', ')', comparisons (>, <, >=, <=, ==, !=, =),
    live service invocations (e.g. Read_Temperature or Read_Temperature()),
    variable placeholders ({var_name}), numeric constants, and strings.
    """

    _TOKEN_RE = re.compile(
        r'\s*('
        r'\(|\)'
        r'|>=|<=|!=|<>|==|>|<|='
        r'|&&|\|\|'
        r'|"[^"]*"|\'[^\']*\''
        r'|\{[a-zA-Z_][a-zA-Z0-9_]*\}'
        r'|[a-zA-Z_][a-zA-Z0-9_]*(?:\(\s*\))?'
        r'|-?\d+(?:\.\d+)?'
        r')'
    )

    def __init__(self, resolve_operand_fn: Callable[[str], Any], compare_fn: Callable[[Any, str, Any], bool]):
        self.resolve_operand = resolve_operand_fn
        self.compare = compare_fn
        self.tokens: List[str] = []
        self.pos: int = 0

    @classmethod
    def tokenize(cls, expr: str) -> List[str]:
        tokens: List[str] = []
        idx = 0
        n = len(expr)
        while idx < n:
            if expr[idx].isspace():
                idx += 1
                continue
            m = cls._TOKEN_RE.match(expr, idx)
            if not m:
                raise ValueError(f"Unexpected token in Type 5 expression near: '{expr[idx:idx+24]}'")
            tok = m.group(1)
            tokens.append(tok)
            idx = m.end()
        return tokens

    def evaluate(self, expr: str) -> Tuple[bool, str]:
        self.tokens = self.tokenize(expr)
        self.pos = 0
        if not self.tokens:
            return False, "Empty expression"
        traces: List[str] = []
        result = self._parse_or(traces)
        if self.pos < len(self.tokens):
            raise ValueError(f"Unexpected trailing token '{self.tokens[self.pos]}' in expression")
        return result, " | ".join(traces)

    def _peek(self) -> Optional[str]:
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def _consume(self) -> str:
        tok = self.tokens[self.pos]
        self.pos += 1
        return tok

    def _is_keyword(self, kw: str) -> bool:
        tok = self._peek()
        if tok is None:
            return False
        up = tok.upper()
        if kw == "AND":
            return up in ("AND", "&&")
        if kw == "OR":
            return up in ("OR", "||")
        return up == kw

    def _parse_or(self, traces: List[str]) -> bool:
        val = self._parse_and(traces)
        while self._is_keyword("OR"):
            self._consume()
            rhs = self._parse_and(traces)
            val = val or rhs
        return val

    def _parse_and(self, traces: List[str]) -> bool:
        val = self._parse_factor(traces)
        while self._is_keyword("AND"):
            self._consume()
            rhs = self._parse_factor(traces)
            val = val and rhs
        return val

    def _parse_factor(self, traces: List[str]) -> bool:
        tok = self._peek()
        if tok is None:
            raise ValueError("Unexpected end of logical expression")
        if tok == "(":
            self._consume()
            val = self._parse_or(traces)
            if self._peek() != ")":
                raise ValueError("Missing closing parenthesis ')' in Type 5 expression")
            self._consume()
            return val
        return self._parse_comparison(traces)

    def _parse_comparison(self, traces: List[str]) -> bool:
        left_tok = self._consume()
        if left_tok in ("(", ")", ">", "<", ">=", "<=", "==", "!=", "=", "<>"):
            raise ValueError(f"Invalid comparison operand '{left_tok}'")
        op_tok = self._peek()
        if op_tok not in (">", "<", ">=", "<=", "==", "!=", "=", "<>"):
            raise ValueError(f"Expected comparison operator after '{left_tok}', found '{op_tok}'")
        self._consume()
        if self._peek() is None:
            raise ValueError(f"Missing right-hand operand after '{left_tok} {op_tok}'")
        right_tok = self._consume()

        left_val = self.resolve_operand(left_tok)
        right_val = self.resolve_operand(right_tok)
        outcome = self.compare(left_val, op_tok, right_val)
        traces.append(f"{left_tok}({left_val}) {op_tok} {right_val} => {outcome}")
        return outcome


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
        self.variables: Dict[str, Any] = {}
        self.pending_prompt: Optional[Dict[str, Any]] = None
        self.last_output: Optional[Dict[str, Any]] = None
        self._prompt_event = threading.Event()
        self._prompt_response: Optional[str] = None
        self.trace_log: List[Dict[str, Any]] = []

    def submit_user_input(self, value: str) -> bool:
        """Delivers interactive user input for a waiting Type 4 prompt."""
        if not self.pending_prompt:
            return False
        self._prompt_response = str(value)
        self._prompt_event.set()
        return True

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
        self.pending_prompt = None
        self._prompt_event.set()
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

    def _resolve_template(self, text: Any) -> str:
        """Substitutes {var_name} or {ServiceName} placeholders from variables/last_results."""
        raw = str(text if text is not None else "")
        def repl(m):
            key = m.group(1)
            if key in self.variables:
                return str(self.variables[key])
            if key in self.last_results:
                return str(self.last_results[key])
            return m.group(0)
        return re.sub(r'\{([a-zA-Z_][a-zA-Z0-9_]*)\}', repl, raw)

    def _invoke_service(self, service_name: str, inputs: str = "()") -> Dict[str, Any]:
        resolved_inputs = self._resolve_template(inputs or "()")
        host, port, thing_id, space_id = self._resolve_service_target(service_name)
        res = send_atlas_service_call(host, port, thing_id, space_id, service_name, resolved_inputs)
        ret_val = res.get("Return")
        self.last_results[service_name] = ret_val
        res["_host"] = host
        res["_port"] = port
        res["_inputs"] = resolved_inputs
        return res

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

    def _execute_step(self, step: Dict[str, Any], idx: int):
        if self.stop_requested.is_set():
            return

        step_type = step.get("type", "Type1")

        # TYPE 1: Sequential Single Service
        if step_type in ("Type1", "sequential"):
            service_name = step.get("service")
            inputs = step.get("inputs", "()")
            resolved_inputs = self._resolve_template(inputs)
            host, port, _, _ = self._resolve_service_target(service_name)
            self.log(f"Calling {service_name}{resolved_inputs} on {host}:{port}...")
            res = self._invoke_service(service_name, resolved_inputs)
            if not res.get("success"):
                self.log(f"[ERROR] Service '{service_name}' failed: {res.get('error')}", level="ERROR")
            else:
                self.log(f"Service '{service_name}' returned: {res.get('Return')} ({res['latency_ms']}ms)", level="INFO")

        # TYPE 2: Order-based Relationship (Run B only if A succeeds)
        elif step_type in ("Type2", "order"):
            service_a = step.get("service_a")
            service_b = step.get("service_b")
            res_a = self._invoke_service(service_a, step.get("inputs_a", "()"))
            if res_a.get("success") and res_a.get("Status") == "SUCCESS":
                self.log(f"Order condition met: '{service_a}' completed successfully. Triggering '{service_b}'.")
                res_b = self._invoke_service(service_b, step.get("inputs_b", "(1)"))
                self.log(f"Service '{service_b}' executed on {res_b['_host']}:{res_b['_port']} -> {res_b.get('Return')}")
            else:
                self.log(f"Order check: Service A '{service_a}' did not succeed. Skipping Service B.", level="WARN")

        # TYPE 3: Condition-based Relationship (Run B if A return value op val)
        elif step_type in ("Type3", "condition"):
            service_a = step.get("service_a")
            service_b = step.get("service_b")
            inputs_b = step.get("inputs_b", "(1)")
            op = step.get("operator", ">")
            thresh = self._resolve_template(step.get("threshold", 0))

            res_a = self._invoke_service(service_a, step.get("inputs_a", "()"))
            val_a = res_a.get("Return")
            cond_met = self._eval_comparison(val_a, op, thresh)
            self.log(f"Condition test: '{service_a}'={val_a} {op} {thresh} -> {cond_met}")

            if cond_met:
                res_b = self._invoke_service(service_b, inputs_b)
                self.log(f"Triggered action '{service_b}' with {res_b['_inputs']} on {res_b['_host']}:{res_b['_port']}")
            else:
                else_service = step.get("else_service")
                if else_service:
                    else_inputs = step.get("else_inputs", "(0)")
                    res_e = self._invoke_service(else_service, else_inputs)
                    self.log(f"Condition not met. Triggered fallback '{else_service}' with {res_e['_inputs']} on {res_e['_host']}:{res_e['_port']}")

        # TYPE 4: User Interaction (Interactive Input Prompt / Output Notification)
        elif step_type in ("Type4", "interaction"):
            mode = str(step.get("interaction_mode", "output")).lower()
            if mode in ("input", "prompt"):
                var_name = step.get("var_name", "user_input") or "user_input"
                prompt_text = self._resolve_template(step.get("prompt", "Enter value:"))
                default_val = str(step.get("default_value", ""))
                self.pending_prompt = {
                    "prompt_id": f"{self.name}_{idx}_{int(time.time())}",
                    "var_name": var_name,
                    "prompt": prompt_text,
                    "default_value": default_val
                }
                self._prompt_response = None
                self._prompt_event.clear()
                self.log(f"[Type 4 Input] Awaiting user input '{var_name}': {prompt_text}", level="WARN")

                while not self.stop_requested.is_set() and not self._prompt_event.is_set():
                    self._prompt_event.wait(0.2)

                self.pending_prompt = None
                if self.stop_requested.is_set():
                    return

                chosen = self._prompt_response if (self._prompt_response is not None and self._prompt_response != "") else default_val
                parsed = parse_service_result(chosen)
                self.variables[var_name] = parsed
                self.last_results[var_name] = parsed
                self.log(f"[Type 4 Input] Received {var_name} = {parsed}", level="INFO")
            else:
                msg = self._resolve_template(step.get("message", "Atlas IoT IDE notification"))
                self.last_output = {"message": msg, "time_str": time.strftime("%H:%M:%S")}
                self.log(f"[Type 4 Output] {msg}", level="START")

        # TYPE 5: Compound Logical Expression (AND, OR, parentheses)
        elif step_type in ("Type5", "logic", "compound"):
            expr = str(step.get("expression", "")).strip()
            if not expr and isinstance(step.get("clauses"), list):
                comb = f" {step.get('combinator', 'AND').upper()} "
                parts = [f"{c.get('service_a', '')} {c.get('operator', '>')} {c.get('threshold', 0)}" for c in step["clauses"]]
                expr = "(" + comb.join(parts) + ")" if parts else ""
            expr = self._resolve_template(expr)

            step_cache: Dict[str, Any] = {}
            known_services = {s["name"] for s in self.registry.get_space_snapshot().get("services", [])}

            def resolve_operand(tok: str) -> Any:
                # Strip quotes
                if (tok.startswith('"') and tok.endswith('"')) or (tok.startswith("'") and tok.endswith("'")):
                    return tok[1:-1]
                # Bare {var} (if not replaced by template yet)
                if tok.startswith("{") and tok.endswith("}"):
                    vn = tok[1:-1]
                    return self.variables.get(vn, self.last_results.get(vn, 0))
                # Function-style or bare service identifier
                ident = tok[:-2].strip() if tok.endswith("()") else tok
                if ident in known_services:
                    if ident not in step_cache:
                        r = self._invoke_service(ident, "()")
                        step_cache[ident] = r.get("Return", 0)
                    return step_cache[ident]
                if ident in self.variables:
                    return self.variables[ident]
                return parse_service_result(ident)

            evaluator = LogicalExpressionEvaluator(resolve_operand, self._eval_comparison)
            logic_met, detail_trace = evaluator.evaluate(expr)
            self.log(f"[Type 5 Logic] {expr} => {logic_met} ({detail_trace})")

            service_b = step.get("service_b")
            inputs_b = step.get("inputs_b", "(1)")
            if logic_met and service_b:
                res_b = self._invoke_service(service_b, inputs_b)
                self.log(f"[Type 5 Action] Triggered '{service_b}' with {res_b['_inputs']} on {res_b['_host']}:{res_b['_port']}")
            elif not logic_met and step.get("else_service"):
                else_srv = step["else_service"]
                res_e = self._invoke_service(else_srv, step.get("else_inputs", "(0)"))
                self.log(f"[Type 5 Else] Fallback '{else_srv}' with {res_e['_inputs']} on {res_e['_host']}:{res_e['_port']}")

        # GROUP: Nested sequential block delimiter { S1; S2; ... }
        elif step_type in ("Group", "block"):
            nested = step.get("steps", [])
            self.log(f"Entering grouped block '{step.get('description', 'Block')}' ({len(nested)} steps)")
            for n_idx, n_step in enumerate(nested):
                if self.stop_requested.is_set():
                    break
                self._execute_step(n_step, n_idx)

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
                    self._execute_step(step, idx)
                    if not self.stop_requested.is_set():
                        time.sleep(0.35)

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
