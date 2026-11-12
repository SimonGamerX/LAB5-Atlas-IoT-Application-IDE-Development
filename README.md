# Atlas 3.0 IoT Application IDE & BioComfort Guardian

**Course**: B8019 - Programming the Internet of Things (Fall 2026)  
**Professor**: Sumi Helal  
**Group Identifier**: `iotpj`  
**Presentation & Demo**: 30 November 2026 – Sala Reunione, DISI  

---

## Quick Start (One Command)

To launch the IDE:
```bash
python run_ide.py
```

Then open your browser at:
`http://localhost:5050` (or the network IP printed in the console).

---

## Project Structure

```
LAB5/
├── run_ide.py                 # Primary one-click launcher for the IDE server
├── package_submission.py      # Automated zip packager for submission
├── backend/
│   ├── atlas_core.py          # Data models (Things, Services, Relationships, Tweet Parser)
│   ├── tweet_listener.py      # UDP Multicast (232.1.1.1:1235) & MQTT tweet listeners
│   ├── app_runtime.py         # Application execution engine (Type 1-5, TCP 6668 calls)
│   ├── app_manager.py         # App storage (.iot files), lifecycle management
│   ├── mock_space.py          # Virtual VSS simulator matching Lab 4 hardware
│   └── server.py              # Web server & REST API
├── frontend/
│   ├── index.html             # Multi-tab IDE interface (Things, Services, Relationships, Apps)
│   ├── style.css              # Responsive dark theme & animations
│   ├── app.js                 # Main frontend controller & polling loop
│   ├── editor_canvas.js       # Drag-and-drop GUI flow builder + JSON editor
│   ├── relationships_graph.js # Interactive SVG topological graph
│   └── assets/                # Hardware & service SVG skins
├── apps_storage/              # Default "Atlas working directory"
│   ├── circadian_guard.iot    # Featured project: BioComfort Circadian & Hazard Guardian
│   └── lab4_demo.iot          # Baseline Lab 4 Part II automated demo application
├── presentation/
│   ├── demo_presentation.pptx # 2-minute demo slide deck
│   └── generate_demo_presentation.py
└── docs/
    └── REPORT.md              # 3-4 page final project report
```

---

## Requirements Checklist Addressed

- **Requirement 1 (Discovery)**: Multicast UDP on `232.1.1.1:1235` + MQTT HiveMQ background thread. Ingests all 5 Atlas tweet formats. Includes an animated startup freeze overlay.
- **Requirement 2 (Display)**: Shows IDE launch network address. Dedicated tabs for Things, Services (alphabetical, sensors vs. actuators), Relationships (interactive graph), and Apps.
- **Requirement 3 (IoT App Editor)**: Visual GUI flow canvas with drag-and-drop microservices from the palette, synced JSON view, Type 1-5 constructs, Clear, and Finalize operations.
- **Requirement 4 (IoT App Manager)**: Save and Upload `.iot` files from configurable Atlas working directory. Full lifecycle control (Activate, Stop, Delete) with a fixed bottom Status Panel and live trace console.
- **Deliverables**: Comprehensive report in `docs/REPORT.md`, 2-minute demo slides in `presentation/demo_presentation.pptx`, and automated packager in `package_submission.py`.

