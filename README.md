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

Everything is visible and controllable on one screen without switching tabs:

### 1. ABOVE: Smart Space Functionalities & Hardware Controls
- **Target Hardware Bar**: Enter your Raspberry Pi IP, select port (`6668` for Atlas Middleware or `8080` for Lab 4 Part 1), and click **⚡ Test Breadboard**.
- **Connected Thing**: Shows Raspberry Pi 4B hardware info, IP:port, and hosted entities.
- **Offered Microservices**: Direct interactive buttons to actuate your physical breadboard:
  - **🔴 Turn Red LED ON** / **⚪ Turn OFF**
  - **🟢 Turn Green LED ON** / **⚪ Turn OFF**
  - **👁 Read LDR** (shows live light level percentage)
  - **🌡 Read Temp** (shows live dial temperature in °C)
- **Space Relationships**: Displays discovered Order-based and Condition-based rules.

### 2. UNDER: IoT Application IDE & Relative Console
- **Left**: Saved `.iot` applications (`CircadianComfortGuard`, `Lab4DemoApp`) and construct buttons (`+ Type 1`, `+ Type 2`, `+ Type 3`).
- **Center**: Visual workflow canvas where steps are arranged, edited, and finalized into `.iot` files.
- **Right**: Relative execution console showing running applications, active statuses, and real-time execution trace logs.
