/**
 * Atlas IoT Application IDE - 4 Tabs Controller
 * Course: B8019 Programming the Internet of Things
 */

document.addEventListener("DOMContentLoaded", () => {
  let spaceData = null;
  let appEditor = new IoTAppEditor();
  let currentFilter = "all";
  let currentGraphSource = "app"; // "app" (dynamic from editor) or "space" (static from tweets)
  let cachedAppEdges = [];

  // Whenever editor contents change, notify graph if viewing app source
  appEditor.setOnChange((appDef) => {
    const appNameEl = document.getElementById("lblActiveAppName");
    if (appNameEl) appNameEl.textContent = appDef.name || "CustomApp";
    if (currentGraphSource === "app") {
      renderRelationships();
    }
  });

  // Tab switching
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      const target = document.getElementById(tab.dataset.tab);
      if (target) target.classList.add("active");
      if (tab.dataset.tab === "tab-relationships") {
        renderRelationships();
      }
    });
  });

  // Services filter buttons
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      renderFunctionalitiesTable();
    });
  });

  // Hardware Target Controls
  const selTargetMode = document.getElementById("selTargetMode");
  const inputRpiIp = document.getElementById("inputRpiIp");
  const selRpiPort = document.getElementById("selRpiPort");
  const btnConnectHw = document.getElementById("btnConnectHw");
  const btnTestHw = document.getElementById("btnTestHw");
  const hwStatusFeedback = document.getElementById("hwStatusFeedback");

  function updateTargetModeUI() {
    const isSim = selTargetMode.value === "sim";
    inputRpiIp.disabled = isSim;
    selRpiPort.disabled = isSim;
    btnTestHw.disabled = isSim;
    if (isSim) {
      hwStatusFeedback.textContent = "Simulator Mode Active (Local Mock)";
      hwStatusFeedback.className = "hw-feedback ok";
    } else {
      hwStatusFeedback.textContent = `Target: ${inputRpiIp.value}:${selRpiPort.value}`;
      hwStatusFeedback.className = "hw-feedback";
    }
  }

  selTargetMode?.addEventListener("change", async () => {
    updateTargetModeUI();
    const isSim = selTargetMode.value === "sim";
    await fetch("/api/target/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ip: inputRpiIp.value.trim() || "127.0.0.1",
        port: parseInt(selRpiPort.value) || 6668,
        simulator: isSim
      })
    });
    fetchSpace();
  });

  const btnAutoDetect = document.getElementById("btnAutoDetect");

  btnAutoDetect?.addEventListener("click", async () => {
    hwStatusFeedback.textContent = "Scanning local network for Raspberry Pi...";
    hwStatusFeedback.className = "hw-feedback";
    try {
      const resp = await fetch("/api/target/scan");
      const data = await resp.json();
      if (data.detected && data.detected.length > 0) {
        const found = data.detected[0];
        inputRpiIp.value = found.ip;
        hwStatusFeedback.innerHTML = `<span style="color:#34d399;">✓ Raspberry Pi detected at ${found.ip} (MAC: ${found.mac})</span>`;
      } else {
        hwStatusFeedback.textContent = "No Raspberry Pi found automatically. Please enter IP manually.";
      }
    } catch (e) {
      hwStatusFeedback.textContent = `Scan failed: ${e}`;
    }
  });

  btnConnectHw?.addEventListener("click", async () => {
    const ip = inputRpiIp.value.trim();
    const port = parseInt(selRpiPort.value) || 6668;
    if (!ip) {
      alert("Please enter the Raspberry Pi IP address.");
      return;
    }
    hwStatusFeedback.textContent = `Connecting to ${ip}:${port}...`;
    hwStatusFeedback.className = "hw-feedback";

    const res = await fetch("/api/target/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip, port, simulator: false })
    });
    const d = await res.json();
    if (d.success) {
      hwStatusFeedback.textContent = `Target set: ${ip}:${port}. Testing connection...`;
      fetchSpace();
      btnTestHw?.click();
    }
  });

  btnTestHw?.addEventListener("click", async () => {
    const ip = inputRpiIp.value.trim();
    const port = parseInt(selRpiPort.value) || 6668;
    hwStatusFeedback.textContent = `⚡ Running breadboard boot self-test on ${ip}:${port}...`;
    hwStatusFeedback.className = "hw-feedback";

    try {
      const res = await fetch("/api/target/selftest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, port })
      });
      const d = await res.json();
      if (d.success && d.results) {
        const r = d.results;
        const msg = `✅ Breadboard Verified! Red LED: ${r.red_led ? 'OK' : 'ERR'} | Green LED: ${r.green_led ? 'OK' : 'ERR'} | Light: ${r.light}% | Temp: ${r.temp}°C`;
        hwStatusFeedback.textContent = msg;
        hwStatusFeedback.className = "hw-feedback ok";
        alert(`✓ Breadboard Self-Test Succeeded!\n\n1. Red Alert LED (GPIO 16): Flashed\n2. Green Cooling LED (GPIO 12): Flashed\n3. Ambient Light (ADS1115 CH0): ${r.light}%\n4. Thermostat Dial (Rotary GPIO 20/21): ${r.temp}°C\n\nActive Server Port: ${d.active_port}`);
        fetchSpace();
      } else {
        hwStatusFeedback.innerHTML = `<span style="color:#f87171;">❌ No server running on Pi ${ip}!</span>`;
        alert(`❌ Could not connect to Raspberry Pi at ${ip}:${port}!\n\nThe Pi is reachable, but neither Atlas (port 6668) nor rpi_service_server (port 8080) is currently running.\n\nTo start the middleware on your Raspberry Pi, open a terminal on the Pi and run:\n\ncd ~/LAB4-Microservices-Architecture/PartTwo/AtlasThingMiddleware_RPI\n./Atlas\n\n(or for Lab 4 Part 1: cd ~/LAB4-Microservices-Architecture/PartOne/rpi_server && ./rpi_service_server RPi 8080)`);
      }
    } catch (e) {
      hwStatusFeedback.textContent = `❌ Network Error: ${e}`;
      hwStatusFeedback.className = "hw-feedback err";
    }
  });

  // Editor Actions
  document.getElementById("btnNewApp")?.addEventListener("click", () => appEditor.clear());
  document.getElementById("btnClearEditor")?.addEventListener("click", () => {
    if (confirm("Clear editor canvas?")) appEditor.clear();
  });

  // Save App
  document.getElementById("btnSaveApp")?.addEventListener("click", async () => {
    const appDef = appEditor.getAppDefinition();
    const resp = await fetch("/api/apps/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app: appDef, filename: appDef.name })
    });
    const res = await resp.json();
    if (res.success) {
      alert(`Application saved to ${res.filename}!`);
      loadSavedApps();
    }
  });

  // Finalize App
  document.getElementById("btnFinalizeApp")?.addEventListener("click", async () => {
    const appDef = appEditor.getAppDefinition();
    if (!appDef.name) {
      alert("Please provide an App Name.");
      return;
    }
    if (!appDef.steps || appDef.steps.length === 0) {
      alert("Cannot finalize an empty application. Add at least one step.");
      return;
    }
    const resp = await fetch("/api/apps/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app: appDef, filename: appDef.name })
    });
    const res = await resp.json();
    if (res.success) {
      alert(`✓ Application '${appDef.name}' finalized and saved as .iot file!`);
      loadSavedApps();
    }
  });

  // Upload App File
  const fileInput = document.getElementById("fileAppUpload");
  document.getElementById("btnUploadAppFile")?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        appEditor.loadApp(data);
        alert(`Loaded '${data.name || file.name}' into editor.`);
      } catch (err) {
        alert("Invalid .iot JSON file.");
      }
    };
    reader.readAsText(file);
  });

  // Clear Logs
  document.getElementById("btnClearLogs")?.addEventListener("click", () => {
    document.getElementById("traceBody").innerHTML = '<div class="log-welcome">Console cleared.</div>';
  });

  // -------------------------------------------------------------
  // Data Fetching & Rendering
  // -------------------------------------------------------------
  async function fetchSpace() {
    try {
      const r = await fetch("/api/space");
      spaceData = await r.json();

      document.getElementById("metaSpaceId").textContent = spaceData.space_id;
      if (spaceData.meta) {
        document.getElementById("metaNetworkAddr").textContent = spaceData.meta.ide_network_address;
        if (spaceData.meta.target_ip && spaceData.meta.target_ip !== "127.0.0.1") {
          inputRpiIp.value = spaceData.meta.target_ip;
          selRpiPort.value = String(spaceData.meta.target_port || 6668);
          selTargetMode.value = "real";
          updateTargetModeUI();
        }
      }

      // Update Tab Counts safely if present
      const cT = document.getElementById("countThings");
      if (cT) cT.textContent = spaceData.counts.things;
      const cS = document.getElementById("countServices");
      if (cS) cS.textContent = spaceData.counts.services;
      const cR = document.getElementById("countRelationships");
      if (cR) cR.textContent = spaceData.counts.relationships;

      renderThings();
      renderFunctionalitiesTable();
      appEditor.setServices(spaceData.services);
      renderRelationships();
    } catch (e) {
      console.warn("Could not fetch space data:", e);
    }
  }

  // TAB: Render Things (Lists both Raspberry Pis)
  function renderThings() {
    const grid = document.getElementById("thingsGrid");
    if (!grid || !spaceData) return;
    grid.innerHTML = "";

    const things = spaceData.things || [];
    if (things.length === 0) {
      grid.innerHTML = "<p style='color:#64748b; padding:20px;'>No Atlas Smart Things registered yet.</p>";
      return;
    }

    things.forEach((thing, idx) => {
      const isThing1 = thing.thing_id === "MySmartThing01";
      const card = document.createElement("div");
      card.className = "thing-card";

      const entities = (spaceData.entities || []).filter(e => e.thing_id === thing.thing_id);
      const tags = entities.map(e => {
        const isSens = (e.entity_type || "").toLowerCase().includes("sensor");
        return `<span class="entity-tag ${isSens ? 'sensor' : 'actuator'}">${isSens ? '👁' : '⚡'} ${e.name} <small>(${e.entity_type})</small></span>`;
      }).join("");

      const roleTitle = isThing1 ? "Primary Controller (Light & Alarm Subsystem)" : "Secondary Controller (Climate & Cooling Subsystem)";
      const roleBadgeClass = isThing1 ? "" : "aux";
      const resSpanId = `ping_res_${thing.thing_id}`;

      card.innerHTML = `
        <div class="thing-card-header">
          <img src="assets/rpi4.svg" alt="RPi" class="thing-avatar">
          <div class="thing-title">
            <h3>
              ${thing.name}
              <span class="thing-role-badge ${roleBadgeClass}">${roleTitle}</span>
            </h3>
            <div class="thing-id-tag">ATID: ${thing.thing_id} &bull; Space: ${thing.space_id || 'MySmartSpace'}</div>
          </div>
          <span class="thing-status-pill"><span class="dot"></span> ONLINE</span>
        </div>
        <table class="thing-meta-table">
          <tr><td>Target Address:</td><td><strong>${thing.ip}:${thing.port}</strong></td></tr>
          <tr><td>Hardware Model:</td><td>${thing.model || 'Raspberry Pi 4 Model B (4GB)'}</td></tr>
          <tr><td>Operating System:</td><td>${thing.os || 'Raspbian GNU/Linux 11 (bullseye)'}</td></tr>
          <tr><td>Protocol / Language:</td><td>JSON / TCP (Port ${thing.port})</td></tr>
          <tr><td>Owner / Vendor:</td><td>${thing.owner || 'iotpj'} / ${thing.vendor || 'RaspberryPiCo'}</td></tr>
        </table>
        <div>
          <div style="font-size:0.75rem; color:#94a3b8; margin-bottom:5px; font-weight:600;">Hosted Hardware Entities (${entities.length}):</div>
          <div class="entities-tags">${tags || '<span style="color:#64748b;">No entities registered</span>'}</div>
        </div>
        <div class="thing-card-footer">
          <button class="btn btn-secondary btn-xs" onclick="pingThingNode('${thing.thing_id}', '${thing.ip}', ${thing.port}, '${resSpanId}')">
            ⚡ Ping / Test Node
          </button>
          <span id="${resSpanId}" class="thing-ping-res">Ready</span>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  // TAB: Render Functionalities Table with Owning Thing column
  function renderFunctionalitiesTable() {
    const tbody = document.getElementById("functionalitiesTableBody");
    if (!tbody || !spaceData) return;
    tbody.innerHTML = "";

    const allSrv = spaceData.services || [];
    const sensors = allSrv.filter(s => s.is_sensor);
    const actuators = allSrv.filter(s => s.is_actuator);

    const elAll = document.getElementById("numAllServices");
    if (elAll) elAll.textContent = allSrv.length;
    const elSens = document.getElementById("numSensors");
    if (elSens) elSens.textContent = sensors.length;
    const elAct = document.getElementById("numActuators");
    if (elAct) elAct.textContent = actuators.length;

    const filtered = allSrv.filter(s => {
      if (currentFilter === "sensor") return s.is_sensor;
      if (currentFilter === "actuator") return s.is_actuator;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#64748b; padding:20px;">No microservices match filter.</td></tr>';
      return;
    }

    filtered.forEach(s => {
      const isSensor = s.is_sensor;
      let icon = "assets/app_icon.svg";
      let entityName = s.entity_id || "Hardware";
      let params = "None ()";
      let outputType = "void";
      let actionButtons = "";

      if (s.name.includes("Light")) {
        icon = "assets/sensor_light.svg";
        entityName = "LightSensor (ADS1115 CH0)";
        params = "None ()";
        outputType = "int (0 - 100%)";
        actionButtons = `
          <div class="func-action-box">
            <button class="btn btn-primary btn-xs" onclick="callHwService('${s.name}', '()', 'disp_val_Light')">👁 Read Light</button>
            <span id="disp_val_Light" class="func-val-display">—</span>
          </div>`;
      } else if (s.name.includes("Temp")) {
        icon = "assets/sensor_temp.svg";
        entityName = "TempSensor (Rotary Dial GPIO 20/21)";
        params = "None ()";
        outputType = "int (15 - 45 °C)";
        actionButtons = `
          <div class="func-action-box">
            <button class="btn btn-primary btn-xs" onclick="callHwService('${s.name}', '()', 'disp_val_Temp')">🌡 Read Temp</button>
            <span id="disp_val_Temp" class="func-val-display">—</span>
          </div>`;
      } else if (s.name.includes("Alarm")) {
        icon = "assets/actuator_alarm.svg";
        entityName = "AlarmLED (Red LED GPIO 16)";
        params = "state: int (1 = ON, 0 = OFF)";
        outputType = "void";
        actionButtons = `
          <div class="func-action-box">
            <button class="btn btn-danger btn-xs" onclick="callHwService('${s.name}', '(1)')">🔴 ON</button>
            <button class="btn btn-secondary btn-xs" onclick="callHwService('${s.name}', '(0)')">⚪ OFF</button>
          </div>`;
      } else if (s.name.includes("Cooling")) {
        icon = "assets/actuator_fan.svg";
        entityName = "CoolingLED (Green LED GPIO 12)";
        params = "state: int (1 = ON, 0 = OFF)";
        outputType = "void";
        actionButtons = `
          <div class="func-action-box">
            <button class="btn btn-success btn-xs" onclick="callHwService('${s.name}', '(1)')">🟢 ON</button>
            <button class="btn btn-secondary btn-xs" onclick="callHwService('${s.name}', '(0)')">⚪ OFF</button>
          </div>`;
      } else {
        params = isSensor ? "None ()" : "state: int";
        outputType = isSensor ? "int" : "void";
        actionButtons = `
          <div class="func-action-box">
            <button class="btn btn-secondary btn-xs" onclick="callHwService('${s.name}', '${isSensor ? '()' : '(1)'}')">⚡ Test</button>
          </div>`;
      }

      const isThing2 = s.thing_id === "MySmartThing02";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="func-name-col">
            <img src="${icon}" alt="Icon" class="func-icon">
            <strong>${s.name}</strong>
          </div>
        </td>
        <td>
          <span class="func-thing-badge ${isThing2 ? 'thing2' : ''}">${s.thing_id}</span>
        </td>
        <td>
          <span class="func-type-badge ${isSensor ? 'sensor' : 'actuator'}">${isSensor ? 'Sensor' : 'Actuator'}</span>
        </td>
        <td style="color:#cbd5e1; font-size:0.75rem;">${entityName}</td>
        <td><code class="func-param-badge">${params}</code></td>
        <td><span class="func-output-badge">${outputType}</span></td>
        <td style="color:#94a3b8; font-size:0.75rem; max-width:240px;">${s.description || 'Hardware microservice'}</td>
        <td>${actionButtons}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // TAB: Render Relationships with Interactive Topological Dependency Graph
  window.setGraphSource = function(src) {
    currentGraphSource = src;
    const btnApp = document.getElementById("btnGraphSourceApp");
    const btnSpace = document.getElementById("btnGraphSourceSpace");
    if (btnApp) btnApp.classList.toggle("active", src === "app");
    if (btnSpace) btnSpace.classList.toggle("active", src === "space");
    renderRelationships();
  };

  function renderRelationships() {
    renderRelationshipsGraph();
    renderRelationshipsCards();
  }

  function extractAppRelationships(appDef) {
    const steps = (appDef && Array.isArray(appDef.steps)) ? appDef.steps : [];
    const edges = [];
    const used = new Set();

    steps.forEach((step, idx) => {
      if (step.type === "Type2") {
        // Order-based: service_a succeeds -> run service_b
        if (step.service_a && step.service_b) {
          used.add(step.service_a);
          used.add(step.service_b);
          edges.push({
            id: `app_step_${step.step_index}_order`,
            relName: `Step #${step.step_index}: Order-based Dependency`,
            stepIndex: step.step_index,
            type: "order",
            from: step.service_a,
            to: step.service_b,
            expr: `Order: Step #${step.step_index}`,
            description: `Runs '${step.service_b}' only after '${step.service_a}' completes successfully.`
          });
        }
      } else if (step.type === "Type3") {
        // Condition-based: service_a returns value -> run service_b
        if (step.service_a && step.service_b) {
          used.add(step.service_a);
          used.add(step.service_b);
          const op = step.operator || ">";
          const thresh = step.threshold !== undefined ? step.threshold : 28;
          const unit = step.service_a.includes("Temp") ? "°C" : (step.service_a.includes("Light") ? "%" : "");
          const shortName = step.service_a.replace("Read_", "").replace("_Level", "");
          edges.push({
            id: `app_step_${step.step_index}_cond`,
            relName: `Step #${step.step_index}: Condition-based Rule`,
            stepIndex: step.step_index,
            type: "condition",
            from: step.service_a,
            to: step.service_b,
            expr: `${shortName} ${op} ${thresh}${unit}`,
            description: `Conditional rule: When '${step.service_a}' ${op} ${thresh}, trigger '${step.service_b}'.`
          });
        }
      } else if (step.type === "Type1") {
        // Sequential step
        if (step.service) {
          used.add(step.service);
          if (idx < steps.length - 1) {
            const nextStep = steps[idx + 1];
            const nextService = nextStep.type === "Type1" ? nextStep.service : (nextStep.service_a || nextStep.service);
            if (nextService && nextService !== step.service) {
              used.add(nextService);
              edges.push({
                id: `app_step_${step.step_index}_seq_${nextStep.step_index}`,
                relName: `Seq: Step #${step.step_index} → Step #${nextStep.step_index}`,
                stepIndex: step.step_index,
                type: "sequential",
                from: step.service,
                to: nextService,
                expr: `Seq: #${step.step_index} → #${nextStep.step_index}`,
                description: `Sequential transition: Step #${step.step_index} (${step.service}) transitions to Step #${nextStep.step_index} (${nextService}).`
              });
            }
          }
        }
      }
    });

    // Loop cycle return edge
    if (appDef && appDef.loop && steps.length > 0) {
      const lastStep = steps[steps.length - 1];
      const lastService = lastStep.type === "Type1" ? lastStep.service : (lastStep.service_b || lastStep.service_a);
      const firstStep = steps[0];
      const firstService = firstStep.type === "Type1" ? firstStep.service : (firstStep.service_a || firstStep.service);
      if (lastService && firstService) {
        used.add(lastService);
        used.add(firstService);
        edges.push({
          id: "app_loop_cycle",
          relName: `Continuous Loop Cycle (${appDef.loop_interval_sec || 3}s)`,
          stepIndex: "Loop",
          type: "loop",
          from: lastService,
          to: firstService,
          expr: `⟲ Loop (${appDef.loop_interval_sec || 3}s)`,
          description: `Application loop enabled: repeats execution every ${appDef.loop_interval_sec || 3} seconds.`
        });
      }
    }

    return { edges, usedServices: used };
  }

  function renderRelationshipsGraph() {
    const svg = document.getElementById("relationshipsGraphSvg");
    if (!svg || !spaceData) return;
    svg.innerHTML = "";

    const appDef = appEditor ? appEditor.getAppDefinition() : { name: "CurrentApp", steps: [] };
    const appNameEl = document.getElementById("lblActiveAppName");
    if (appNameEl) appNameEl.textContent = appDef.name || "CustomApp";

    const mainTitle = document.getElementById("lblGraphMainTitle");
    const subTitle = document.getElementById("lblGraphSubtitle");
    const subHeaderTitle = document.getElementById("lblRelDescriptorsTitle");

    const nodeCoords = {
      "Read_Light_Level":      { x: 60,  y: 70,  w: 250, h: 74, icon: "👁", title: "Read_Light_Level", sub: "LightSensor (ADS1115 CH0)", thing: "MySmartThing01", color: "#38bdf8" },
      "Read_Temperature":      { x: 60,  y: 250, w: 250, h: 74, icon: "🌡", title: "Read_Temperature", sub: "TempSensor (Rotary Dial GPIO 20/21)", thing: "MySmartThing02", color: "#a78bfa" },
      "Set_Alarm_LED":         { x: 600, y: 70,  w: 250, h: 74, icon: "🔴", title: "Set_Alarm_LED", sub: "AlarmLED (Red LED GPIO 16)", thing: "MySmartThing01", color: "#38bdf8" },
      "Set_Cooling_Indicator": { x: 600, y: 250, w: 250, h: 74, icon: "🟢", title: "Set_Cooling_Indicator", sub: "CoolingLED (Green LED GPIO 12)", thing: "MySmartThing02", color: "#a78bfa" }
    };

    let edgesToRender = [];
    let usedServices = new Set();

    if (currentGraphSource === "app") {
      const extracted = extractAppRelationships(appDef);
      edgesToRender = extracted.edges;
      usedServices = extracted.usedServices;
      cachedAppEdges = edgesToRender;

      if (mainTitle) mainTitle.innerHTML = `Application Dependency Graph: <span style="color:#38bdf8;">${appDef.name || 'Current App'}</span>`;
      if (subTitle) subTitle.textContent = `Dynamically generated from ${appDef.steps ? appDef.steps.length : 0} execution steps in Apps & Editor ${appDef.loop ? `(Loop cycle: ${appDef.loop_interval_sec}s)` : ''}`;
      if (subHeaderTitle) subHeaderTitle.textContent = `Active Application Relationship Descriptors (${edgesToRender.length})`;
    } else {
      // Space mode: use spaceData.relationships
      if (mainTitle) mainTitle.textContent = `Discovered Space Relationships & Dependency Graph`;
      if (subTitle) subTitle.textContent = `Discovered from Atlas IoT-DDL tweets on Raspberry Pi nodes`;
      if (subHeaderTitle) subHeaderTitle.textContent = `Discovered Space Relationship Descriptors (Atlas IoT-DDL)`;
      usedServices = new Set(["Read_Light_Level", "Read_Temperature", "Set_Alarm_LED", "Set_Cooling_Indicator"]);

      edgesToRender = [
        {
          id: "space_rel_1",
          relName: "Rel_Darkness_Alert",
          from: "Read_Light_Level", to: "Set_Alarm_LED",
          type: "condition",
          expr: "Light < 15%",
          description: "When ambient light drops below 15%, trigger Alarm LED ON"
        },
        {
          id: "space_rel_2",
          relName: "Rel_Temp_Cooling_Order",
          from: "Read_Temperature", to: "Set_Cooling_Indicator",
          type: "order",
          expr: "Order: After Read",
          description: "Service Set_Cooling_Indicator may run only after Read_Temperature completes"
        },
        {
          id: "space_rel_3",
          relName: "Rel_Overheat_Cooling",
          from: "Read_Temperature", to: "Set_Cooling_Indicator",
          type: "condition",
          expr: "Temp > 28°C",
          description: "When temperature exceeds 28°C, activate Cooling Indicator LED"
        },
        {
          id: "space_rel_4",
          relName: "Rel_Cross_Thermal_Hazard",
          from: "Read_Temperature", to: "Set_Alarm_LED",
          type: "condition",
          expr: "Temp > 35°C (Cross-RPi)",
          description: "Thermal Hazard Alert: Service Set_Alarm_LED (RPi 1) runs if Read_Temperature (RPi 2) > 35 C"
        }
      ];
    }

    let svgContent = `
      <defs>
        <marker id="arrow-order" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#38bdf8" />
        </marker>
        <marker id="arrow-condition" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#f59e0b" />
        </marker>
        <marker id="arrow-sequential" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#a78bfa" />
        </marker>
        <marker id="arrow-loop" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#10b981" />
        </marker>
        <linearGradient id="nodeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1e293b" />
          <stop offset="100%" stop-color="#0f172a" />
        </linearGradient>
      </defs>
    `;

    // Empty state check for application graph
    if (edgesToRender.length === 0 && currentGraphSource === "app") {
      svgContent += `
        <g transform="translate(490, 200)" text-anchor="middle">
          <circle cx="0" cy="-24" r="28" fill="#1e293b" stroke="#334155" />
          <text x="0" y="-18" font-size="24" text-anchor="middle">🧩</text>
          <text y="24" fill="#cbd5e1" font-size="16" font-weight="700">Canvas in Apps & Editor has no steps</text>
          <text y="48" fill="#64748b" font-size="13">Switch to 'Apps & Editor' tab and add Type 1, 2, or 3 steps to dynamically generate relationships here.</text>
        </g>
      `;
      svg.innerHTML = svgContent;
      return;
    }

    // Group pair counts for dynamic curved offsets
    const pairCounts = {};
    edgesToRender.forEach(e => {
      const k = `${e.from}__${e.to}`;
      pairCounts[k] = (pairCounts[k] || 0) + 1;
    });
    const pairIndices = {};

    // 1. Draw Edges Layer
    svgContent += `<g id="graphEdgesLayer">`;

    edgesToRender.forEach((e, idx) => {
      const n1 = nodeCoords[e.from];
      const n2 = nodeCoords[e.to];
      if (!n1 || !n2) return;

      const k = `${e.from}__${e.to}`;
      const idxInPair = pairIndices[k] || 0;
      pairIndices[k] = idxInPair + 1;
      const totalInPair = pairCounts[k];
      const offset = totalInPair > 1 ? (idxInPair - (totalInPair - 1) / 2) * 32 : 0;

      let strokeColor = "#38bdf8";
      let markerId = "arrow-order";
      if (e.type === "order") {
        strokeColor = "#38bdf8";
        markerId = "arrow-order";
      } else if (e.type === "condition") {
        strokeColor = "#f59e0b";
        markerId = "arrow-condition";
      } else if (e.type === "sequential") {
        strokeColor = "#a78bfa";
        markerId = "arrow-sequential";
      } else if (e.type === "loop") {
        strokeColor = "#10b981";
        markerId = "arrow-loop";
      }

      let d = "";
      let mx = 490, my = 200;

      if (e.type === "loop") {
        // Return curve underneath
        const x1 = n1.x + n1.w / 2;
        const y1 = n1.y + n1.h;
        const x2 = n2.x;
        const y2 = n2.y + n2.h / 2;
        d = `M ${x1} ${y1} C ${x1 - 40} 415, ${x2 - 50} 415, ${x2} ${y2}`;
        mx = 450;
        my = 405;
      } else if (n1.x === n2.x) {
        // Vertical connection along same column
        if (n1.y < n2.y) {
          const x1 = n1.x + 35;
          const y1 = n1.y + n1.h;
          const x2 = n2.x + 35;
          const y2 = n2.y;
          d = `M ${x1} ${y1} C ${n1.x - 30} ${y1 + 40}, ${n2.x - 30} ${y2 - 40}, ${x2} ${y2}`;
          mx = n1.x - 25;
          my = (y1 + y2) / 2;
        } else {
          const x1 = n1.x + 35;
          const y1 = n1.y;
          const x2 = n2.x + 35;
          const y2 = n2.y + n2.h;
          d = `M ${x1} ${y1} C ${n1.x - 30} ${y1 - 40}, ${n2.x - 30} ${y2 + 40}, ${x2} ${y2}`;
          mx = n1.x - 25;
          my = (y1 + y2) / 2;
        }
      } else if (n1.x < n2.x) {
        // Left-to-Right connection
        const x1 = n1.x + n1.w;
        const y1 = n1.y + n1.h / 2 + offset * 0.45;
        const x2 = n2.x;
        const y2 = n2.y + n2.h / 2 + offset * 0.45;
        const dx = Math.abs(x2 - x1) * 0.45;
        d = `M ${x1} ${y1} C ${x1 + dx} ${y1 + offset}, ${x2 - dx} ${y2 + offset}, ${x2} ${y2}`;
        mx = (x1 + x2) / 2;
        my = (y1 + y2) / 2 + offset;
      } else {
        // Right-to-Left
        const x1 = n1.x;
        const y1 = n1.y + n1.h / 2;
        const x2 = n2.x + n2.w;
        const y2 = n2.y + n2.h / 2;
        d = `M ${x1} ${y1} C ${x1 - 60} ${y1 - 40}, ${x2 + 60} ${y2 - 40}, ${x2} ${y2}`;
        mx = (x1 + x2) / 2;
        my = (y1 + y2) / 2 - 40;
      }

      const labelW = Math.max(86, (e.expr || "").length * 7.5 + 16);
      const labelH = 22;

      svgContent += `
        <g class="graph-edge-group" id="edge_grp_${e.id || idx}" data-edge-id="${e.id || idx}" data-from="${e.from}" data-to="${e.to}">
          <!-- Clickable fat hit-area -->
          <path d="${d}" fill="none" stroke="transparent" stroke-width="18" style="cursor:pointer;" onmouseenter="highlightEdge('${e.id || idx}')" onmouseleave="resetGraphHighlight()" onclick="showEdgeDetails('${e.id || idx}')" />
          <!-- Visible Edge Path -->
          <path id="edge_path_${e.id || idx}" class="graph-edge ${e.type}" d="${d}" marker-end="url(#${markerId})" />
          <!-- Edge Pill Label -->
          <g transform="translate(${mx - labelW / 2}, ${my - labelH / 2})" style="cursor:pointer;" onmouseenter="highlightEdge('${e.id || idx}')" onmouseleave="resetGraphHighlight()" onclick="showEdgeDetails('${e.id || idx}')">
            <rect class="graph-edge-label-bg" width="${labelW}" height="${labelH}" rx="5" stroke="${strokeColor}" />
            <text class="graph-edge-label-text" x="${labelW / 2}" y="${labelH / 2}" fill="${strokeColor}">${e.expr}</text>
          </g>
        </g>
      `;
    });
    svgContent += `</g>`;

    // 2. Draw Nodes Layer
    svgContent += `<g id="graphNodesLayer">`;
    Object.keys(nodeCoords).forEach(key => {
      const n = nodeCoords[key];
      const isThing2 = n.thing === "MySmartThing02";
      const isUsed = usedServices.has(key);
      const nodeClass = isUsed ? "in-app" : "unused";

      svgContent += `
        <g class="graph-node ${nodeClass}" id="node_${key}" data-node="${key}" onmouseenter="highlightGraphNode('${key}')" onmouseleave="resetGraphHighlight()">
          <rect class="graph-node-rect" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="8" />
          <text x="${n.x + 16}" y="${n.y + 42}" font-size="22">${n.icon}</text>
          <text class="graph-node-title" x="${n.x + 50}" y="${n.y + 26}">${n.title}</text>
          <text class="graph-node-sub" x="${n.x + 50}" y="${n.y + 44}">${n.sub}</text>
          <text class="graph-node-thing" x="${n.x + 50}" y="${n.y + 60}" fill="${isThing2 ? '#c4b5fd' : '#38bdf8'}">${n.thing}</text>
          <text x="${n.x + n.w - 14}" y="${n.y + 22}" fill="${isUsed ? '#10b981' : '#64748b'}" font-size="${isUsed ? '11' : '10'}" font-weight="${isUsed ? 'bold' : 'normal'}" text-anchor="end">${isUsed ? '● In App' : 'Idle'}</text>
          
          <!-- Port dots -->
          <circle cx="${n.x}" cy="${n.y + n.h / 2}" r="4" fill="${isUsed ? '#38bdf8' : '#64748b'}" />
          <circle cx="${n.x + n.w}" cy="${n.y + n.h / 2}" r="4" fill="${isUsed ? '#38bdf8' : '#64748b'}" />
        </g>
      `;
    });
    svgContent += `</g>`;

    svg.innerHTML = svgContent;
  }

  window.highlightEdge = function(edgeId) {
    const edgeGroup = document.getElementById(`edge_grp_${edgeId}`);
    if (!edgeGroup) return;
    const from = edgeGroup.getAttribute("data-from");
    const to = edgeGroup.getAttribute("data-to");

    document.querySelectorAll(".graph-edge-group").forEach(el => {
      const match = el.getAttribute("data-edge-id") === edgeId;
      el.querySelector(".graph-edge").classList.toggle("highlighted", match);
      el.classList.toggle("dimmed", !match);
    });

    document.querySelectorAll(".graph-node").forEach(el => {
      const nodeName = el.getAttribute("data-node");
      const match = nodeName === from || nodeName === to;
      el.classList.toggle("active-node", match);
    });

    showEdgeDetails(edgeId);
  };

  window.showEdgeDetails = function(edgeId) {
    const bar = document.getElementById("graphRelDetails");
    if (!bar) return;

    let e = cachedAppEdges.find(item => item.id === edgeId);
    if (!e && currentGraphSource === "space") {
      const rels = spaceData.relationships || [];
      const r = rels.find(item => item.name === edgeId || edgeId.includes(item.name));
      if (r) {
        e = {
          relName: r.name,
          type: r.relation_type.toLowerCase().includes("order") ? "order" : "condition",
          from: r.fs_name,
          to: r.ss_name,
          description: r.description
        };
      }
    }
    if (!e) return;

    const fromThing = e.from.includes("Temp") || e.from.includes("Cooling") ? "MySmartThing02" : "MySmartThing01";
    const toThing = e.to.includes("Temp") || e.to.includes("Cooling") ? "MySmartThing02" : "MySmartThing01";
    const isCross = fromThing !== toThing;

    bar.style.display = "flex";
    bar.innerHTML = `
      <div>
        <span class="inspect-title">${e.relName}</span>
        <span class="inspect-badge ${e.type}">${e.type.toUpperCase()}</span>
        <span style="color:#cbd5e1; margin-left:12px;"><strong>${e.from}</strong> (${fromThing}) &rarr; <strong>${e.to}</strong> (${toThing})</span>
        ${isCross ? '<span class="rel-card-cross" style="margin-left:8px;">⚡ Cross-RPi Distributed</span>' : ''}
      </div>
      <div style="color:#94a3b8; font-size:0.75rem;">
        ${e.description}
      </div>
    `;
  };

  window.highlightGraphNode = function(nodeName) {
    if (!spaceData) return;

    document.querySelectorAll(".graph-edge-group").forEach(el => {
      const from = el.getAttribute("data-from");
      const to = el.getAttribute("data-to");
      const match = from === nodeName || to === nodeName;
      el.querySelector(".graph-edge").classList.toggle("highlighted", match);
      el.classList.toggle("dimmed", !match);
    });

    document.querySelectorAll(".graph-node").forEach(el => {
      const n = el.getAttribute("data-node");
      const match = n === nodeName;
      el.classList.toggle("active-node", match);
    });
  };

  window.resetGraphHighlight = function() {
    document.querySelectorAll(".graph-edge-group").forEach(el => {
      el.classList.remove("dimmed");
      el.querySelector(".graph-edge").classList.remove("highlighted");
    });
    document.querySelectorAll(".graph-node").forEach(el => el.classList.remove("active-node"));
    const bar = document.getElementById("graphRelDetails");
    if (bar) bar.style.display = "none";
  };

  function renderRelationshipsCards() {
    const grid = document.getElementById("relationshipsGrid");
    if (!grid || !spaceData) return;
    grid.innerHTML = "";

    if (currentGraphSource === "app") {
      if (cachedAppEdges.length === 0) {
        grid.innerHTML = "<p style='color:#64748b; font-size:0.82rem; padding:10px;'>No relationship steps authored in the application yet. Click constructs on 'Apps & Editor' tab to add steps.</p>";
        return;
      }

      cachedAppEdges.forEach(e => {
        const fromThing = e.from.includes("Temp") || e.from.includes("Cooling") ? "MySmartThing02" : "MySmartThing01";
        const toThing = e.to.includes("Temp") || e.to.includes("Cooling") ? "MySmartThing02" : "MySmartThing01";
        const isCross = fromThing !== toThing;

        const card = document.createElement("div");
        card.className = `rel-card ${e.type}`;
        card.innerHTML = `
          <div class="rel-card-top">
            <span class="rel-card-title">${e.relName}</span>
            <span class="rel-card-tag ${e.type}">${e.type.toUpperCase()}</span>
          </div>
          <p style="color:#94a3b8; font-size:0.78rem;">${e.description}</p>
          <div class="rel-arrow-display">
            ${e.from} &rarr; ${e.to}
          </div>
          <div style="font-size:0.72rem; color:#64748b; margin-top:4px; display:flex; justify-content:space-between; align-items:center;">
            <span>From: <code style="color:#38bdf8;">${fromThing}</code> &bull; To: <code style="color:#a78bfa;">${toThing}</code></span>
            ${isCross ? '<span class="rel-card-cross">⚡ Cross-RPi</span>' : ''}
          </div>
        `;

        card.addEventListener("mouseenter", () => window.highlightEdge(e.id));
        card.addEventListener("mouseleave", () => window.resetGraphHighlight());
        grid.appendChild(card);
      });
    } else {
      // Space mode
      const rels = spaceData.relationships || [];
      if (rels.length === 0) {
        grid.innerHTML = "<p style='color:#64748b; font-size:0.8rem;'>No relationships discovered yet.</p>";
        return;
      }

      rels.forEach(rel => {
        const isOrder = rel.relation_type.toLowerCase().includes("order");
        const card = document.createElement("div");
        card.className = `rel-card ${isOrder ? 'order' : 'condition'}`;
        card.innerHTML = `
          <div class="rel-card-top">
            <span class="rel-card-title">${rel.name}</span>
            <span class="rel-card-tag ${isOrder ? 'order' : 'condition'}">${rel.relation_type}</span>
          </div>
          <p style="color:#94a3b8; font-size:0.78rem;">${rel.description}</p>
          <div class="rel-arrow-display">
            ${rel.fs_name} &rarr; ${rel.ss_name}
          </div>
          <div style="font-size:0.7rem; color:#64748b; margin-top:4px;">
            Thing: <code style="color:#38bdf8;">${rel.thing_id}</code> &bull; Category: ${rel.category}
          </div>
        `;
        grid.appendChild(card);
      });
    }
  }

  window.pingThingNode = async (thingId, ip, port, resSpanId) => {
    const span = document.getElementById(resSpanId);
    if (span) span.innerHTML = `<span style="color:#38bdf8;">Pinging...</span>`;
    try {
      const resp = await fetch("/api/target/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, port, thing_id: thingId })
      });
      const data = await resp.json();
      if (span) {
        if (data.success) {
          span.innerHTML = `<span style="color:#34d399;">✓ Online (${data.latency_ms}ms)</span>`;
        } else {
          span.innerHTML = `<span style="color:#f87171;">✕ Failed (${data.error || 'unreachable'})</span>`;
        }
      }
    } catch (err) {
      if (span) span.innerHTML = `<span style="color:#f87171;">✕ Network error</span>`;
    }
  };

  window.callHwService = async (serviceName, inputs = "()", displayId = null) => {
    try {
      const resp = await fetch("/api/service/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_name: serviceName, inputs })
      });
      const res = await resp.json();
      if (res.success) {
        if (displayId) {
          const el = document.getElementById(displayId);
          if (el) el.textContent = `${res.Return} (${res.latency_ms}ms)`;
        } else {
          alert(`✓ '${serviceName}' executed on hardware!\nResult: ${JSON.stringify(res.Return)}\nLatency: ${res.latency_ms}ms`);
        }
      } else {
        alert(`❌ Error executing '${serviceName}' on breadboard:\n${res.error}\n\nCheck Raspberry Pi IP and connection.`);
      }
    } catch (e) {
      alert(`Network error: ${e}`);
    }
  };

  // -------------------------------------------------------------
  // TAB 4: Load Saved Apps, Update Status & Logs
  // -------------------------------------------------------------
  async function loadSavedApps() {
    try {
      const r = await fetch("/api/apps");
      const data = await r.json();
      document.getElementById("labelWorkingDir").textContent = data.working_dir;
      document.getElementById("countApps").textContent = data.apps.length;

      // Auto-load default application on startup if editor is currently empty
      if (appEditor && appEditor.steps.length === 0 && data.apps && data.apps.length > 0) {
        const defaultApp = data.apps.find(a => a.name === "CircadianComfortGuard") || data.apps[0];
        appEditor.loadApp(defaultApp);
        if (currentGraphSource === "app") {
          renderRelationships();
        }
      }

      const container = document.getElementById("savedAppsList");
      if (!container) return;
      container.innerHTML = "";

      const activeAppName = appEditor ? appEditor.getAppDefinition().name : "";

      data.apps.forEach(app => {
        const isCurrent = activeAppName === app.name;
        const card = document.createElement("div");
        card.className = `app-compact-card ${isCurrent ? 'selected-app' : ''}`;
        card.innerHTML = `
          <div class="app-compact-title">
            <span>${app.name}</span>
            <span class="app-compact-file">${app.filename}</span>
          </div>
          <div class="app-compact-btns">
            <button class="btn btn-secondary btn-xs btn-edit" title="Load into Editor & Generate Graph">✎ Edit</button>
            <button class="btn btn-primary btn-xs btn-run">▶ Run</button>
            <button class="btn btn-secondary btn-xs btn-stop">■ Stop</button>
            <button class="btn btn-danger btn-xs btn-del">✕</button>
          </div>
        `;

        const loadThisApp = () => {
          appEditor.loadApp(app);
          document.querySelectorAll(".app-compact-card").forEach(c => c.classList.remove("selected-app"));
          card.classList.add("selected-app");
          if (currentGraphSource === "app") {
            renderRelationships();
          }
        };

        card.addEventListener("click", loadThisApp);
        card.querySelector(".btn-edit")?.addEventListener("click", (e) => {
          e.stopPropagation();
          loadThisApp();
        });

        card.querySelector(".btn-run").addEventListener("click", async (e) => {
          e.stopPropagation();
          const res = await fetch("/api/apps/activate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: app.name })
          });
          const d = await res.json();
          if (!d.success) alert(d.error);
          updateStatusPanel();
        });

        card.querySelector(".btn-stop").addEventListener("click", async (e) => {
          e.stopPropagation();
          await fetch("/api/apps/stop", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: app.name })
          });
          updateStatusPanel();
        });

        card.querySelector(".btn-del").addEventListener("click", async (e) => {
          e.stopPropagation();
          if (confirm(`Delete app '${app.name}'?`)) {
            await fetch(`/api/apps/delete?name=${encodeURIComponent(app.name)}`, { method: "DELETE" });
            loadSavedApps();
            updateStatusPanel();
          }
        });

        container.appendChild(card);
      });
    } catch (e) {}
  }

  async function updateStatusPanel() {
    try {
      const r = await fetch("/api/status");
      const d = await r.json();
      const list = d.status_panel || [];

      const activeCount = list.filter(x => x.status === "Active").length;
      document.getElementById("activeAppCount").textContent = activeCount;
      const dot = document.getElementById("statusPulseDot");
      if (activeCount > 0) dot.classList.add("active");
      else dot.classList.remove("active");

      const tbody = document.getElementById("statusTableBody");
      if (!tbody) return;

      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty">No applications currently active.</td></tr>`;
        return;
      }

      tbody.innerHTML = list.map(item => `
        <tr>
          <td><strong>${item.app_name}</strong></td>
          <td><span class="badge-status ${item.status.toLowerCase()}">${item.status}</span></td>
          <td style="font-family:var(--code); color:#a7f3d0; font-size:0.7rem;">${item.last_result ? JSON.stringify(item.last_result) : '—'}</td>
          <td>
            ${item.can_stop 
              ? `<button class="btn btn-danger btn-xs" onclick="stopApp('${item.app_name}')">■ Stop</button>`
              : `<span style="color:#64748b; font-size:0.7rem;">Done</span>`}
          </td>
        </tr>
      `).join("");
    } catch (e) {}
  }

  window.stopApp = async (name) => {
    await fetch("/api/apps/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    updateStatusPanel();
  };

  async function updateLogs() {
    try {
      const r = await fetch("/api/logs");
      const d = await r.json();
      const body = document.getElementById("traceBody");
      if (!body) return;

      const logs = d.logs || [];
      if (logs.length > 0) {
        body.innerHTML = logs.map(l => {
          let extraClass = "";
          if (l.level === "ERROR" || l.message.includes("[ERROR]")) extraClass = "error";
          else if (l.level === "START" || l.level === "DONE") extraClass = "success";
          return `
            <div class="log-row">
              <span class="log-t">[${l.time_str}]</span>
              <span class="log-m ${extraClass}">${l.message}</span>
            </div>
          `;
        }).join("");
        body.scrollTop = body.scrollHeight;
      }
    } catch (e) {}
  }

  // Initial fetch
  fetchSpace();
  loadSavedApps();
  updateStatusPanel();

  setInterval(() => {
    updateStatusPanel();
    updateLogs();
  }, 1400);
});
