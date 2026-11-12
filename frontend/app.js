/**
 * Atlas IoT Application IDE - Frontend Controller
 * Course: B8019 Programming the Internet of Things
 */

document.addEventListener("DOMContentLoaded", () => {
  let spaceData = null;
  let relationshipsGraph = null;
  let appEditor = null;
  let currentFilter = "all";

  relationshipsGraph = new RelationshipsGraph("relationshipSvg", "relationshipsCardsList");
  appEditor = new IoTAppEditor();

  // Tab switching
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      const target = document.getElementById(tab.dataset.tab);
      if (target) target.classList.add("active");

      if (tab.dataset.tab === "tab-relationships") {
        setTimeout(() => relationshipsGraph.render(), 50);
      }
    });
  });

  // Services filter buttons
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      renderServices();
    });
  });

  // App Editor Actions
  document.getElementById("btnNewApp")?.addEventListener("click", () => {
    appEditor.clear();
  });

  document.getElementById("btnClearEditor")?.addEventListener("click", () => {
    if (confirm("Clear editor canvas?")) appEditor.clear();
  });

  // Save App (Requirement 4)
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

  // Finalize App (Requirement 3)
  document.getElementById("btnFinalizeApp")?.addEventListener("click", async () => {
    const appDef = appEditor.getAppDefinition();
    if (!appDef.name) {
      alert("Please provide an App Name.");
      return;
    }
    if (!appDef.steps || appDef.steps.length === 0) {
      alert("Cannot finalize an empty app. Add at least one step.");
      return;
    }
    const resp = await fetch("/api/apps/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app: appDef, filename: appDef.name })
    });
    const res = await resp.json();
    if (res.success) {
      alert(`✓ Application '${appDef.name}' finalized and added to Apps tab!`);
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

  // Live Logs Console Toggle
  const traceDrawer = document.getElementById("traceDrawer");
  const btnToggleLogs = document.getElementById("btnToggleTraceConsole");
  btnToggleLogs?.addEventListener("click", () => {
    const isHidden = traceDrawer.style.display === "none";
    traceDrawer.style.display = isHidden ? "flex" : "none";
    btnToggleLogs.textContent = isHidden ? "▼ Close Logs" : "▲ Live Logs";
  });
  document.getElementById("btnClearLogs")?.addEventListener("click", () => {
    document.getElementById("traceBody").innerHTML = "";
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
      }
      document.getElementById("countThings").textContent = spaceData.counts.things;
      document.getElementById("countServices").textContent = spaceData.counts.services;
      document.getElementById("countRelationships").textContent = spaceData.counts.relationships;

      renderThings();
      renderServices();
      relationshipsGraph.setData(spaceData.services, spaceData.relationships);
      appEditor.setServices(spaceData.services);
    } catch (e) {
      console.warn("Could not connect to Atlas IDE server:", e);
    }
  }

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
          <tr><td>Address:</td><td>${thing.ip}:${thing.port}</td></tr>
          <tr><td>OS:</td><td>${thing.os || 'Raspbian'}</td></tr>
          <tr><td>Model:</td><td>${thing.model || 'Raspberry Pi 4B'}</td></tr>
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

  function renderServices() {
    const list = document.getElementById("servicesList");
    if (!list || !spaceData) return;
    list.innerHTML = "";

    const allSrv = spaceData.services;
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

    filtered.forEach(s => {
      const item = document.createElement("div");
      item.className = "service-item";

      let icon = "assets/app_icon.svg";
      if (s.name.includes("Light")) icon = "assets/sensor_light.svg";
      else if (s.name.includes("Temp")) icon = "assets/sensor_temp.svg";
      else if (s.name.includes("Alarm")) icon = "assets/actuator_alarm.svg";
      else if (s.name.includes("Cooling")) icon = "assets/actuator_fan.svg";

      item.innerHTML = `
        <img src="${icon}" alt="Icon" class="service-icon">
        <div class="service-details">
          <h4>
            ${s.name}
            <span class="badge-tag ${s.is_sensor ? 'sensor' : 'actuator'}">
              ${s.is_sensor ? 'Sensor' : 'Actuator'}
            </span>
          </h4>
          <div class="service-sig">${s.api || s.name + '()'}</div>
          <div class="service-desc">${s.description || ''} &bull; Thing: <strong>${s.thing_id}</strong></div>
        </div>
      `;
      list.appendChild(item);
    });
  }

  async function loadSavedApps() {
    try {
      const r = await fetch("/api/apps");
      const data = await r.json();
      document.getElementById("countApps").textContent = data.apps.length;
      document.getElementById("labelWorkingDir").textContent = data.working_dir;

      const container = document.getElementById("savedAppsList");
      if (!container) return;
      container.innerHTML = "";

      data.apps.forEach(app => {
        const card = document.createElement("div");
        card.className = "saved-app-card";
        card.innerHTML = `
          <h4>
            <span>${app.name}</span>
            <span class="saved-app-file">${app.filename}</span>
          </h4>
          <div class="saved-app-desc">${app.description || 'Atlas App'} (${(app.steps || []).length} steps)</div>
          <div class="saved-app-btns">
            <button class="btn btn-primary btn-sm btn-run">▶ Run</button>
            <button class="btn btn-secondary btn-sm btn-stop">■ Stop</button>
            <button class="btn btn-danger btn-sm btn-del">✕</button>
          </div>
        `;

        // Double click to load into editor (Requirement 4)
        card.addEventListener("dblclick", () => {
          appEditor.loadApp(app);
          alert(`Application '${app.name}' uploaded into Editor.`);
        });

        // Run
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

        // Stop
        card.querySelector(".btn-stop").addEventListener("click", async (e) => {
          e.stopPropagation();
          await fetch("/api/apps/stop", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: app.name })
          });
          updateStatusPanel();
        });

        // Delete
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
        tbody.innerHTML = `<tr><td colspan="5" class="empty">No applications currently active.</td></tr>`;
        return;
      }

      tbody.innerHTML = list.map(item => `
        <tr>
          <td><strong>${item.app_name}</strong></td>
          <td>${item.start_time}</td>
          <td><span class="badge-status ${item.status.toLowerCase()}">${item.status}</span></td>
          <td style="font-family:var(--code); color:#a7f3d0;">${item.last_result ? JSON.stringify(item.last_result) : '—'}</td>
          <td>
            ${item.can_stop 
              ? `<button class="btn btn-danger btn-sm" onclick="stopApp('${item.app_name}')">■ Stop</button>`
              : `<span style="color:#64748b; font-size:0.75rem;">Done</span>`}
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

      body.innerHTML = (d.logs || []).map(l => `
        <div class="log-row">
          <span class="log-t">[${l.time_str}]</span>
          <span class="log-m">${l.message}</span>
        </div>
      `).join("");
      body.scrollTop = body.scrollHeight;
    } catch (e) {}
  }

  // Initial calls & polling
  fetchSpace();
  loadSavedApps();
  updateStatusPanel();

  setInterval(() => {
    updateStatusPanel();
    updateLogs();
  }, 1500);
});
