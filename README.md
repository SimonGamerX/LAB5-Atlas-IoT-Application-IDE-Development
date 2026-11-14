# Atlas IoT IDE (Lab 5)

Visual Integrated Development Environment for the Atlas 3.0 IoT Platform.

## Quick Start

### 1. Launch with Physical Raspberry Pi (Breadboard)
Find your Raspberry Pi IP (`hostname -I` on the Pi), then run:
```bash
python run_ide.py <RPi_IP>
```
*(Example: `python run_ide.py 192.168.1.100`)*

### 2. Launch with Simulator (Offline / Testing)
```bash
python run_ide.py
```

Then open your browser at:
```
http://localhost:5050
```

---

## Tabs Overview (4 Core Tabs)

### 1. 📟 Things
- Shows connected Raspberry Pi 4B hardware info, IP:port, OS, owner, and hosted entities.

### 2. ⚡ Services & Functionalities
- **Scaled Functionalities & Parameters Table**: Lists all microservices with signatures, categories, hardware entities, expected input parameters (e.g. `state: int (1=ON, 0=OFF)` vs `None ()`), output types, and descriptions.
- **Direct Breadboard Triggers**:
  - `[👁 Read Light]` (shows live light level percentage from ADS1115 LDR)
  - `[🌡 Read Temp]` (shows live temperature dial in °C from Rotary Encoder)
  - `[🔴 ON]` / `[⚪ OFF]` (controls physical Red Alarm LED on GPIO 16)
  - `[🟢 ON]` / `[⚪ OFF]` (controls physical Green Cooling LED on GPIO 12)
- Filter by All, Sensor-type, or Actuator-type.

### 3. 🕸 Relationships
- Discovered space relationships (Order-based dependencies and Condition-based rules) with source $\rightarrow$ target mapping and categories.

### 4. 🧩 Apps & Editor
- **Left Sidebar**: Saved applications (`CircadianComfortGuard`, `Lab4DemoApp`), + New App, Upload, and construct buttons (`+ Type 1`, `+ Type 2`, `+ Type 3`).
- **Center Canvas**: Interactive visual workflow pipeline builder with looping toggle and save/finalize to `.iot`.
- **Right Console**: Relative real-time execution status table (`ACTIVE`, `STOPPED`, `COMPLETED`) and live execution trace logs.
