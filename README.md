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

## Unified Dashboard Layout (Single-View)

Everything is visible and controllable on one screen:

### 1. ABOVE: Smart Space Functionalities & Parameters
Full-width table listing all hardware functionalities with their exact signatures, expected parameters, and live breadboard action buttons:
- **`Read_Light_Level`**: Sensor (ADS1115 CH0) | Inputs: `None ()` | Output: `int (0-100%)` | `[👁 Read Light]`
- **`Read_Temperature`**: Sensor (Rotary Encoder) | Inputs: `None ()` | Output: `int (15-45 °C)` | `[🌡 Read Temp]`
- **`Set_Alarm_LED`**: Actuator (Red LED GPIO 16) | Inputs: `state: int (1=ON, 0=OFF)` | Output: `void` | `[🔴 ON]` `[⚪ OFF]`
- **`Set_Cooling_Indicator`**: Actuator (Green LED GPIO 12) | Inputs: `state: int (1=ON, 0=OFF)` | Output: `void` | `[🟢 ON]` `[⚪ OFF]`

### 2. UNDER: IoT Application IDE & Relative Console
- **Left Sidebar**: Saved applications (`CircadianComfortGuard`, `Lab4DemoApp`), + New App, Upload, and construct buttons (`+ Type 1`, `+ Type 2`, `+ Type 3`).
- **Center Canvas**: Interactive visual workflow pipeline builder to arrange steps, configure thresholds, and save to `.iot`.
- **Right Console**: Real-time monitor displaying active application status (`ACTIVE`, `STOPPED`, `COMPLETED`), start times, and live execution trace logs.
