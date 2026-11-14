# Lab 5 Project Memory & Context: Atlas IoT IDE & BioComfort Guardian

**Course**: B8019 - Programming the Internet of Things (Fall 2026)  
**Instructor**: Professor Sumi Helal  
**Teaching Assistant**: Junjie Li (`lijunjie@ufl.edu`)  
**Group Identifier**: `iotpj`  
**Submission Due Date**: 11:00 AM, 30 November 2026 (OneDrive link emailed)  
**Presentations & Live Demos**: 4:30 PM – 7:30 PM, 30 November 2026 – Sala Reunione, DISI  
**Workspace**: `c:\Users\Withe\OneDrive\Desktop\LAB5`  

---

## 1. Project Overview & Evolution from Lab 4

In **Lab 4**, the group built:
- **Part One**: A minimalist command-line/edge orchestrator communicating with C/C++ services on a Raspberry Pi 4B over HTTP.
- **Part Two**: An XML-based IoT-DDL deployed on the official C++ Atlas Thing Middleware (`https://github.com/NickLiJunjie/AtlasThingMiddleware_RPI.git`), invoking microservices via unicast JSON on TCP port `6668`.

In **Lab 5 (Group Project)**, the platform transitions to a complete, realistic, user-friendly **Atlas 3.0 IoT Application IDE** that automates discovery, graphical relationship modeling, visual drag-and-drop workflow authoring, and runtime lifecycle management.

---

## 2. The 4 Professor Requirements & Implementation

### Requirement 1: Discovery of Available Atlas IoT Things
- **Two Raspberry Pi Nodes Listed**:
  - `SmartSpacePi-01` (`MySmartThing01`): Primary controller for the illumination and emergency alert subsystem, hosting `LightSensor` (ADS1115 CH0 LDR) and Red `AlarmLED` (GPIO 16).
  - `SmartSpacePi-02` (`MySmartThing02`): Secondary controller for climate monitoring and cooling subsystem, hosting `TempSensor` (Rotary Encoder GPIO 20/21) and Green `CoolingLED` (GPIO 12).
- **Background Scanning Engine**: Implemented in `backend/tweet_listener.py`. Runs independent daemon threads listening on:
  - **UDP Multicast**: Group `232.1.1.1` on port `1235`.
  - **MQTT Public Broker**: `broker.hivemq.com:1883`, subscribed to topic `/Atlas/#`.
- **Tweet Parsers**: Thread-safe ingestion into `SmartSpaceRegistry` (`backend/atlas_core.py`) parsing five tweet types:
  1. `Identity_Thing`: Thing ID, Space ID, Name, Model, Vendor, Owner, OS, Description.
  2. `Identity_Language`: Thing ID, IP address, Port (`6668`), Communication Language (`JSON/TCP`).
  3. `Identity_Entity`: Entity ID, Name, Category, Type (`Sensor`, `Actuator`), Owner, Vendor.
  4. `Service`: Service Name, API signature, Entity ID, Type (`Report`, `Action`), Category (`Sensing`, `Actuation`), Keywords.
  5. `Relationship`: Name, Type (`Order-based`, `Condition-based`), First Service (`FS name`), Second Service (`SS name`), Description.
- **Startup "Freeze" Splash**: As suggested by the professor, the UI displays an animated scanning screen that blocks premature interactions until space metadata is learned (or user dismisses).

### Requirement 2: Display Space Meta Information & Unified Interface
- **Tabs Architecture (No Numbers in Titles)**:
  - `📟 Things`: Displays both Raspberry Pi 4B nodes side-by-side with complete network identity, communication language, hosted entities, and direct ping node test buttons.
  - `⚡ Services & Functionalities`: Scaled table listing all microservices across both Things with Owning Thing tag, signatures, input parameters, output types, and direct breadboard triggers (`[🔴 ON]`, `[⚪ OFF]`, `[👁 Read Light]`, `[🌡 Read Temp]`, `[🟢 ON]`).
  - `🕸 Relationships`: Features an **interactive SVG Topological Dependency Graph** displaying directed cubic-bezier curves connecting First Service (FS) to Second Service (SS) across both RPis, with color-coded Order-based and Condition-based links and pill labels, plus detailed relationship descriptor cards.
  - `🧩 Apps & Editor`: Visual workflow pipeline builder alongside the relative real-time execution console.

### Requirement 3: IoT Application Editor
- **Hybrid Interface**: Visual Drag & Drop Canvas (`frontend/editor_canvas.js`) synced bi-directionally with a code/JSON editor.
- **Supported Constructs**:
  - **Type 1 (Sequential)**: $\{S_1 \rightarrow S_2 \rightarrow \dots \rightarrow S_n\}$ executed in order.
  - **Type 2 (Order-based)**: Executes $S_B$ only if $S_A$ runs successfully to completion.
  - **Type 3 (Condition-based)**: Evaluates comparison operators ($>$, $<$, $==$, $!=$, $\ge$, $\le$) on the return value of $S_A$ before dispatching $S_B$.
  - **Type 4 (Interactions)**: Prompts and user-facing notifications.
  - **Type 5 (Compound Logical)**: Evaluates boolean `AND` / `OR` gates over multiple sensor outputs (e.g., `Light < 15% AND Temp > 32°C`).
  - **Looping**: Configurable continuous cycle execution with user-defined interval.
- **Operations**:
  - **Clear**: Resets the canvas.
  - **Finalize**: Validates the composition, prompts for a short name, serializes to `.iot`, and registers it in the Apps Tab.

### Requirement 4: IoT App Manager & Runtime Lifecycle
- **Working Directory**: Scans the configurable "Atlas working directory" (`apps_storage/`) on startup and upon configuration changes.
- **File Format**: Standardized JSON with mandatory `.iot` extension (sanitizes filenames, strips illegal characters).
- **Core Operations**:
  - **SAVE APP**: Saves local `.iot` descriptor file into working directory.
  - **UPLOAD APP**: Loads saved `.iot` files into the editor (via double-click or file upload).
  - **ACTIVATE**: Launches non-blocking thread (`AppExecutionContext`), tracking start time and dispatching TCP 6668 calls.
  - **STOP**: Gracefully halts execution lifecycle, triggers clean-up, updates status to `Stopped`. Auto-finishing apps mark `Completed`.
  - **DELETE**: Removes the application from the UI and deletes the `.iot` file from disk.
- **Bottom Status Panel**: Fixed to viewport bottom, reporting App Name, Start Time, State (`Active` [green pulse], `Stopped` [gray], `Completed` [blue]), and a collapsible **Live Trace Console** displaying step latency and return values.

---

## 3. Project Idea & Demonstration: "BioComfort Circadian & Hazard Guardian"

### The Novel Concept
Instead of naive isolated thresholding (*"turn fan on if temperature $> 28^\circ\text{C}$"*), this project couples human photobiology and emergency vigilance:
1. **Circadian Vigilance Coupling**:
   - In low ambient light ($< 25\%$, night shifts/studying), warmth induces lethargy and drowsiness.
   - The cooling threshold dynamically tightens to keep air circulating and prevent cognitive fatigue.
2. **Compound Nocturnal Hazard (Type 5 Construct)**:
   - Rule: $\text{IF } (\text{Read\_Light\_Level}() < 15\%) \;\mathbf{AND}\; (\text{Read\_Temperature}() > 32^\circ\text{C}) \implies \mathbf{Set\_Alarm\_LED}(1)$.
   - Pitch-black darkness combined with elevated temperature indicates a fire, overheating appliance, or infant incubator malfunction.
   - Activates **Red Alarm LED** and forces **Green Cooling LED** to maximum ventilation.
3. **Safety Verification (Type 2 Construct)**:
   - Order-based rule confirms the actuator was successfully reached after setpoint reads.

### Hardware Mapping (Lab 4 Components)
| Component | Hardware / Pin | Atlas Service | Application Role |
| :--- | :--- | :--- | :--- |
| **ADS1115 ADC CH0** | Photoresistor (LDR) | `Read_Light_Level()` | Ambient light sensing ($0\text{--}100\%$) |
| **KY-040 Rotary Encoder** | GPIO 20 & 21 | `Read_Temperature()` | Simulated thermostat dial ($15\text{--}45^\circ\text{C}$) |
| **Red LED** | GPIO 16 (220 $\Omega$) | `Set_Alarm_LED()` | Urgent alert / Fire & Hazard indicator |
| **Green LED** | GPIO 12 (220 $\Omega$) | `Set_Cooling_Indicator()` | Circadian comfort cooling / fan indicator |

---

## 4. Directory & File Reference

```
c:\Users\Withe\OneDrive\Desktop\LAB5\
├── run_ide.py                          # Main one-click launcher for the IDE server
├── README.md                           # Quick start guide
├── Memory.md                           # This persistent memory and context file
├── guides/                             # Official assignment guides & lecture slides
│   ├── group_project Fall 2026.pdf     # Professor Sumi Helal's project specification
│   └── Module 13 Atlas IoT IDE Project.pptx # Lecture slides & IDE concepts
├── apps_storage/                       # Default "Atlas working directory"
│   ├── circadian_guard.iot             # BioComfort Circadian & Hazard Guardian app
│   └── lab4_demo.iot                   # Baseline Lab 4 Part II demo app
├── backend/
│   ├── atlas_core.py                   # Data models (Thing, Entity, Service, Relationship, SpaceRegistry)
│   ├── tweet_listener.py               # UDP Multicast (232.1.1.1:1235) & MQTT listeners
│   ├── app_runtime.py                  # Type 1-5 execution engine & TCP 6668 service invoker
│   ├── app_manager.py                  # Working directory scanner, save, upload, activate, stop, delete
│   ├── mock_space.py                   # Mock Atlas Thing TCP server (port 6668) & Lab 4 tweets
│   └── server.py                       # Threaded HTTP & REST API server
├── frontend/
│   ├── index.html                      # Multi-tab layout (Things, Services, Relationships, Apps, Tweets)
│   ├── style.css                       # Responsive dark-theme styling, animations, status bar
│   ├── app.js                          # Main frontend controller & polling loop
│   ├── editor_canvas.js                # Drag-and-drop flow builder & JSON editor
│   ├── relationships_graph.js          # SVG topological relationships graph
│   └── assets/                         # SVG skins (rpi4, sensor_light, sensor_temp, actuator_alarm, actuator_fan, app_icon)
├── presentation/
│   ├── demo_presentation.pptx          # 2-minute demo slide deck for Nov 30 presentation
│   └── generate_demo_presentation.py   # Script to regenerate presentation deck
└── docs/
    └── REPORT.md                       # 3-4 page final project report for submission
```

---

## 5. Execution Commands Reference

### Launch with Physical Raspberry Pi (Breadboard)
```powershell
cd c:\Users\Withe\OneDrive\Desktop\LAB5
python run_ide.py <RPi_IP>
```
*(Example: `python run_ide.py 192.168.1.100`)*

### Launch with Simulator (Offline / Testing)
```powershell
cd c:\Users\Withe\OneDrive\Desktop\LAB5
python run_ide.py
```
- Access locally: `http://localhost:5050`
- Access on LAN: `http://<YOUR_LOCAL_IP>:5050`

### Direct Breadboard Verification
1. Click **⚡ Test Breadboard** in the top bar to verify network connection and round-trip latency.
2. Go to the **Services** tab and click **🔴 Turn Red LED ON** or **🟢 Turn Green LED ON** to test hardware actuation directly.

### Package Final Submission ZIP
```powershell
python package_submission.py
```
- Outputs: `Atlas_IoT_IDE_GroupProject_Submission.zip` (ready for OneDrive upload and email).

### Regenerate Demo Presentation Slides
```powershell
python presentation/generate_demo_presentation.py
```
- Outputs: `presentation/demo_presentation.pptx` (16:9 widescreen layout with dark theme, 5 slides).

---

## 6. Demo Day Checklist (30 November 2026 – Sala Reunione, DISI)

1. **Pre-Demo Setup**:
   - Verify Raspberry Pi 4B is booted and connected to same WiFi network (or use built-in simulator toggle for zero-risk presentation).
   - Ensure `python run_ide.py` is running in terminal.
2. **2-Minute Presentation Sequence**:
   - **Slide 1**: Title, Group `iotpj`, Prof. Sumi Helal.
   - **Slide 2**: Architecture & 4 Core Requirements.
   - **Slide 3**: BioComfort Circadian & Hazard Guardian Concept.
   - **Slide 4**: Live Demo 4-step walkthrough.
3. **Live Demonstration Flow**:
   - Show **Things Tab** with RPi4 metadata and hosted entities.
   - Show **Services Tab** with Sensor/Actuator categorization and test modal.
   - Show **Relationships Tab** with interactive SVG graph.
   - Open **Apps Tab**, double-click `CircadianComfortGuard`, highlight Type 1, 2, 3, and 5 rules.
   - Click **Run** and observe green pulsing dot, start timestamp, and live TCP latency logs in the bottom status panel.

