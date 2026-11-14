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
  - **SmartSpacePi-01 (Primary Controller - Light & Alarm Subsystem)**:
    - ATID: `MySmartThing01`
    - Hosted Hardware Entities: `LightSensor` (ADS1115 CH0 Analog Light Sensor), `AlarmLED` (Red LED on GPIO 16).
    - Hosted Services: `Read_Light_Level`, `Set_Alarm_LED`.
  - **SmartSpacePi-02 (Secondary Controller - Climate & Cooling Subsystem)**:
    - ATID: `MySmartThing02`
    - Hosted Hardware Entities: `TempSensor` (Rotary Dial on GPIO 20/21), `CoolingLED` (Green LED on GPIO 12).
    - Hosted Services: `Read_Temperature`, `Set_Cooling_Indicator`.
- Complete metadata (ATID, IP:Port, Model, OS, Owner, Vendor, hosted entities) with live node ping test buttons.

### ⚡ Services & Functionalities
- **Scaled Functionalities & Parameters Table**: Lists microservices for each Thing with Owning Thing tag, method signatures, categories, hardware entities, input parameters, and output types.
- **Direct Breadboard Action Controls**:
  - `[👁 Read Light]` (shows live light level percentage from ADS1115 LDR on RPi 1)
  - `[🌡 Read Temp]` (shows live temperature dial in °C from Rotary Encoder on RPi 2)
  - `[🔴 ON]` / `[⚪ OFF]` (controls physical Red Alarm LED on GPIO 16 on RPi 1)
  - `[🟢 ON]` / `[⚪ OFF]` (controls physical Green Cooling LED on GPIO 12 on RPi 2)

### 🕸 Relationships
- **Dynamic Application & Space Topological Dependency Graph**:
  - **Dynamic Generation from Apps & Editor**: Automatically generates the interactive topological SVG dependency graph directly from the application currently loaded or composed in the **Apps & Editor** tab.
  - **Construct Mapping**:
    - 🟦 **Order-based dependencies** (Type 2 steps: e.g. `Read_Temperature` $\rightarrow$ `Set_Cooling_Indicator` on success)
    - 🟨 **Condition-based rules** (Type 3 steps: e.g. `Temp > 27°C`, `Light < 20%`, and cross-thing hazard `Temp > 35°C`)
    - 🟪 **Sequential transitions** (Type 1 steps: step transitions $S_1 \rightarrow S_2$)
    - 🟩 **Loop cycle** (when continuous looping is enabled: returns from final actuator back to source sensor)
  - **Dual Source Switcher**:
    - `[⚡ App Graph: <AppName>]`: Live dynamic topology generated from the editor canvas with active node badges (`● In App`) and idle node dimming.
    - `[🪐 Discovered Space Graph]`: The underlying Atlas Smart Space specification discovered via IoT-DDL tweets.
  - **Interactive Features**: Hovering over edges or nodes highlights dependencies with glowing paths and opens detailed inspection in the details bar; dynamic relationship cards below update automatically.
  - **Real-Time Synchronization**: Any addition, deletion, parameter change, or app switch in the Apps & Editor section immediately updates the graph.

### 🧩 Apps & Editor
- **Left Sidebar**: Saved applications (`CircadianComfortGuard`, `Lab4DemoApp`), + New App, Upload, and construct buttons (`+ Type 1`, `+ Type 2`, `+ Type 3`).
- **Center Canvas**: Interactive visual workflow pipeline builder with looping toggle and save/finalize to `.iot`.
- **Right Console**: Relative real-time execution status table (`ACTIVE`, `STOPPED`, `COMPLETED`) and live execution trace logs.
