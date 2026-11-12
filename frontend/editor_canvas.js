/**
 * Atlas IoT Application Editor (GUI + Text Hybrid)
 * Requirement 3: Drag & Drop Palette, Step Configuration, Type 1-5 Constructs,
 * Clear, Finalize, and Save operations.
 */

class IoTAppEditor {
  constructor(canvasElementId, jsonEditorId, paletteElementId) {
    this.canvas = document.getElementById(canvasElementId);
    this.jsonEditor = document.getElementById(jsonEditorId);
    this.palette = document.getElementById(paletteElementId);
    this.steps = [];
    this.availableServices = [];
    this.currentAppName = "NewAtlasApp";
    this.currentAppDesc = "Custom composed IoT workflow";
    this.isLooping = false;
    this.loopInterval = 3;

    this.initEventListeners();
  }

  setServices(services) {
    this.availableServices = services || [];
    this.renderPalette();
    this.renderCanvas();
  }

  initEventListeners() {
    // Construct buttons
    document.querySelectorAll(".btn-construct").forEach(btn => {
      btn.addEventListener("click", () => {
        const type = btn.dataset.type;
        this.addStep(type);
      });
    });

    // View toggles: Visual Canvas vs JSON
    const btnVisual = document.getElementById("btnViewVisual");
    const btnJson = document.getElementById("btnViewJson");
    const canvasSteps = document.getElementById("canvasStepsList");
    const canvasJson = document.getElementById("canvasJsonContainer");

    btnVisual?.addEventListener("click", () => {
      btnVisual.classList.add("active");
      btnJson.classList.remove("active");
      canvasSteps.style.display = "flex";
      canvasJson.style.display = "none";
      this.syncFromJson();
      this.renderCanvas();
    });

    btnJson?.addEventListener("click", () => {
      btnJson.classList.add("active");
      btnVisual.classList.remove("active");
      canvasSteps.style.display = "none";
      canvasJson.style.display = "block";
      this.syncToJson();
    });
  }

  renderPalette() {
    if (!this.palette) return;
    this.palette.innerHTML = "";

    this.availableServices.forEach(s => {
      const item = document.createElement("div");
      item.className = "palette-item";
      item.draggable = true;
      item.innerHTML = `
        <span>${s.name}</span>
        <span class="service-type-badge ${s.is_sensor ? 'sensor' : 'actuator'}">${s.is_sensor ? 'S' : 'A'}</span>
      `;

      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", JSON.stringify({ service_name: s.name, is_sensor: s.is_sensor }));
      });

      // Click to add
      item.addEventListener("click", () => {
        this.addStep("Type1", s.name);
      });

      this.palette.appendChild(item);
    });

    // Allow dropping into canvas
    const canvasSteps = document.getElementById("canvasStepsList");
    if (canvasSteps) {
      canvasSteps.addEventListener("dragover", (e) => e.preventDefault());
      canvasSteps.addEventListener("drop", (e) => {
        e.preventDefault();
        try {
          const raw = e.dataTransfer.getData("text/plain");
          const data = JSON.parse(raw);
          if (data && data.service_name) {
            this.addStep("Type1", data.service_name);
          }
        } catch (err) {}
      });
    }
  }

  addStep(type, defaultService = "") {
    const sName = defaultService || (this.availableServices[0] ? this.availableServices[0].name : "Read_Temperature");
    const sTarget = this.availableServices[1] ? this.availableServices[1].name : (this.availableServices[0] ? this.availableServices[0].name : "Set_Cooling_Indicator");

    let step = {
      step_index: this.steps.length + 1,
      type: type,
      description: `Step #${this.steps.length + 1} (${type})`
    };

    if (type === "Type1") {
      step.service = sName;
      step.inputs = "()";
    } else if (type === "Type2") {
      step.service_a = sName;
      step.service_b = sTarget;
      step.inputs_a = "()";
      step.inputs_b = "(1)";
    } else if (type === "Type3") {
      step.service_a = sName;
      step.service_b = sTarget;
      step.operator = ">";
      step.threshold = 28;
      step.inputs_a = "()";
      step.inputs_b = "(1)";
      step.else_service = sTarget;
      step.else_inputs = "(0)";
    } else if (type === "Type5") {
      step.logic_op = "AND";
      step.condition1 = { service: "Read_Light_Level", operator: "<", threshold: 20 };
      step.condition2 = { service: "Read_Temperature", operator: ">", threshold: 30 };
      step.action_service = "Set_Alarm_LED";
      step.action_inputs = "(1)";
    }

    this.steps.push(step);
    this.renderCanvas();
    this.syncToJson();
  }

  removeStep(index) {
    this.steps.splice(index, 1);
    this.steps.forEach((s, idx) => {
      s.step_index = idx + 1;
    });
    this.renderCanvas();
    this.syncToJson();
  }

  clear() {
    this.steps = [];
    this.currentAppName = "NewAtlasApp";
    this.currentAppDesc = "Custom composed IoT workflow";
    this.isLooping = false;
    this.loopInterval = 3;
    const nameInput = document.getElementById("appInputName");
    const descInput = document.getElementById("appInputDesc");
    const loopChk = document.getElementById("chkAppLoop");
    if (nameInput) nameInput.value = this.currentAppName;
    if (descInput) descInput.value = this.currentAppDesc;
    if (loopChk) loopChk.checked = false;

    this.renderCanvas();
    this.syncToJson();
  }

  loadApp(appData) {
    if (!appData) return;
    this.currentAppName = appData.name || "LoadedApp";
    this.currentAppDesc = appData.description || "";
    this.isLooping = !!appData.loop;
    this.loopInterval = appData.loop_interval_sec || 3;
    this.steps = appData.steps || [];

    const nameInput = document.getElementById("appInputName");
    const descInput = document.getElementById("appInputDesc");
    const loopChk = document.getElementById("chkAppLoop");
    const loopNum = document.getElementById("numLoopInterval");

    if (nameInput) nameInput.value = this.currentAppName;
    if (descInput) descInput.value = this.currentAppDesc;
    if (loopChk) loopChk.checked = this.isLooping;
    if (loopNum) loopNum.value = this.loopInterval;

    this.renderCanvas();
    this.syncToJson();
  }

  getAppDefinition() {
    const nameInput = document.getElementById("appInputName");
    const descInput = document.getElementById("appInputDesc");
    const loopChk = document.getElementById("chkAppLoop");
    const loopNum = document.getElementById("numLoopInterval");

    const appName = nameInput ? nameInput.value.trim() : this.currentAppName;
    const sanitizedName = appName.replace(/[^a-zA-Z0-9_\-]/g, "_") || "atlas_app";

    return {
      name: sanitizedName,
      description: descInput ? descInput.value.trim() : this.currentAppDesc,
      loop: loopChk ? loopChk.checked : false,
      loop_interval_sec: loopNum ? parseFloat(loopNum.value) || 3.0 : 3.0,
      steps: this.steps
    };
  }

  syncToJson() {
    if (!this.jsonEditor) return;
    const def = this.getAppDefinition();
    this.jsonEditor.value = JSON.stringify(def, null, 2);
  }

  syncFromJson() {
    if (!this.jsonEditor) return;
    try {
      const data = JSON.parse(this.jsonEditor.value);
      if (data && Array.isArray(data.steps)) {
        this.steps = data.steps;
        this.currentAppName = data.name || this.currentAppName;
        this.currentAppDesc = data.description || this.currentAppDesc;
        this.isLooping = !!data.loop;
      }
    } catch (e) {}
  }

  renderCanvas() {
    const container = document.getElementById("canvasStepsList");
    if (!container) return;
    container.innerHTML = "";

    if (this.steps.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:40px; color:#64748b;">
          <p style="font-size:1.1rem; margin-bottom:8px;">Canvas is empty.</p>
          <p style="font-size:0.85rem;">Click a construct button on the left or drag a service to add steps.</p>
        </div>
      `;
      return;
    }

    this.steps.forEach((step, idx) => {
      const card = document.createElement("div");
      card.className = "step-card";

      // Service option dropdown options
      const serviceOptions = this.availableServices.map(s => 
        `<option value="${s.name}">${s.name}</option>`
      ).join("");

      let bodyHtml = "";

      // TYPE 1: Sequential
      if (step.type === "Type1") {
        bodyHtml = `
          <span>Run Service:</span>
          <select class="step-input" data-field="service">${serviceOptions}</select>
          <span>with inputs:</span>
          <input type="text" class="step-input" data-field="inputs" value="${step.inputs || '()'}" style="width:80px;">
        `;
      }
      // TYPE 2: Order-based
      else if (step.type === "Type2") {
        bodyHtml = `
          <span>If Service:</span>
          <select class="step-input" data-field="service_a">${serviceOptions}</select>
          <span>runs to completion &rarr; Then Run:</span>
          <select class="step-input" data-field="service_b">${serviceOptions}</select>
          <span>(args:</span>
          <input type="text" class="step-input" data-field="inputs_b" value="${step.inputs_b || '(1)'}" style="width:60px;">
          <span>)</span>
        `;
      }
      // TYPE 3: Condition-based
      else if (step.type === "Type3") {
        bodyHtml = `
          <span>If Service:</span>
          <select class="step-input" data-field="service_a">${serviceOptions}</select>
          <span>return value</span>
          <select class="step-input" data-field="operator">
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
            <option value="==">==</option>
            <option value="!=">!=</option>
            <option value=">=">&gt;=</option>
            <option value="<=">&lt;=</option>
          </select>
          <input type="number" class="step-input" data-field="threshold" value="${step.threshold ?? 28}" style="width:60px;">
          <span>&rarr; Run:</span>
          <select class="step-input" data-field="service_b">${serviceOptions}</select>
          <input type="text" class="step-input" data-field="inputs_b" value="${step.inputs_b || '(1)'}" style="width:50px;">
        `;
      }
      // TYPE 5: Compound
      else if (step.type === "Type5") {
        bodyHtml = `
          <span>Rule: [${step.condition1?.service || 'Read_Light_Level'} ${step.condition1?.operator || '<'} ${step.condition1?.threshold ?? 20}]</span>
          <strong>${step.logic_op || 'AND'}</strong>
          <span>[${step.condition2?.service || 'Read_Temperature'} ${step.condition2?.operator || '>'} ${step.condition2?.threshold ?? 30}]</span>
          <span>&rarr; Action:</span>
          <select class="step-input" data-field="action_service">${serviceOptions}</select>
        `;
      }

      card.innerHTML = `
        <div class="step-header">
          <div class="step-title">
            <span class="step-badge">${step.type}</span>
            <span>Step #${step.step_index}: ${step.description || ''}</span>
          </div>
          <button class="btn-remove-step" title="Remove Step">✕</button>
        </div>
        <div class="step-body">
          ${bodyHtml}
        </div>
      `;

      // Set select values
      card.querySelectorAll("select").forEach(sel => {
        const field = sel.dataset.field;
        if (field && step[field]) sel.value = step[field];
        sel.addEventListener("change", (e) => {
          step[field] = e.target.value;
          this.syncToJson();
        });
      });

      // Set input values
      card.querySelectorAll("input").forEach(inp => {
        const field = inp.dataset.field;
        if (field && step[field] !== undefined) inp.value = step[field];
        inp.addEventListener("input", (e) => {
          step[field] = e.target.value;
          this.syncToJson();
        });
      });

      // Delete step
      card.querySelector(".btn-remove-step").addEventListener("click", () => {
        this.removeStep(idx);
      });

      container.appendChild(card);
    });
  }
}

