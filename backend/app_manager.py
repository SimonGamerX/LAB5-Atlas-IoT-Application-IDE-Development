"""
Atlas IoT Application Manager
Course: B8019 - Programming the Internet of Things

Implements Requirement 4:
- SAVE APP: Saves composed app as .iot JSON in the working directory
- UPLOAD APP: Loads saved .iot from working directory or file stream
- ACTIVATE: Initiates AppExecutionContext lifecycle, updates status panel
- STOP: Halts active execution context gracefully
- DELETE: Removes app from memory and disk storage
- Manages fixed (but changeable) "Atlas working directory"
"""

import os
import re
import json
import time
import logging
from typing import Dict, Any, List, Optional
from backend.app_runtime import AppExecutionContext

logger = logging.getLogger("AppManager")

class AppManager:
    def __init__(self, working_dir: str, registry, on_event_callback=None):
        self.working_dir = os.path.abspath(working_dir)
        self.registry = registry
        self.on_event_callback = on_event_callback
        self.active_contexts: Dict[str, AppExecutionContext] = {}
        self.cached_apps: Dict[str, Dict[str, Any]] = {}

        # Ensure working directory exists
        os.makedirs(self.working_dir, exist_ok=True)
        self.scan_working_directory()

    def set_working_directory(self, new_path: str):
        """Allows changing the Atlas working directory."""
        if not new_path:
            return
        abs_p = os.path.abspath(new_path)
        os.makedirs(abs_p, exist_ok=True)
        self.working_dir = abs_p
        self.scan_working_directory()

    def sanitize_filename(self, name: str) -> str:
        """Requirement 4: Short name and no special characters, ends with .iot"""
        base = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', name.strip())
        if not base:
            base = "atlas_app"
        if not base.endswith(".iot"):
            base = f"{base}.iot"
        return base

    def scan_working_directory(self) -> List[Dict[str, Any]]:
        """Requirement 4: Scans working directory to discover any apps stored."""
        found_apps = []
        if not os.path.exists(self.working_dir):
            return found_apps

        for fname in os.listdir(self.working_dir):
            if fname.endswith(".iot"):
                fpath = os.path.join(self.working_dir, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        data["filename"] = fname
                        data["filepath"] = fpath
                        app_name = data.get("name", fname.replace(".iot", ""))
                        data["name"] = app_name
                        self.cached_apps[app_name] = data
                        found_apps.append(data)
                except Exception as e:
                    logger.warning(f"Error reading app file {fname}: {e}")
        return found_apps

    def save_app(self, app_def: Dict[str, Any], custom_filename: Optional[str] = None) -> Dict[str, Any]:
        """Requirement 4: SAVE APP into local file (.iot) based on working directory."""
        app_name = app_def.get("name", "app")
        filename = self.sanitize_filename(custom_filename or app_name)
        filepath = os.path.join(self.working_dir, filename)

        app_def["last_saved"] = time.time()
        app_def["filename"] = filename
        app_def["filepath"] = filepath

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(app_def, f, indent=2)

        self.cached_apps[app_def.get("name", filename)] = app_def
        logger.info(f"Saved IoT app '{app_name}' to {filepath}")
        return {
            "success": True,
            "filename": filename,
            "filepath": filepath,
            "app": app_def
        }

    def load_app(self, app_name_or_filename: str) -> Optional[Dict[str, Any]]:
        """Requirement 4: UPLOAD APP (load from working directory)."""
        # Try direct cache lookup
        if app_name_or_filename in self.cached_apps:
            return self.cached_apps[app_name_or_filename]

        # Try filename match in working directory
        filename = self.sanitize_filename(app_name_or_filename)
        filepath = os.path.join(self.working_dir, filename)
        if os.path.exists(filepath):
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                data["filename"] = filename
                data["filepath"] = filepath
                return data
        return None

    def activate_app(self, app_name: str) -> Dict[str, Any]:
        """Requirement 4: ACTIVATE app from list of apps, starts lifecycle."""
        # Find app definition
        app_def = self.load_app(app_name)
        if not app_def:
            return {"success": False, "error": f"App '{app_name}' not found."}

        # Check if already active
        if app_name in self.active_contexts:
            ctx = self.active_contexts[app_name]
            if ctx.status == "Active":
                return {"success": False, "error": f"App '{app_name}' is already Active."}

        # Create new execution context
        ctx = AppExecutionContext(app_def, self.registry, on_event=self.on_event_callback)
        self.active_contexts[app_name] = ctx
        ctx.start()

        return {
            "success": True,
            "app_name": app_name,
            "status": ctx.status,
            "start_time": ctx.start_time
        }

    def stop_app(self, app_name: str) -> Dict[str, Any]:
        """Requirement 4: STOP app execution, clean up resources, set inactive."""
        if app_name not in self.active_contexts:
            return {"success": False, "error": f"App '{app_name}' is not running."}

        ctx = self.active_contexts[app_name]
        if ctx.status == "Completed":
            return {"success": False, "error": f"App '{app_name}' has already Completed and cannot be stopped."}

        ctx.stop()
        return {
            "success": True,
            "app_name": app_name,
            "status": ctx.status
        }

    def respond_to_app(self, app_name: str, value: str) -> Dict[str, Any]:
        """Module 13 Type 4: Deliver runtime user input to an awaiting active app."""
        if app_name not in self.active_contexts:
            return {"success": False, "error": f"App '{app_name}' is not active."}
        ctx = self.active_contexts[app_name]
        ok = ctx.submit_user_input(value)
        if not ok:
            return {"success": False, "error": f"App '{app_name}' is not awaiting input."}
        return {"success": True, "app_name": app_name, "value": value}

    def delete_app(self, app_name: str) -> Dict[str, Any]:
        """Requirement 4: DELETE app from IDE and local storage."""
        # If running, stop first
        if app_name in self.active_contexts:
            ctx = self.active_contexts[app_name]
            if ctx.status == "Active":
                ctx.stop()
            del self.active_contexts[app_name]

        # Remove from disk
        app_def = self.cached_apps.get(app_name)
        filepath = None
        if app_def and "filepath" in app_def:
            filepath = app_def["filepath"]
        else:
            filepath = os.path.join(self.working_dir, self.sanitize_filename(app_name))

        if filepath and os.path.exists(filepath):
            try:
                os.remove(filepath)
            except Exception as e:
                return {"success": False, "error": f"Could not remove file: {e}"}

        if app_name in self.cached_apps:
            del self.cached_apps[app_name]

        return {"success": True, "app_name": app_name}

    def get_status_panel_summary(self) -> List[Dict[str, Any]]:
        """Returns rows for the bottom Status Panel."""
        summary = []
        for name, ctx in self.active_contexts.items():
            start_str = time.strftime("%H:%M:%S", time.localtime(ctx.start_time)) if ctx.start_time else "N/A"
            summary.append({
                "app_name": name,
                "status": ctx.status,  # "Active", "Stopped", "Completed"
                "start_time": start_str,
                "last_result": ctx.last_results,
                "can_stop": ctx.status == "Active",
                "pending_prompt": ctx.pending_prompt if ctx.status == "Active" else None,
                "last_output": ctx.last_output
            })
        return summary

