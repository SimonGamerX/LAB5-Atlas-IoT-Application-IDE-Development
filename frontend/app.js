/**
 * Atlas IoT Application IDE - Unified Dashboard Controller
 * Course: B8019 Programming the Internet of Things
 */

document.addEventListener("DOMContentLoaded", () => {
  let spaceData = null;
  let appEditor = new IoTAppEditor();

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

  // Upload App
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
  // Data Fetching & Rendering (Section Above)
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

      renderThingCard();
      renderServicesList();
      renderRelationshipsSummary();
      appEditor.setServices(spaceData.services);
    } catch (e) {
      console.warn("Could not fetch space data:", e);
    }
  }

  function renderThingCard() {
    if (!spaceData || !spaceData.things || spaceData.things.length === 0) return;
    const t = spaceData.things[0];
    document.getElementById("thingNameDisplay").textContent = t.name;
    document.getElementById("thingAtidDisplay").textContent = `ATID: ${t.thing_id}`;
    document.getElementById("thingEndpointDisplay").textContent = `${t.ip}:${t.port}`;
  }

  function renderServicesList() {
    const container = document.getElementById("servicesActionList");
    if (!container || !spaceData) return;
    container.innerHTML = "";

    spaceData.services.forEach(s => {
      const card = document.createElement("div");
      card.className = "srv-action-card";

      let buttonsHtml = "";
      if (s.name.includes("Light")) {
        buttonsHtml = `
          <div class="srv-btns-row">
            <button class="btn btn-primary btn-sm" onclick="callHwService('${s.name}', '()', 'disp_Light')">👁 Read LDR</button>
            <span id="disp_Light" class="srv-val-box">—</span>
          </div>`;
      } else if (s.name.includes("Temp")) {
        buttonsHtml = `
          <div class="srv-btns-row">
            <button class="btn btn-primary btn-sm" onclick="callHwService('${s.name}', '()', 'disp_Temp')">🌡 Read Temp</button>
            <span id="disp_Temp" class="srv-val-box">—</span>
          </div>`;
      } else if (s.name.includes("Alarm")) {
        buttonsHtml = `
          <div class="srv-btns-row">
            <button class="btn btn-danger btn-sm" onclick="callHwService('${s.name}', '(1)')">🔴 Turn ON</button>
            <button class="btn btn-secondary btn-sm" onclick="callHwService('${s.name}', '(0)')">⚪ Turn OFF</button>
          </div>`;
      } else if (s.name.includes("Cooling")) {
        buttonsHtml = `
          <div class="srv-btns-row">
            <button class="btn btn-success btn-sm" onclick="callHwService('${s.name}', '(1)')">🟢 Turn ON</button>
            <button class="btn btn-secondary btn-sm" onclick="callHwService('${s.name}', '(0)')">⚪ Turn OFF</button>
          </div>`;
      } else {
        buttonsHtml = `
          <div class="srv-btns-row">
            <button class="btn btn-secondary btn-sm" onclick="callHwService('${s.name}', '${s.is_sensor ? '()' : '(1)'}')">⚡ Test</button>
          </div>`;
      }

      card.innerHTML = `
        <div class="srv-top-row">
          <span class="srv-name">${s.name}</span>
          <span class="srv-tag ${s.is_sensor ? 'sensor' : 'actuator'}">${s.is_sensor ? 'Sensor' : 'Actuator'}</span>
        </div>
        ${buttonsHtml}
      `;
      container.appendChild(card);
    });
  }

  function renderRelationshipsSummary() {
    const container = document.getElementById("relationshipsSummaryList");
    if (!container || !spaceData) return;
    container.innerHTML = "";

    if (spaceData.relationships.length === 0) {
      container.innerHTML = "<p style='color:#64748b; font-size:0.75rem;'>No relationships declared yet.</p>";
      return;
    }

    spaceData.relationships.forEach(rel => {
      const isOrder = rel.relation_type.toLowerCase().includes("order");
      const item = document.createElement("div");
      item.className = `rel-summary-item ${isOrder ? 'order' : 'condition'}`;
      item.innerHTML = `
        <div class="rel-summary-name">
          <span>${rel.name}</span>
          <span style="color:${isOrder ? '#60a5fa' : '#f59e0b'}; font-size:0.68rem; font-weight:bold;">${rel.relation_type}</span>
        </div>
        <div class="rel-summary-arrow">${rel.fs_name} &rarr; ${rel.ss_name}</div>
      `;
      container.appendChild(item);
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
  // Data Fetching & Rendering (Section Under: IDE & Console)
  // -------------------------------------------------------------
  async function loadSavedApps() {
    try {
      const r = await fetch("/api/apps");
      const data = await r.json();
      document.getElementById("labelWorkingDir").textContent = data.working_dir;

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

  // Initial calls
  fetchSpace();
  loadSavedApps();
  updateStatusPanel();

  setInterval(() => {
    updateStatusPanel();
    updateLogs();
  }, 1400);
});
