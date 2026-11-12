/**
 * Atlas IoT Application Editor (GUI + Text Hybrid)
 * Requirement 3: Constructs Type 1, Type 2, Type 3, Clear, Finalize, and Save.
 */

class IoTAppEditor {
  constructor() {
    this.steps = [];
    this.availableServices = [];
    this.initModeToggles();
  }

  initModeToggles() {
    const btnVisual = document.getElementById("btnModeVisual");
    const btnJson = document.getElementById("btnModeJson");
    const stepsBox = document.getElementById("canvasStepsList");
    const jsonBox = document.getElementById("canvasJsonContainer");

    btnVisual?.addEventListener("click", () => {
      btnVisual.classList.add("active");
      btnJson?.classList.remove("active");
      stepsBox.style.display = "flex";
      jsonBox.style.display = "none";
      this.syncFromJson();
      this.render();
    });

    btnJson?.addEventListener("click", () => {
      btnJson.classList.add("active");
      btnVisual?.classList.remove("active");
      stepsBox.style.display = "none";
      jsonBox.style.display = "block";
      this.syncToJson();
    });

    // Construct buttons
    document.querySelectorAll(".btn-construct").forEach(btn => {
      btn.addEventListener("click", () => {
        this.addStep(btn.dataset.type);
      });
    });
  }

  setServices(services) {
    this.availableServices = services || [];
    this.renderPalette();
    this.render();
  }

  renderPalette() {
    const container = document.getElementById("paletteServicesList");
    if (!container) return;
    container.innerHTML = "";

    this.availableServices.forEach(s => {
      const btn = document.createElement("button");
      btn.className = "palette-srv-btn";
      btn.innerHTML = `+ ${s.name} <span style="font-size:0.65rem; color:${s.is_sensor ? '#34d399' : '#f87171'}">[${s.is_sensor ? 'Sensor' : 'Actuator'}]</span>`;
      btn.addEventListener("click", () => {
        this.addStep("Type1", s.name);
      });
      container.appendChild(btn);
    });
  }

  addStep(type, defaultService = "") {
    const s1 = defaultService || (this.availableServices[0] ? this.availableServices[0].name : "Read_Temperature");
    const s2 = this.availableServices[1] ? this.availableServices[1].name : (this.availableServices[0] ? this.availableServices[0].name : "Set_Cooling_Indicator");

    const newStep = {
      step_index: this.steps.length + 1,
      type: type,
      description: `Step #${this.steps.length + 1}`
    };

    if (type === "Type1") {
      newStep.service = s1;
      newStep.inputs = "()";
    } else if (type === "Type2") {
      newStep.service_a = s1;
      newStep.service_b = s2;
      newStep.inputs_a = "()";
      newStep.inputs_b = "(1)";
    } else if (type === "Type3") {
      newStep.service_a = s1;
      newStep.operator = ">";
      newStep.threshold = 28;
      newStep.service_b = s2;
      newStep.inputs_b = "(1)";
      newStep.else_service = s2;
      newStep.else_inputs = "(0)";
    }

    this.steps.push(newStep);
    this.render();
    this.syncToJson();
  }

  removeStep(index) {
    this.steps.splice(index, 1);
    this.steps.forEach((s, i) => { s.step_index = i + 1; });
    this.render();
    this.syncToJson();
  }

  clear() {
    this.steps = [];
    document.getElementById("appInputName").value = "NewApp";
    document.getElementById("appInputDesc").value = "Custom composed IoT app";
    document.getElementById("chkAppLoop").checked = false;
    this.render();
    this.syncToJson();
  }

  loadApp(appData) {
    if (!appData) return;
    this.steps = appData.steps || [];
    document.getElementById("appInputName").value = appData.name || "LoadedApp";
    document.getElementById("appInputDesc").value = appData.description || "";
    document.getElementById("chkAppLoop").checked = !!appData.loop;
    document.getElementById("numLoopInterval").value = appData.loop_interval_sec || 3;
    this.render();
    this.syncToJson();
  }

  getAppDefinition() {
    const rawName = document.getElementById("appInputName")?.value.trim() || "atlas_app";
    const sanitizedName = rawName.replace(/[^a-zA-Z0-9_\-]/g, "_");
    const desc = document.getElementById("appInputDesc")?.value.trim() || "";
    const isLoop = document.getElementById("chkAppLoop")?.checked || false;
    const loopInterval = parseFloat(document.getElementById("numLoopInterval")?.value) || 3.0;

    return {
      name: sanitizedName,
      description: desc,
      loop: isLoop,
      loop_interval_sec: loopInterval,
      steps: this.steps
    };
  }

  syncToJson() {
    const textarea = document.getElementById("appJsonEditor");
    if (textarea) {
      textarea.value = JSON.stringify(this.getAppDefinition(), null, 2);
    }
  }

  syncFromJson() {
    const textarea = document.getElementById("appJsonEditor");
    if (!textarea) return;
    try {
      const parsed = JSON.parse(textarea.value);
      if (parsed && Array.isArray(parsed.steps)) {
        this.steps = parsed.steps;
        document.getElementById("appInputName").value = parsed.name || "LoadedApp";
        document.getElementById("appInputDesc").value = parsed.description || "";
        document.getElementById("chkAppLoop").checked = !!parsed.loop;
      }
    } catch (e) {}
  }

  render() {
    const container = document.getElementById("canvasStepsList");
    if (!container) return;
    container.innerHTML = "";

    if (this.steps.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:30px; color:#64748b;">
          <p>Canvas is empty.</p>
          <p style="font-size:0.8rem; margin-top:4px;">Click a construct button on the left to add your first execution step.</p>
        </div>
      `;
      return;
    }

    const options = this.availableServices.map(s => `<option value="${s.name}">${s.name}</option>`).join("");

    this.steps.forEach((step, idx) => {
      const card = document.createElement("div");
      card.className = "step-card";

      let inner = "";
      if (step.type === "Type1") {
        inner = `
          <span>Run:</span>
          <select data-key="service">${options}</select>
          <span>with args:</span>
          <input type="text" data-key="inputs" value="${step.inputs || '()'}" style="width:70px;">
        `;
      } else if (step.type === "Type2") {
        inner = `
          <span>If</span>
          <select data-key="service_a">${options}</select>
          <span>succeeds &rarr; Then Run:</span>
          <select data-key="service_b">${options}</select>
          <span>(args:</span>
          <input type="text" data-key="inputs_b" value="${step.inputs_b || '(1)'}" style="width:50px;">
          <span>)</span>
        `;
      } else if (step.type === "Type3") {
        inner = `
          <span>If</span>
          <select data-key="service_a">${options}</select>
          <span>returns</span>
          <select data-key="operator">
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
            <option value="==">==</option>
            <option value="!=">!=</option>
          </select>
          <input type="number" data-key="threshold" value="${step.threshold ?? 28}" style="width:50px;">
          <span>&rarr; Run:</span>
          <select data-key="service_b">${options}</select>
          <input type="text" data-key="inputs_b" value="${step.inputs_b || '(1)'}" style="width:45px;">
        `;
      }

      card.innerHTML = `
        <div class="step-top">
          <div>
            <span class="step-tag">${step.type}</span>
            <strong style="font-size:0.85rem; margin-left:6px;">Step #${step.step_index}</strong>
          </div>
          <button class="btn-del-step" title="Remove Step">✕</button>
        </div>
        <div class="step-controls">
          ${inner}
        </div>
      `;

      // Set input bindings
      card.querySelectorAll("select, input").forEach(el => {
        const key = el.dataset.key;
        if (key && step[key] !== undefined) el.value = step[key];
        el.addEventListener("change", (e) => {
          step[key] = e.target.value;
          this.syncToJson();
        });
      });

      card.querySelector(".btn-del-step")?.addEventListener("click", () => {
        this.removeStep(idx);
      });

      container.appendChild(card);
    });
  }
}
