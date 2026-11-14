/**
 * Atlas IoT Application IDE - 4 Tabs Controller
 * Course: B8019 Programming the Internet of Things
 */

document.addEventListener("DOMContentLoaded", () => {
  let spaceData = null;
  let appEditor = new IoTAppEditor();
  let currentFilter = "all";

  // Tab switching
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      const target = document.getElementById(tab.dataset.tab);
      if (target) target.classList.add("active");
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
      hwStatusFeedback.textContent = `Target connected: ${ip}:${port}!`;
      hwStatusFeedback.className = "hw-feedback ok";
      fetchSpace();
    }
  });

  btnTestHw?.addEventListener("click", async () => {
    const ip = inputRpiIp.value.trim();
    const port = parseInt(selRpiPort.value) || 6668;
    hwStatusFeedback.textContent = `Testing ${ip}:${port}...`;
    hwStatusFeedback.className = "hw-feedback";

    try {
      const res = await fetch("/api/target/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, port })
      });
      const d = await res.json();
      if (d.success) {
        let msg = `✅ Breadboard Connected! (${d.latency_ms}ms)`;
        if (d.suggested_port) {
          msg += ` [Port ${d.suggested_port}]`;
          selRpiPort.value = String(d.suggested_port);
        }
        hwStatusFeedback.textContent = msg;
        hwStatusFeedback.className = "hw-feedback ok";
        alert(`Success! Breadboard responded.\nLatency: ${d.latency_ms}ms\nResponse: ${JSON.stringify(d.Return)}`);
      } else {
        hwStatusFeedback.textContent = `❌ Failed: ${d.error}`;
        hwStatusFeedback.className = "hw-feedback err";
        alert(`Connection to ${ip}:${port} failed.\n\nCheck:\n1. Pi is on same network.\n2. ./Atlas (port 6668) or ./rpi_service_server (port 8080) is running.\n\nError: ${d.error}`);
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

      // Update Tab Badges
      document.getElementById("countThings").textContent = spaceData.counts.things;
      document.getElementById("countServices").textContent = spaceData.counts.services;
      document.getElementById("countRelationships").textContent = spaceData.counts.relationships;

      renderThings();
      renderFunctionalitiesTable();
      renderRelationships();
      appEditor.setServices(spaceData.services);
    } catch (e) {
      console.warn("Could not fetch space data:", e);
    }
  }

  // TAB 1: Render Things
  function renderThings() {
    const grid = document.getElementById("thingsGrid");
    if (!grid || !spaceData) return;
    grid.innerHTML = "";

    spaceData.things.forEach(thing => {
      const card = document.createElement("div");
      card.className = "thing-card";

      const entities = spaceData.entities.filter(e => e.thing_id === thing.thing_id);
      const tags = entities.map(e => `<span class="entity-tag">${e.name} (${e.entity_type})</span>`).join("");

      card.innerHTML = `
        <div class="thing-card-header">
          <img src="assets/rpi4.svg" alt="RPi" class="thing-avatar">
          <div class="thing-title">
            <h3>${thing.name}</h3>
            <div class="thing-id-tag">ATID: ${thing.thing_id}</div>
          </div>
        </div>
        <table class="thing-meta-table">
          <tr><td>Target Address:</td><td>${thing.ip}:${thing.port}</td></tr>
          <tr><td>Operating System:</td><td>${thing.os || 'Raspbian'}</td></tr>
          <tr><td>Hardware Model:</td><td>${thing.model || 'Raspberry Pi 4B'}</td></tr>
          <tr><td>Owner / Vendor:</td><td>${thing.owner || 'iotpj'} / ${thing.vendor || 'RaspberryPiCo'}</td></tr>
        </table>
        <div>
          <div style="font-size:0.75rem; color:#94a3b8; margin-bottom:4px;">Hosted Entities:</div>
          <div class="entities-tags">${tags || 'None'}</div>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  // TAB 2: Render Functionalities Table
  function renderFunctionalitiesTable() {
    const tbody = document.getElementById("functionalitiesTableBody");
    if (!tbody || !spaceData) return;
    tbody.innerHTML = "";

    const allSrv = spaceData.services || [];
    const sensors = allSrv.filter(s => s.is_sensor);
    const actuators = allSrv.filter(s => s.is_actuator);

    document.getElementById("numAllServices").textContent = allSrv.length;
    document.getElementById("numSensors").textContent = sensors.length;
    document.getElementById("numActuators").textContent = actuators.length;

    const filtered = allSrv.filter(s => {
      if (currentFilter === "sensor") return s.is_sensor;
      if (currentFilter === "actuator") return s.is_actuator;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#64748b; padding:20px;">No microservices match filter.</td></tr>';
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

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="func-name-col">
            <img src="${icon}" alt="Icon" class="func-icon">
            <span>${s.name}</span>
          </div>
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

  // TAB 3: Render Relationships
  function renderRelationships() {
    const grid = document.getElementById("relationshipsGrid");
    if (!grid || !spaceData) return;
    grid.innerHTML = "";

    if (!spaceData.relationships || spaceData.relationships.length === 0) {
      grid.innerHTML = "<p style='color:#64748b; font-size:0.8rem;'>No relationships discovered yet.</p>";
      return;
    }

    spaceData.relationships.forEach(rel => {
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
          Thing: ${rel.thing_id} &bull; Category: ${rel.category}
        </div>
      `;
      grid.appendChild(card);
    });
  }

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

      const container = document.getElementById("savedAppsList");
      if (!container) return;
      container.innerHTML = "";

      data.apps.forEach(app => {
        const card = document.createElement("div");
        card.className = "app-compact-card";
        card.innerHTML = `
          <div class="app-compact-title">
            <span>${app.name}</span>
            <span class="app-compact-file">${app.filename}</span>
          </div>
          <div class="app-compact-btns">
            <button class="btn btn-primary btn-xs btn-run">▶ Run</button>
            <button class="btn btn-secondary btn-xs btn-stop">■ Stop</button>
            <button class="btn btn-danger btn-xs btn-del">✕</button>
          </div>
        `;

        card.addEventListener("dblclick", () => {
          appEditor.loadApp(app);
          alert(`Application '${app.name}' loaded into Editor.`);
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
