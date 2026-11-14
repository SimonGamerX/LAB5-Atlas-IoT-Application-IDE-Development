/**
 * Atlas IoT Application IDE - 4 Tabs Controller
 * Course: B8019 Programming the Internet of Things
 */

document.addEventListener("DOMContentLoaded", () => {
  // Light / Dark theme switcher
  const btnThemeToggle = document.getElementById("btnThemeToggle");
  const lblThemeToggle = document.getElementById("lblThemeToggle");
  function syncThemeUI() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (lblThemeToggle) lblThemeToggle.textContent = isDark ? "Light" : "Dark";
    if (btnThemeToggle) btnThemeToggle.setAttribute("aria-pressed", String(isDark));
  }
  syncThemeUI();
  btnThemeToggle?.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (isDark) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("atlas_ide_theme", "light");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("atlas_ide_theme", "dark");
    }
    syncThemeUI();
  });

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
        hwStatusFeedback.innerHTML = `<span class="tone-positive">Raspberry Pi detected at ${found.ip} (MAC: ${found.mac})</span>`;
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
    hwStatusFeedback.textContent = `Running breadboard boot self-test on ${ip}:${port}...`;
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
        const msg = `Breadboard verified — Red LED: ${r.red_led ? 'OK' : 'ERR'} | Green LED: ${r.green_led ? 'OK' : 'ERR'} | Light: ${r.light}% | Temp: ${r.temp} C`;
        hwStatusFeedback.innerHTML = `<span class="tone-positive">${msg}</span>`;
        hwStatusFeedback.className = "hw-feedback ok";
        alert(`Breadboard Self-Test Succeeded\n\n1. Red Alert LED (GPIO 16): Flashed\n2. Green Cooling LED (GPIO 12): Flashed\n3. Ambient Light (ADS1115 CH0): ${r.light}%\n4. Thermostat Dial (Rotary GPIO 20/21): ${r.temp}°C\n\nActive Server Port: ${d.active_port}`);
        fetchSpace();
      } else {
        hwStatusFeedback.innerHTML = `<span class="tone-negative">No server running on Pi ${ip}</span>`;
        alert(`Could not connect to Raspberry Pi at ${ip}:${port}.\n\nThe Pi is reachable, but neither Atlas (port 6668) nor rpi_service_server (port 8080) is currently running.\n\nTo start the middleware on your Raspberry Pi, run:\n\ncd ~/LAB4-Microservices-Architecture/PartTwo/AtlasThingMiddleware_RPI\n./Atlas\n\n(or for Lab 4 Part 1: cd ~/LAB4-Microservices-Architecture/PartOne/rpi_server && ./rpi_service_server RPi 8080)`);
      }
    } catch (e) {
      hwStatusFeedback.innerHTML = `<span class="tone-negative">Network Error: ${e}</span>`;
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
      alert(`Application '${appDef.name}' finalized and saved as .iot file.`);
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

  // Working Directory Switcher (Req 4: Changeable Atlas working directory)
  const btnChangeWorkDir = document.getElementById("btnChangeWorkDir");
  const workDirEditorRow = document.getElementById("workDirEditorRow");
  const inputWorkingDir = document.getElementById("inputWorkingDir");
  const btnApplyWorkDir = document.getElementById("btnApplyWorkDir");

  btnChangeWorkDir?.addEventListener("click", () => {
    if (!workDirEditorRow) return;
    const isHidden = workDirEditorRow.style.display === "none";
    workDirEditorRow.style.display = isHidden ? "flex" : "none";
    if (isHidden && inputWorkingDir) {
      inputWorkingDir.value = document.getElementById("labelWorkingDir")?.textContent.trim() || "";
      inputWorkingDir.focus();
    }
  });

  btnApplyWorkDir?.addEventListener("click", async () => {
    const newDir = inputWorkingDir?.value.trim();
    if (!newDir) return;
    try {
      const resp = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ working_dir: newDir })
      });
      const d = await resp.json();
      if (d.working_dir) {
        workDirEditorRow.style.display = "none";
        loadSavedApps();
      }
    } catch (e) {
      alert(`Unable to change working directory: ${e}`);
    }
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
      grid.innerHTML = "<p class='tone-muted' style='padding:20px;'>No Atlas Smart Things registered yet.</p>";
      return;
    }

    things.forEach((thing, idx) => {
      const isThing1 = thing.thing_id === "MySmartThing01" || idx === 0;
      const card = document.createElement("div");
      card.className = "thing-card";

      const hiddenOnPrimary = new Set(["TempSensor", "CoolingLED"]);
      const entities = (spaceData.entities || []).filter(e => {
        if (e.thing_id !== thing.thing_id) return false;
        if (isThing1 && hiddenOnPrimary.has(e.name)) return false;
        return true;
      });
      const tags = entities.map(e => {
        const isSens = (e.entity_type || "").toLowerCase().includes("sensor");
        return `<span class="entity-tag ${isSens ? 'sensor' : 'actuator'}">${e.name} <small>(${e.entity_type})</small></span>`;
      }).join("");

      const rawModel = (thing.model || "").trim();
      const hardwareModel = (!rawModel || rawModel === "4B" || rawModel.toLowerCase().includes("raspberry pi 4"))
        ? "Raspberry Pi 4 Model B (4GB)"
        : rawModel;

      const rawOs = (thing.os || "").trim();
      const operatingSystem = (!rawOs || rawOs.toLowerCase() === "raspbian" || rawOs.toLowerCase().includes("bullseye"))
        ? "Raspbian GNU/Linux 11 (bullseye)"
        : rawOs;

      const ownerVendor = `${thing.owner || "iotpj"} / ${thing.vendor || "RaspberryPiCo"}`;
      const thingDescription = isThing1
        ? "Raspberry Pi 4B smart space controller (Primary Edge Node 1)"
        : `Raspberry Pi 4B smart space controller (Distributed Edge Node ${idx + 1})`;

      const roleTitle = isThing1 ? "Edge Node 1 (Primary)" : `Edge Node ${idx + 1} (Peer)`;
      const roleBadgeClass = isThing1 ? "" : "aux";
      const resSpanId = `ping_res_${thing.thing_id}`;
      const entitiesBlock = entities.length > 0
        ? `<div class="thing-entities">
            <div class="entities-heading">Hosted Hardware Entities (${entities.length})</div>
            <div class="entities-tags">${tags}</div>
          </div>`
        : "";

      card.innerHTML = `
        <div class="thing-card-header">
          <img src="assets/rpi4.svg" alt="Raspberry Pi" class="thing-avatar">
          <div class="thing-title">
            <h3>${thing.name}</h3>
            <span class="thing-role-badge ${roleBadgeClass}">${roleTitle}</span>
            <div class="thing-id-tag mono">ATID: ${thing.thing_id} &middot; Space: ${thing.space_id || 'MySmartSpace'}</div>
          </div>
          <span class="thing-status-pill"><span class="dot"></span> Online</span>
        </div>
        <table class="thing-meta-table">
          <tr><td>Description</td><td>${thingDescription}</td></tr>
          <tr><td>Target Address</td><td class="mono"><strong>${thing.ip}:${thing.port}</strong></td></tr>
          <tr><td>Hardware Model</td><td>${hardwareModel}</td></tr>
          <tr><td>Operating System</td><td>${operatingSystem}</td></tr>
          <tr><td>Protocol / Language</td><td class="mono">JSON / TCP (Port ${thing.port})</td></tr>
          <tr><td>Owner / Vendor</td><td>${ownerVendor}</td></tr>
        </table>
        ${entitiesBlock}
        <div class="thing-card-footer">
          <button class="btn btn-secondary btn-xs" onclick="pingThingNode('${thing.thing_id}', '${thing.ip}', ${thing.port}, '${resSpanId}')">
            Ping / Test Node
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
      tbody.innerHTML = '<tr><td colspan="8" class="tone-muted" style="text-align:center; padding:24px;">No microservices match this filter.</td></tr>';
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
            <button class="btn btn-primary btn-xs" onclick="callHwService('${s.name}', '()', 'disp_val_Light')">Read Light</button>
            <span id="disp_val_Light" class="func-val-display">—</span>
          </div>`;
      } else if (s.name.includes("Temp")) {
        icon = "assets/sensor_temp.svg";
        entityName = "TempSensor (Rotary Dial GPIO 20/21)";
        params = "None ()";
        outputType = "int (15 - 45 °C)";
        actionButtons = `
          <div class="func-action-box">
            <button class="btn btn-primary btn-xs" onclick="callHwService('${s.name}', '()', 'disp_val_Temp')">Read Temp</button>
            <span id="disp_val_Temp" class="func-val-display">—</span>
          </div>`;
      } else if (s.name.includes("Alarm")) {
        icon = "assets/actuator_alarm.svg";
        entityName = "AlarmLED (Red LED GPIO 16)";
        params = "state: int (1 = ON, 0 = OFF)";
        outputType = "void";
        actionButtons = `
          <div class="func-action-box">
            <button class="btn btn-danger btn-xs" onclick="callHwService('${s.name}', '(1)')">On</button>
            <button class="btn btn-secondary btn-xs" onclick="callHwService('${s.name}', '(0)')">Off</button>
          </div>`;
      } else if (s.name.includes("Cooling")) {
        icon = "assets/actuator_fan.svg";
        entityName = "CoolingLED (Green LED GPIO 12)";
        params = "state: int (1 = ON, 0 = OFF)";
        outputType = "void";
        actionButtons = `
          <div class="func-action-box">
            <button class="btn btn-outline-positive btn-xs" onclick="callHwService('${s.name}', '(1)')">On</button>
            <button class="btn btn-secondary btn-xs" onclick="callHwService('${s.name}', '(0)')">Off</button>
          </div>`;
      } else {
        params = isSensor ? "None ()" : "state: int";
        outputType = isSensor ? "int" : "void";
        actionButtons = `
          <div class="func-action-box">
            <button class="btn btn-secondary btn-xs" onclick="callHwService('${s.name}', '${isSensor ? '()' : '(1)'}')">Test</button>
          </div>`;
      }

      const isThing2 = s.thing_id === "MySmartThing02";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="func-name-col">
            <img src="${icon}" alt="" class="func-icon">
            <strong>${s.name}</strong>
          </div>
        </td>
        <td>
          <span class="func-thing-badge ${isThing2 ? 'thing2' : ''}">${s.thing_id}</span>
        </td>
        <td>
          <span class="func-type-badge ${isSensor ? 'sensor' : 'actuator'}">${isSensor ? 'Sensor' : 'Actuator'}</span>
        </td>
        <td class="tone-muted" style="font-size:12px;">${entityName}</td>
        <td><code class="func-param-badge">${params}</code></td>
        <td><span class="func-output-badge">${outputType}</span></td>
        <td class="tone-muted" style="font-size:12px; max-width:240px;">${s.description || 'Hardware microservice'}</td>
        <td class="col-right">${actionButtons}</td>
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
    window.resetGraphHighlight?.();
    renderRelationships();
  };

  function renderRelationships() {
    renderRelationshipsGraph();
    renderRelationshipsCards();
  }
  window.renderRelationships = renderRelationships;

  document.getElementById("btnGraphSourceApp")?.addEventListener("click", () => window.setGraphSource("app"));
  document.getElementById("btnGraphSourceSpace")?.addEventListener("click", () => window.setGraphSource("space"));
  document.getElementById("btnResetGraph")?.addEventListener("click", () => {
    window.resetGraphHighlight?.();
    renderRelationships();
  });

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
      } else if (step.type === "Type4") {
        used.add("User_Interaction");
        const mode = (step.interaction_mode || "output").toLowerCase();
        const prevStep = idx > 0 ? steps[idx - 1] : null;
        const nextStep = idx < steps.length - 1 ? steps[idx + 1] : null;
        const srcSrv = prevStep ? (prevStep.service_b || prevStep.service_a || prevStep.service) : null;
        const dstSrv = nextStep ? (nextStep.service_a || nextStep.service) : null;
        if (srcSrv && mode === "output") {
          used.add(srcSrv);
          edges.push({
            id: `app_step_${step.step_index}_io`,
            relName: `Step #${step.step_index}: User Output`,
            stepIndex: step.step_index,
            type: "interaction",
            from: srcSrv,
            to: "User_Interaction",
            expr: "Type 4: Notify",
            description: `Displays user notification: ${step.message || ""}`
          });
        } else if (dstSrv) {
          used.add(dstSrv);
          edges.push({
            id: `app_step_${step.step_index}_io`,
            relName: `Step #${step.step_index}: ${mode === "input" ? "User Input" : "User Output"}`,
            stepIndex: step.step_index,
            type: "interaction",
            from: "User_Interaction",
            to: dstSrv,
            expr: mode === "input" ? `Input {${step.var_name || "var"}}` : "Type 4: Notify",
            description: mode === "input"
              ? `Prompts operator '${step.prompt || ""}' into {${step.var_name || "var"}} before ${dstSrv}.`
              : `User notification: ${step.message || ""}`
          });
        }
      } else if (step.type === "Type5") {
        const exprText = String(step.expression || "");
        const knownNames = (spaceData && Array.isArray(spaceData.services))
          ? spaceData.services.map(s => s.name)
          : ["Read_Light_Level", "Read_Temperature"];
        const matchedSources = knownNames.filter(name => exprText.includes(name));
        const hasOr = /\bOR\b|\|\|/i.test(exprText);
        const gateTag = hasOr ? "OR Logic" : "AND Logic";
        const targetActuator = step.service_b || "Set_Alarm_LED";
        used.add(targetActuator);

        matchedSources.forEach((srcName, sIdx) => {
          used.add(srcName);
          edges.push({
            id: `app_step_${step.step_index}_logic_${sIdx}`,
            relName: `Step #${step.step_index}: Type 5 Compound Logic (${gateTag})`,
            stepIndex: step.step_index,
            type: "logic",
            from: srcName,
            to: targetActuator,
            expr: gateTag,
            description: `Evaluates '${exprText}' -> triggers '${targetActuator}'.`
          });
        });
      } else if (step.type === "Type1") {
        // Sequential step
        if (step.service) {
          used.add(step.service);
          if (idx < steps.length - 1) {
            const nextStep = steps[idx + 1];
            const nextService = nextStep.type === "Type1"
              ? nextStep.service
              : (nextStep.type === "Type4" ? "User_Interaction" : (nextStep.service_a || nextStep.service));
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
      const lastService = lastStep.type === "Type1"
        ? lastStep.service
        : (lastStep.service_b || lastStep.service_a || "User_Interaction");
      const firstStep = steps[0];
      const firstService = firstStep.type === "Type1"
        ? firstStep.service
        : (firstStep.service_a || "User_Interaction");
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
          expr: `Loop (${appDef.loop_interval_sec || 3}s)`,
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

    const baseCoords = {
      "Read_Light_Level":      { x: 110, y: 70,  w: 256, h: 74, icon: "L", title: "Read_Light_Level", sub: "LightSensor (ADS1115 CH0)", thing: "MySmartThing01", color: "#1b6c80" },
      "Read_Temperature":      { x: 110, y: 250, w: 256, h: 74, icon: "T", title: "Read_Temperature", sub: "TempSensor (Rotary Dial GPIO 20/21)", thing: "MySmartThing02", color: "#2f70bb" },
      "Set_Alarm_LED":         { x: 590, y: 70,  w: 256, h: 74, icon: "A", title: "Set_Alarm_LED", sub: "AlarmLED (Red LED GPIO 16)", thing: "MySmartThing01", color: "#1b6c80" },
      "Set_Cooling_Indicator": { x: 590, y: 250, w: 256, h: 74, icon: "C", title: "Set_Cooling_Indicator", sub: "CoolingLED (Green LED GPIO 12)", thing: "MySmartThing02", color: "#2f70bb" }
    };

    const nodeCoords = { ...baseCoords };
    const thingNames = Array.from(new Set((spaceData.services || []).map(s => s.thing_id)));
    let dynSensorIdx = 0;
    let dynActIdx = 0;
    (spaceData.services || []).forEach(s => {
      if (!nodeCoords[s.name]) {
        const isSensor = (s.category || "").toLowerCase().includes("report") || s.name.startsWith("Read_");
        const colX = isSensor ? 110 : 590;
        const rowY = 70 + (isSensor ? dynSensorIdx++ : dynActIdx++) * 105;
        const isPeer = thingNames.indexOf(s.thing_id) > 0;
        nodeCoords[s.name] = {
          x: colX,
          y: Math.min(rowY, 310),
          w: 256,
          h: 74,
          icon: isSensor ? "S" : "A",
          title: s.name,
          sub: `${s.entity_id || 'Entity'} (${s.category || 'Service'})`,
          thing: s.thing_id || "MySmartThing01",
          color: isPeer ? "#2f70bb" : "#1b6c80"
        };
      } else if (s.thing_id) {
        nodeCoords[s.name].thing = s.thing_id;
      }
    });

    let edgesToRender = [];
    let usedServices = new Set();

    if (currentGraphSource === "app") {
      const extracted = extractAppRelationships(appDef);
      edgesToRender = extracted.edges;
      usedServices = extracted.usedServices;
      cachedAppEdges = edgesToRender;

      if (usedServices.has("User_Interaction")) {
        nodeCoords["User_Interaction"] = {
          x: 378,
          y: 158,
          w: 200,
          h: 68,
          icon: "IO",
          title: "User_Interaction",
          sub: "Console Prompt / Alert",
          thing: "Atlas IDE",
          color: "#5b6472"
        };
      }

      if (mainTitle) mainTitle.innerHTML = `Application Dependency Graph: <span class="tone-accent">${appDef.name || 'Current App'}</span>`;
      if (subTitle) subTitle.textContent = `Dynamically generated from ${appDef.steps ? appDef.steps.length : 0} execution steps in Apps & Editor ${appDef.loop ? `(Loop cycle: ${appDef.loop_interval_sec}s)` : ''}`;
      if (subHeaderTitle) subHeaderTitle.textContent = `Active Application Relationship Descriptors (${edgesToRender.length})`;
    } else {
      // Space mode: dynamically map spaceData.relationships discovered from Atlas tweets
      const spaceRels = spaceData.relationships || [];
      if (mainTitle) mainTitle.textContent = `Discovered Space Relationships & Dependency Graph`;
      if (subTitle) subTitle.textContent = `Discovered from ${spaceRels.length} Atlas IoT-DDL Relationship tweets`;
      if (subHeaderTitle) subHeaderTitle.textContent = `Discovered Space Relationship Descriptors (${spaceRels.length})`;

      edgesToRender = spaceRels.map((rel, idx) => {
        const isOrder = (rel.relation_type || "").toLowerCase().includes("order");
        usedServices.add(rel.fs_name);
        usedServices.add(rel.ss_name);
        return {
          id: rel.name || `space_rel_${idx + 1}`,
          relName: rel.name || `Rel_${idx + 1}`,
          from: rel.fs_name,
          to: rel.ss_name,
          type: isOrder ? "order" : "condition",
          expr: isOrder ? "Order: Before / After" : (rel.category || "Conditional"),
          description: rel.description || `${rel.fs_name} -> ${rel.ss_name}`
        };
      });
    }

    let svgContent = `
      <defs>
        <marker id="arrow-order" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--accent)" />
        </marker>
        <marker id="arrow-condition" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--chart-3)" />
        </marker>
        <marker id="arrow-sequential" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--chart-2)" />
        </marker>
        <marker id="arrow-logic" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--chart-4)" />
        </marker>
        <marker id="arrow-interaction" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--muted)" />
        </marker>
        <marker id="arrow-loop" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--positive)" />
        </marker>
        <linearGradient id="nodeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--node-grad-top)" />
          <stop offset="100%" stop-color="var(--node-grad-bot)" />
        </linearGradient>
      </defs>
    `;

    // Empty state check for application graph
    if (edgesToRender.length === 0 && currentGraphSource === "app") {
      svgContent += `
        <g transform="translate(460, 210)" text-anchor="middle">
          <rect x="-26" y="-50" width="52" height="52" rx="12" fill="var(--surface)" stroke="var(--border-strong)" stroke-width="1.5" />
          <path d="M452 176h16M460 168v16" transform="translate(-460,-200)" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>
          <text y="24" fill="var(--text)" font-size="15" font-weight="600">Canvas in Apps &amp; Editor has no steps</text>
          <text y="46" fill="var(--muted)" font-size="12.5">Switch to the Apps &amp; Editor tab and add Type 1–5 steps to generate relationships.</text>
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

      let strokeColor = "var(--accent)";
      let markerId = "arrow-order";
      if (e.type === "order") {
        strokeColor = "var(--accent)";
        markerId = "arrow-order";
      } else if (e.type === "condition") {
        strokeColor = "var(--chart-3)";
        markerId = "arrow-condition";
      } else if (e.type === "sequential") {
        strokeColor = "var(--chart-2)";
        markerId = "arrow-sequential";
      } else if (e.type === "logic") {
        strokeColor = "var(--chart-4)";
        markerId = "arrow-logic";
      } else if (e.type === "interaction") {
        strokeColor = "var(--muted)";
        markerId = "arrow-interaction";
      } else if (e.type === "loop") {
        strokeColor = "var(--positive)";
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
          <rect x="${n.x + 12}" y="${n.y + 18}" width="28" height="28" rx="6" fill="${isThing2 ? 'var(--chart-2-soft)' : 'var(--accent-soft)'}" stroke="${isThing2 ? 'var(--chart-2-border)' : 'var(--accent-border)'}" stroke-width="1" />
          <text x="${n.x + 26}" y="${n.y + 36}" font-size="12" font-weight="600" font-family="var(--code)" text-anchor="middle" fill="${isThing2 ? 'var(--chart-2)' : 'var(--accent)'}">${n.icon}</text>
          <text class="graph-node-title" x="${n.x + 50}" y="${n.y + 26}">${n.title}</text>
          <text class="graph-node-sub" x="${n.x + 50}" y="${n.y + 44}">${n.sub}</text>
          <text class="graph-node-thing" x="${n.x + 50}" y="${n.y + 60}" fill="${isThing2 ? 'var(--chart-2)' : 'var(--accent)'}">${n.thing}</text>
          <text x="${n.x + n.w - 14}" y="${n.y + 22}" fill="${isUsed ? 'var(--positive)' : 'var(--faint)'}" font-size="${isUsed ? '10.5' : '10'}" font-weight="${isUsed ? '600' : '400'}" text-anchor="end">${isUsed ? 'Active' : 'Idle'}</text>
          
          <!-- Port dots -->
          <circle cx="${n.x}" cy="${n.y + n.h / 2}" r="4" fill="${isUsed ? 'var(--accent)' : 'var(--control)'}" stroke="var(--surface)" stroke-width="1.5" />
          <circle cx="${n.x + n.w}" cy="${n.y + n.h / 2}" r="4" fill="${isUsed ? 'var(--accent)' : 'var(--control)'}" stroke="var(--surface)" stroke-width="1.5" />
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

  function resolveServiceThing(serviceName) {
    if (spaceData && Array.isArray(spaceData.services)) {
      const found = spaceData.services.find(s => s.name === serviceName);
      if (found && found.thing_id) return found.thing_id;
    }
    return serviceName.includes("Temp") || serviceName.includes("Cooling") ? "MySmartThing02" : "MySmartThing01";
  }

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

    const fromThing = resolveServiceThing(e.from);
    const toThing = resolveServiceThing(e.to);
    const isCross = fromThing !== toThing;

    bar.style.display = "flex";
    bar.innerHTML = `
      <div>
        <span class="inspect-title">${e.relName}</span>
        <span class="inspect-badge ${e.type}">${e.type}</span>
        <span style="color:var(--text); margin-left:10px;"><strong>${e.from}</strong> <span class="tone-muted">(${fromThing})</span> &rarr; <strong>${e.to}</strong> <span class="tone-muted">(${toThing})</span></span>
        ${isCross ? '<span class="rel-card-cross" style="margin-left:8px;">Cross-RPi Distributed</span>' : ''}
      </div>
      <div class="tone-muted" style="font-size:12px;">
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
        grid.innerHTML = "<p class='tone-muted' style='font-size:12.5px; padding:10px;'>No relationship steps authored in the application yet. Click constructs on the Apps &amp; Editor tab to add steps.</p>";
        return;
      }

      cachedAppEdges.forEach(e => {
        const fromThing = resolveServiceThing(e.from);
        const toThing = resolveServiceThing(e.to);
        const isCross = fromThing !== toThing;

        const card = document.createElement("div");
        card.className = `rel-card ${e.type}`;
        card.innerHTML = `
          <div class="rel-card-top">
            <span class="rel-card-title">${e.relName}</span>
            <span class="rel-card-tag ${e.type}">${e.type}</span>
          </div>
          <p class="rel-card-desc">${e.description}</p>
          <div class="rel-arrow-display">
            ${e.from} &rarr; ${e.to}
          </div>
          <div class="rel-card-footer">
            <span>From: <code class="code-inline">${fromThing}</code> &bull; To: <code class="code-inline">${toThing}</code></span>
            ${isCross ? '<span class="rel-card-cross">Cross-RPi</span>' : ''}
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
        grid.innerHTML = "<p class='tone-muted' style='font-size:12.5px;'>No relationships discovered yet.</p>";
        return;
      }

      rels.forEach(rel => {
        const isOrder = rel.relation_type.toLowerCase().includes("order");
        const fromThing = resolveServiceThing(rel.fs_name);
        const toThing = resolveServiceThing(rel.ss_name);
        const isCross = fromThing !== toThing;
        const card = document.createElement("div");
        card.className = `rel-card ${isOrder ? 'order' : 'condition'}`;
        card.innerHTML = `
          <div class="rel-card-top">
            <span class="rel-card-title">${rel.name}</span>
            <span class="rel-card-tag ${isOrder ? 'order' : 'condition'}">${rel.relation_type}</span>
          </div>
          <p class="rel-card-desc">${rel.description}</p>
          <div class="rel-arrow-display">
            ${rel.fs_name} &rarr; ${rel.ss_name}
          </div>
          <div class="rel-card-footer">
            <span>Thing: <code class="code-inline">${rel.thing_id}</code> &bull; Category: ${rel.category}</span>
            ${isCross ? '<span class="rel-card-cross">Cross-RPi</span>' : ''}
          </div>
        `;
        card.addEventListener("mouseenter", () => window.highlightEdge(rel.name));
        card.addEventListener("mouseleave", () => window.resetGraphHighlight());
        grid.appendChild(card);
      });
    }
  }

  window.pingThingNode = async (thingId, ip, port, resSpanId) => {
    const span = document.getElementById(resSpanId);
    if (span) span.innerHTML = `<span class="tone-accent">Pinging...</span>`;
    try {
      const resp = await fetch("/api/target/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, port, thing_id: thingId })
      });
      const data = await resp.json();
      if (span) {
        if (data.success) {
          span.innerHTML = `<span class="tone-positive">Online (${data.latency_ms} ms)</span>`;
        } else {
          span.innerHTML = `<span class="tone-negative">Failed (${data.error || 'unreachable'})</span>`;
        }
      }
    } catch (err) {
      if (span) span.innerHTML = `<span class="tone-negative">Network error</span>`;
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
          alert(`Executed '${serviceName}' on hardware.\nResult: ${JSON.stringify(res.Return)}\nLatency: ${res.latency_ms}ms`);
        }
      } else {
        alert(`Error executing '${serviceName}' on breadboard:\n${res.error}\n\nCheck Raspberry Pi IP and connection.`);
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
            <button class="btn btn-secondary btn-xs btn-edit" title="Load into Editor & Generate Graph">Edit</button>
            <button class="btn btn-primary btn-xs btn-run">Run</button>
            <button class="btn btn-secondary btn-xs btn-stop">Stop</button>
            <button class="btn btn-danger btn-xs btn-del" title="Delete">&times;</button>
          </div>
        `;

        card.title = "Double-click or click Edit to load into Editor";

        const selectThisCard = () => {
          document.querySelectorAll(".app-compact-card").forEach(c => c.classList.remove("selected-app"));
          card.classList.add("selected-app");
        };

        const loadThisApp = () => {
          appEditor.loadApp(app);
          selectThisCard();
          if (currentGraphSource === "app") {
            renderRelationships();
          }
        };

        card.addEventListener("click", selectThisCard);
        card.addEventListener("dblclick", loadThisApp);
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

  let renderedPromptKey = null;

  function renderConsoleInteractionBar(list) {
    const bar = document.getElementById("consoleInteractionBar");
    if (!bar) return;

    const waitingApp = list.find(item => item.pending_prompt);
    if (waitingApp && waitingApp.pending_prompt) {
      const p = waitingApp.pending_prompt;
      if (renderedPromptKey === p.prompt_id) return;
      renderedPromptKey = p.prompt_id;

      bar.style.display = "flex";
      bar.className = "console-interaction-bar is-prompt";
      bar.innerHTML = `
        <div class="cib-label">
          <span class="cib-tag">Type 4 Input</span>
          <strong>${waitingApp.app_name}</strong>: ${p.prompt}
        </div>
        <div class="cib-controls">
          <input type="text" id="cibPromptInput" class="cib-input mono" value="${String(p.default_value || '').replace(/"/g, '&quot;')}" placeholder="Value for {${p.var_name}}">
          <button type="button" id="cibPromptSubmit" class="btn btn-primary btn-xs">Submit Input</button>
        </div>
      `;
      const submitFn = async () => {
        const val = document.getElementById("cibPromptInput")?.value ?? "";
        await fetch("/api/apps/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: waitingApp.app_name, value: val })
        });
        renderedPromptKey = null;
        bar.style.display = "none";
        updateStatusPanel();
      };
      document.getElementById("cibPromptSubmit")?.addEventListener("click", submitFn);
      document.getElementById("cibPromptInput")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submitFn();
      });
      return;
    }

    renderedPromptKey = null;
    const outputApp = list.find(item => item.last_output && item.last_output.message);
    if (outputApp) {
      bar.style.display = "flex";
      bar.className = "console-interaction-bar is-output";
      bar.innerHTML = `
        <div class="cib-label">
          <span class="cib-tag out">Type 4 Output</span>
          <strong>${outputApp.app_name}</strong> [${outputApp.last_output.time_str}]: ${outputApp.last_output.message}
        </div>
      `;
      return;
    }

    bar.style.display = "none";
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

      renderConsoleInteractionBar(list);

      const tbody = document.getElementById("statusTableBody");
      if (!tbody) return;

      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty">No applications currently active.</td></tr>`;
        return;
      }

      tbody.innerHTML = list.map(item => {
        const startLabel = typeof item.start_time === "number"
          ? new Date(item.start_time * 1000).toLocaleTimeString([], { hour12: false })
          : (item.start_time || "—");
        return `
        <tr>
          <td><strong>${item.app_name}</strong></td>
          <td><span class="badge-status ${item.status.toLowerCase()}">${item.status}</span></td>
          <td class="mono" style="font-size:11.5px; color:var(--muted);">${startLabel}</td>
          <td class="mono status-result-cell" title="${item.last_result ? JSON.stringify(item.last_result).replace(/"/g, '&quot;') : ''}">${item.last_result ? JSON.stringify(item.last_result) : '—'}</td>
          <td class="col-right">
            ${item.can_stop 
              ? `<button class="btn btn-danger btn-xs" onclick="stopApp('${item.app_name}')">Stop</button>`
              : `<span class="tone-muted" style="font-size:11.5px;">Done</span>`}
          </td>
        </tr>
      `;
      }).join("");
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
