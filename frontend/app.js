/**
 * Atlas IoT Application IDE - Main Orchestrator
 * Course: B8019 - Programming the Internet of Things
 */

document.addEventListener("DOMContentLoaded", () => {
  let spaceData = null;
  let relationshipsGraph = null;
  let appEditor = null;
  let currentFilter = "all";
  let activeTab = "tab-things";
  let pollInterval = null;

  // Initialize UI components
  relationshipsGraph = new RelationshipsGraph("relationshipSvg", "relationshipsDetailsList");
  appEditor = new IoTAppEditor("editorCanvas", "appJsonEditor", "paletteServices");

  // DOM Elements
  const freezeOverlay = document.getElementById("startupFreezeOverlay");
  const freezeCount = document.getElementById("freezeDiscoveredCount");
  const btnSkipFreeze = document.getElementById("btnSkipFreeze");

  const metaSpaceId = document.getElementById("metaSpaceId");
  const metaNetworkAddr = document.getElementById("metaNetworkAddr");
  const chkSimulator = document.getElementById("chkSimulator");

  const countThings = document.getElementById("countThings");
  const countServices = document.getElementById("countServices");
  const countRelationships = document.getElementById("countRelationships");
  const countApps = document.getElementById("countApps");

  const thingsGrid = document.getElementById("thingsGrid");
  const servicesList = document.getElementById("servicesList");
  const savedAppsList = document.getElementById("savedAppsList");
  const labelWorkingDir = document.getElementById("labelWorkingDir");
  const statusTableBody = document.getElementById("statusTableBody");
  const activeAppCount = document.getElementById("activeAppCount");
  const statusPulseDot = document.getElementById("statusPulseDot");

  const traceConsoleDrawer = document.getElementById("traceConsoleDrawer");
  const btnToggleTraceConsole = document.getElementById("btnToggleTraceConsole");
  const traceConsoleBody = document.getElementById("traceConsoleBody");

  // Tabs switching
  document.querySelectorAll(".nav-tab").forEach(tabBtn => {
    tabBtn.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));

      tabBtn.classList.add("active");
      const targetId = tabBtn.dataset.tab;
      document.getElementById(targetId)?.classList.add("active");
      activeTab = targetId;

      if (targetId === "tab-relationships") {
        setTimeout(() => relationshipsGraph.render(), 50);
      }
    });
  });

  // Freeze Overlay skip
  btnSkipFreeze?.addEventListener("click", () => {
    freezeOverlay.classList.add("hidden");
  });

  // Simulator toggle
  chkSimulator?.addEventListener("change", async (e) => {
    const enabled = e.target.checked;
    try {
      await fetch("/api/simulator/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled })
      });
      fetchSpaceData();
    } catch (err) {
      console.error("Failed to toggle simulator:", err);
    }
  });

  // Services Filter Buttons
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      renderServicesList();
    });
  });

  // App Manager Toolbar Buttons
  document.getElementById("btnNewApp")?.addEventListener("click", () => {
    appEditor.clear();
  });

  document.getElementById("btnClearEditor")?.addEventListener("click", () => {
    if (confirm("Clear editor composition?")) {
      appEditor.clear();
    }
  });

  // Save App Button (.iot local file)
  document.getElementById("btnSaveApp")?.addEventListener("click", async () => {
    const appDef = appEditor.getAppDefinition();
    try {
      const resp = await fetch("/api/apps/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: appDef, filename: appDef.name })
      });
      const res = await resp.json();
      if (res.success) {
        alert(`Application saved successfully as '${res.filename}'!`);
        fetchSavedApps();
      } else {
        alert(`Save failed: ${res.error || "Unknown error"}`);
      }
    } catch (err) {
      alert("Error connecting to server to save app.");
    }
  });

  // Finalize App Button (converts to named app and registers)
  document.getElementById("btnFinalizeApp")?.addEventListener("click", async () => {
    const appDef = appEditor.getAppDefinition();
    if (!appDef.name) {
      alert("Please provide a valid App Name.");
      return;
    }
    if (!appDef.steps || appDef.steps.length === 0) {
      alert("Cannot finalize an empty application. Add at least one step.");
      return;
    }

    try {
      const resp = await fetch("/api/apps/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: appDef, filename: appDef.name })
      });
      const res = await resp.json();
      if (res.success) {
        alert(`✓ Application '${appDef.name}' successfully finalized and saved to working directory!`);
        fetchSavedApps();
      }
    } catch (err) {
      alert("Error finalizing app.");
    }
  });

  // Upload App File Picker
  const fileUploadInput = document.getElementById("fileAppUpload");
  document.getElementById("btnUploadAppFile")?.addEventListener("click", () => {
    fileUploadInput?.click();
  });

  fileUploadInput?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        appEditor.loadApp(parsed);
        alert(`Loaded application '${parsed.name || file.name}' into editor.`);
      } catch (err) {
        alert("Invalid .iot / JSON file format.");
      }
    };
    reader.readAsText(file);
  });

  // Trace Console Drawer Toggle
  btnToggleTraceConsole?.addEventListener("click", () => {
    const isHidden = traceConsoleDrawer.style.display === "none";
    traceConsoleDrawer.style.display = isHidden ? "flex" : "none";
    btnToggleTraceConsole.textContent = isHidden ? "▼ Close Trace Console" : "▲ Live Trace Console";
  });

  document.getElementById("btnClearTraceLogs")?.addEventListener("click", () => {
    if (traceConsoleBody) traceConsoleBody.innerHTML = "";
  });

  // Settings Modal (Working Dir)
  const modalSettings = document.getElementById("modalSettings");
  const inputSettingWorkingDir = document.getElementById("inputSettingWorkingDir");
  document.getElementById("btnSettingsModal")?.addEventListener("click", () => {
    if (labelWorkingDir) inputSettingWorkingDir.value = labelWorkingDir.textContent;
    modalSettings.classList.add("active");
  });
  document.getElementById("btnCloseModal")?.addEventListener("click", () => {
    modalSettings.classList.remove("active");
  });
  document.getElementById("btnSaveSettings")?.addEventListener("click", async () => {
    const newDir = inputSettingWorkingDir.value.trim();
    if (newDir) {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ working_dir: newDir })
      });
      modalSettings.classList.remove("active");
      fetchSavedApps();
    }
  });

  // Service Test Modal
  const modalTestService = document.getElementById("modalTestService");
  const testServiceTitle = document.getElementById("testServiceTitle");
  const testServiceDesc = document.getElementById("testServiceDesc");
  const inputServiceTestArgs = document.getElementById("inputServiceTestArgs");
  const serviceTestResult = document.getElementById("serviceTestResult");
  let activeTestServiceName = null;

  document.getElementById("btnCloseTestModal")?.addEventListener("click", () => {
    modalTestService.classList.remove("active");
  });

  document.getElementById("btnExecuteServiceTest")?.addEventListener("click", async () => {
    if (!activeTestServiceName) return;
    const inputs = inputServiceTestArgs.value.trim() || "()";
    serviceTestResult.style.display = "block";
    serviceTestResult.textContent = "Invoking microservice...";

    try {
      const resp = await fetch("/api/service/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_name: activeTestServiceName, inputs })
      });
      const data = await resp.json();
      serviceTestResult.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
      serviceTestResult.textContent = `Call failed: ${err}`;
    }
  });

  window.openServiceTestModal = (serviceName, description, defaultInputs = "()") => {
    activeTestServiceName = serviceName;
    testServiceTitle.textContent = `Invoke: ${serviceName}`;
    testServiceDesc.textContent = description || "Atlas microservice call over TCP Port 6668";
    inputServiceTestArgs.value = defaultInputs;
    serviceTestResult.style.display = "none";
    modalTestService.classList.add("active");
  };

  // -------------------------------------------------------------
  // DATA FETCHING & RENDERING
  // -------------------------------------------------------------
  async function fetchSpaceData() {
    try {
      const resp = await fetch("/api/space");
      spaceData = await resp.json();

      // Update meta information
      if (metaSpaceId) metaSpaceId.textContent = spaceData.space_id;
      if (metaNetworkAddr && spaceData.meta) {
        metaNetworkAddr.textContent = spaceData.meta.ide_network_address;
      }

      // Update badges
      countThings.textContent = spaceData.counts.things;
      countServices.textContent = spaceData.counts.services;
      countRelationships.textContent = spaceData.counts.relationships;

      // Update freeze screen
      const totalElements = spaceData.counts.things + spaceData.counts.services + spaceData.counts.relationships;
      if (freezeCount) freezeCount.textContent = totalElements;
      if (totalElements >= 3 && !freezeOverlay.classList.contains("hidden")) {
        // Auto-dismiss freeze screen after learning enough tweets
        setTimeout(() => freezeOverlay.classList.add("hidden"), 800);
      }

      // Render tab views
      renderThingsGrid();
      renderServicesList();
      relationshipsGraph.setData(spaceData.services, spaceData.relationships);
      appEditor.setServices(spaceData.services);

    } catch (err) {
      console.warn("Could not fetch space data:", err);
    }
  }

  function renderThingsGrid() {
    if (!thingsGrid || !spaceData) return;
    thingsGrid.innerHTML = "";

    if (spaceData.things.length === 0) {
      thingsGrid.innerHTML = "<p style='color:#64748b;'>No Things detected. Check RPi connection or toggle simulator.</p>";
      return;
    }

    spaceData.things.forEach(thing => {
      const card = document.createElement("div");
      card.className = "thing-card";

      // Filter entities for this thing
      const entities = spaceData.entities.filter(e => e.thing_id === thing.thing_id);
      const entityChips = entities.map(e => 
        `<span class="entity-chip">${e.name} (${e.entity_type})</span>`
      ).join("");

      card.innerHTML = `
        <div class="thing-card-header">
          <img src="assets/rpi4.svg" alt="Thing Avatar" class="thing-avatar">
          <div class="thing-title">
            <h3>${thing.name}</h3>
            <div class="thing-id-tag">ATID: ${thing.thing_id}</div>
          </div>
        </div>
        <table class="thing-meta-table">
          <tr><td>Network Address</td><td>${thing.ip}:${thing.port}</td></tr>
          <tr><td>Operating System</td><td>${thing.os || 'Linux'}</td></tr>
          <tr><td>Hardware Model</td><td>${thing.model || 'Raspberry Pi'}</td></tr>
          <tr><td>Vendor / Owner</td><td>${thing.vendor || 'Unknown'} / ${thing.owner || 'iotpj'}</td></tr>
          <tr><td>Description</td><td style="color:#cbd5e1; font-family:var(--font-family);">${thing.description || ''}</td></tr>
        </table>
        <div>
          <div style="font-size:0.75rem; color:#94a3b8; margin-bottom:4px;">Hosted Entities (${entities.length}):</div>
          <div class="thing-entities-chips">
            ${entityChips || '<span style="color:#64748b; font-size:0.72rem;">None</span>'}
          </div>
        </div>
      `;
      thingsGrid.appendChild(card);
    });
  }

  function renderServicesList() {
    if (!servicesList || !spaceData) return;
    servicesList.innerHTML = "";

    const filtered = spaceData.services.filter(s => {
      if (currentFilter === "sensor") return s.is_sensor;
      if (currentFilter === "actuator") return s.is_actuator;
      return true;
    });

    // Update filter counts
    document.getElementById("srvAllCount").textContent = spaceData.services.length;
    document.getElementById("srvSensCount").textContent = spaceData.services.filter(s => s.is_sensor).length;
    document.getElementById("srvActCount").textContent = spaceData.services.filter(s => s.is_actuator).length;

    if (filtered.length === 0) {
      servicesList.innerHTML = "<p style='color:#64748b;'>No microservices match filter.</p>";
      return;
    }

    filtered.forEach(s => {
      const card = document.createElement("div");
      card.className = "service-card";

      // Choose skin based on service name
      let icon = "assets/app_icon.svg";
      if (s.name.includes("Light")) icon = "assets/sensor_light.svg";
      else if (s.name.includes("Temp")) icon = "assets/sensor_temp.svg";
      else if (s.name.includes("Alarm")) icon = "assets/actuator_alarm.svg";
      else if (s.name.includes("Cooling")) icon = "assets/actuator_fan.svg";

      card.innerHTML = `
        <div class="service-card-left">
          <img src="${icon}" alt="Service Icon" class="service-icon">
          <div class="service-info">
            <h4>
              ${s.name}
              <span class="service-type-badge ${s.is_sensor ? 'sensor' : 'actuator'}">
                ${s.is_sensor ? 'Sensor' : 'Actuator'}
              </span>
            </h4>
            <div class="service-api-sig">${s.api || s.name + '()'}</div>
            <div class="service-desc">${s.description || ''} &bull; Thing: <strong>${s.thing_id}</strong></div>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="openServiceTestModal('${s.name}', '${s.description || ''}', '${s.is_sensor ? '()' : '(1)'}')">
          Invoke Test
        </button>
      `;
      servicesList.appendChild(card);
    });
  }

  async function fetchSavedApps() {
    try {
      const resp = await fetch("/api/apps");
      const data = await resp.json();
      if (labelWorkingDir) labelWorkingDir.textContent = data.working_dir;
      countApps.textContent = data.apps.length;

      if (!savedAppsList) return;
      savedAppsList.innerHTML = "";

      if (data.apps.length === 0) {
        savedAppsList.innerHTML = "<p style='color:#64748b; font-size:0.78rem;'>No saved apps in working directory.</p>";
        return;
      }

      data.apps.forEach(app => {
        const item = document.createElement("div");
        item.className = "saved-app-item";
        item.innerHTML = `
          <div class="saved-app-name">
            <span>${app.name}</span>
            <span class="saved-app-file">${app.filename}</span>
          </div>
          <div class="saved-app-desc">${app.description || 'Atlas App'} (${(app.steps || []).length} steps)</div>
          <div class="saved-app-controls">
            <button class="btn btn-primary btn-sm btn-activate" title="Activate App">▶ Run</button>
            <button class="btn btn-secondary btn-sm btn-stop" title="Stop App">■ Stop</button>
            <button class="btn btn-danger btn-sm btn-delete" title="Delete App">✕</button>
          </div>
        `;

        // Double click to upload into editor (Requirement 4)
        item.addEventListener("dblclick", () => {
          appEditor.loadApp(app);
          alert(`Application '${app.name}' uploaded into Editor.`);
        });

        // Activate button
        item.querySelector(".btn-activate").addEventListener("click", async (e) => {
          e.stopPropagation();
          const r = await fetch("/api/apps/activate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: app.name })
          });
          const res = await r.json();
          if (!res.success) alert(res.error);
          fetchStatusPanel();
        });

        // Stop button
        item.querySelector(".btn-stop").addEventListener("click", async (e) => {
          e.stopPropagation();
          const r = await fetch("/api/apps/stop", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: app.name })
          });
          fetchStatusPanel();
        });

        // Delete button
        item.querySelector(".btn-delete").addEventListener("click", async (e) => {
          e.stopPropagation();
          if (confirm(`Delete app '${app.name}' from storage?`)) {
            await fetch(`/api/apps/delete?name=${encodeURIComponent(app.name)}`, { method: "DELETE" });
            fetchSavedApps();
            fetchStatusPanel();
          }
        });

        savedAppsList.appendChild(item);
      });
    } catch (err) {
      console.warn("Could not fetch saved apps:", err);
    }
  }

  async function fetchStatusPanel() {
    try {
      const resp = await fetch("/api/status");
      const data = await resp.json();
      const list = data.status_panel || [];

      const activeCount = list.filter(x => x.status === "Active").length;
      activeAppCount.textContent = activeCount;
      if (activeCount > 0) {
        statusPulseDot.classList.add("active");
      } else {
        statusPulseDot.classList.remove("active");
      }

      if (!statusTableBody) return;
      if (list.length === 0) {
        statusTableBody.innerHTML = `<tr><td colspan="5" class="empty-state">No applications currently active.</td></tr>`;
        return;
      }

      statusTableBody.innerHTML = list.map(item => {
        const stateClass = item.status.toLowerCase();
        const latestResultStr = item.last_result ? JSON.stringify(item.last_result) : "—";
        const stopBtn = item.can_stop 
          ? `<button class="btn btn-danger btn-sm" onclick="stopAppByName('${item.app_name}')">■ Stop</button>`
          : `<span style="color:#64748b; font-size:0.75rem;">Finished</span>`;

        return `
          <tr>
            <td><strong>${item.app_name}</strong></td>
            <td>${item.start_time}</td>
            <td><span class="badge-state ${stateClass}">${item.status}</span></td>
            <td style="font-family:var(--code-font); font-size:0.75rem; color:#a7f3d0;">${latestResultStr}</td>
            <td>${stopBtn}</td>
          </tr>
        `;
      }).join("");

    } catch (err) {}
  }

  window.stopAppByName = async (appName) => {
    await fetch("/api/apps/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: appName })
    });
    fetchStatusPanel();
  };

  async function fetchTraceLogs() {
    try {
      const resp = await fetch("/api/logs");
      const data = await resp.json();
      if (!traceConsoleBody) return;

      const logs = data.logs || [];
      traceConsoleBody.innerHTML = logs.map(l => `
        <div class="log-entry">
          <span class="log-time">[${l.time_str}]</span>
          <span class="log-level-${l.level}">[${l.level}]</span>
          <span>${l.message}</span>
        </div>
      `).join("");
      traceConsoleBody.scrollTop = traceConsoleBody.scrollHeight;
    } catch (err) {}
  }

  async function fetchTweetsFeed() {
    try {
      const resp = await fetch("/api/tweets");
      const data = await resp.json();
      const container = document.getElementById("tweetsStream");
      if (!container) return;

      const tweets = data.tweets || [];
      if (tweets.length === 0) {
        container.innerHTML = "<p style='color:#64748b;'>Waiting for tweets from Atlas network...</p>";
        return;
      }

      container.innerHTML = tweets.slice(-25).reverse().map(item => `
        <div class="tweet-bubble">
          <div style="font-size:0.75rem; color:#64748b; margin-bottom:4px;">
            ${new Date(item.timestamp * 1000).toLocaleTimeString()} &bull; <span class="tweet-type-tag">${item.tweet["Tweet Type"]}</span>
          </div>
          <pre style="margin:0; color:#cbd5e1; white-space:pre-wrap;">${JSON.stringify(item.tweet, null, 2)}</pre>
        </div>
      `).join("");
    } catch (err) {}
  }

  document.getElementById("btnRefreshDiscovery")?.addEventListener("click", () => {
    fetchSpaceData();
    fetchSavedApps();
  });

  // Initial load & polling loop
  fetchSpaceData();
  fetchSavedApps();
  fetchStatusPanel();

  pollInterval = setInterval(() => {
    fetchStatusPanel();
    fetchTraceLogs();
    if (activeTab === "tab-tweets") {
      fetchTweetsFeed();
    }
  }, 1500);
});

