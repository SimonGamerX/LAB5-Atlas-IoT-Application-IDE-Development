# Atlas IoT IDE (Lab 5)

Visual Integrated Development Environment for the Atlas 3.0 IoT Platform.

## Quick Start

### 1. Launch with Physical Raspberry Pi (Breadboard)
Find your Raspberry Pi IP (`hostname -I` on the Pi), ensure `./Atlas` is running on the Pi, then run:
```bash
python run_ide.py <RPi_IP>
```
*(Example: `python run_ide.py 192.168.1.50`)*

### 2. Launch with Simulator (Offline / Testing)
```bash
python run_ide.py
```

Then open your browser at:
```
http://localhost:5050
```

---

## Tabs Overview

### 📟 Things
- **Two Raspberry Pis Listed**:
  - **SmartSpacePi-01 (Primary Breadboard Controller)**: Hosts ADS1115 LDR light sensor, rotary dial temperature sensor, Red Alert LED (GPIO 16), and Green Cooling LED (GPIO 12).
  - **SmartSpacePi-02 (Secondary Edge Gateway & Aux Node)**: Hosts indoor humidity sensor (DHT22) and secondary audible alert buzzer (GPIO 18).
- Complete metadata (ATID, IP:Port, Model, OS, Owner, Vendor, hosted entities) with live node ping test buttons.

### ⚡ Services & Functionalities
- **Scaled Functionalities & Parameters Table**: Lists microservices for each Thing with Owning Thing tag, method signatures, categories, hardware entities, input parameters, and output types.
- **Direct Breadboard Action Controls**:
  - `[👁 Read Light]` (shows live light level percentage from ADS1115 LDR)
  - `[🌡 Read Temp]` (shows live temperature dial in °C from Rotary Encoder)
  - `[💧 Read Humidity]` (shows live humidity percentage)
  - `[🔴 ON]` / `[⚪ OFF]` (controls physical Red Alarm LED on GPIO 16)
  - `[🟢 ON]` / `[⚪ OFF]` (controls physical Green Cooling LED on GPIO 12)
  - `[📢 ON]` / `[⚪ OFF]` (controls secondary alert buzzer)

### 🕸 Relationships
- **Topological Dependency Graph**: Interactive SVG visualization with directed cubic-bezier curves, glowing links, and pill expression labels connecting First Service (FS) to Second Service (SS) across both RPis:
  - 🟦 **Order-based dependencies** (e.g. `Read_Temperature` $\rightarrow$ `Set_Cooling_Indicator`, `Set_Alarm_LED` $\rightarrow$ `Set_Buzzer_Alert`)
  - 🟨 **Condition-based rules** (e.g. `Light < 15%`, `Temp > 28°C`, `Humidity > 75% RH`)
- Interactive hover effects highlighting linked nodes and displaying live inspection details.
- Relationship Descriptors Catalog cards underneath the graph.

### 🧩 Apps & Editor
- **Left Sidebar**: Saved applications (`CircadianComfortGuard`, `Lab4DemoApp`), + New App, Upload, and construct buttons (`+ Type 1`, `+ Type 2`, `+ Type 3`).
- **Center Canvas**: Interactive visual workflow pipeline builder with looping toggle and save/finalize to `.iot`.
- **Right Console**: Relative real-time execution status table (`ACTIVE`, `STOPPED`, `COMPLETED`) and live execution trace logs.
