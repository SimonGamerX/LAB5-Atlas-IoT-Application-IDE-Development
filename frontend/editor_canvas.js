/**
 * Atlas IoT Application Editor (GUI + Text Hybrid)
 * Requirement 3: Constructs Type 1, Type 2, Type 3, Clear, Finalize, and Save.
 */

class IoTAppEditor {
  constructor() {
    this.steps = [];
    this.availableServices = [];
    this.onChangeCallback = null;
    this.initModeToggles();
    this.initMetaListeners();
  }

  initMetaListeners() {
    document.getElementById("appInputName")?.addEventListener("input", () => this.notifyChange());
    document.getElementById("chkAppLoop")?.addEventListener("change", () => this.notifyChange());
    document.getElementById("numLoopInterval")?.addEventListener("input", () => this.notifyChange());
  }

  setOnChange(callback) {
    this.onChangeCallback = callback;
  }

  notifyChange() {
    if (typeof this.onChangeCallback === "function") {
      try {
        this.onChangeCallback(this.getAppDefinition());
      } catch (err) {
        console.error("Error in appEditor onChangeCallback:", err);
      }
    }
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
      btn.innerHTML = `+ ${s.name} <span style="font-size:11px; color:${s.is_sensor ? 'var(--accent)' : 'var(--warning)'}">[${s.is_sensor ? 'Sensor' : 'Actuator'}]</span>`;
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
    } else if (type === "Type4") {
      newStep.interaction_mode = "input";
      newStep.var_name = "target_temp";
      newStep.prompt = "Enter temperature threshold (C):";
      newStep.default_value = "27";
      newStep.message = "Circadian Guardian alert: comfort threshold triggered";
    } else if (type === "Type5") {
      newStep.expression = `(Read_Light_Level < 20 AND Read_Temperature > 30)`;
      newStep.service_b = "Set_Alarm_LED";
      newStep.inputs_b = "(1)";
      newStep.else_service = "";
      newStep.else_inputs = "(0)";
    } else if (type === "Group") {
      newStep.steps = [];
    }

    this.steps.push(newStep);
    this.render();
    this.syncToJson();
    this.notifyChange();
  }

  removeStep(index) {
    this.steps.splice(index, 1);
    this.steps.forEach((s, i) => { s.step_index = i + 1; });
    this.render();
    this.syncToJson();
    this.notifyChange();
  }

  clear() {
    this.steps = [];
    document.getElementById("appInputName").value = "NewApp";
    document.getElementById("appInputDesc").value = "Custom composed IoT app";
    document.getElementById("chkAppLoop").checked = false;
    this.render();
    this.syncToJson();
    this.notifyChange();
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
    this.notifyChange();
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
        this.notifyChange();
      }
    } catch (e) {}
  }

  _escAttr(val) {
    return String(val ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  render() {
    const container = document.getElementById("canvasStepsList");
    if (!container) return;
    container.innerHTML = "";

    if (this.steps.length === 0) {
      container.innerHTML = `
        <div class="canvas-empty-prompt">
          <p class="empty-title">Workspace Ready — Upload or Create New App</p>
          <p class="empty-sub">Double-click a saved <code>.iot</code> app on the left, click <strong>Upload .iot</strong>, or choose a construct (Type 1–5) from the Palette.</p>
        </div>
      `;
      return;
    }

    const groupSummary = document.createElement("div");
    groupSummary.className = "step-group-delimiter";
    const stepLabels = this.steps.map(s => `${s.type}#${s.step_index}`).join(" ; ");
    groupSummary.innerHTML = `<span class="delim-brace">{</span> <span class="mono">${this._escAttr(stepLabels)}</span> <span class="delim-brace">}</span>`;
    container.appendChild(groupSummary);

    const options = this.availableServices.map(s => `<option value="${s.name}">${s.name}</option>`).join("");
    const optionalOptions = `<option value="">(None)</option>` + options;

    this.steps.forEach((step, idx) => {
      const card = document.createElement("div");
      card.className = `step-card step-${String(step.type || "Type1").toLowerCase()}`;

      let inner = "";
      if (step.type === "Type1") {
        inner = `
          <span>Run:</span>
          <select data-key="service">${options}</select>
          <span>with args:</span>
          <input type="text" data-key="inputs" value="${this._escAttr(step.inputs || '()')}" style="width:74px;">
        `;
      } else if (step.type === "Type2") {
        inner = `
          <span>If</span>
          <select data-key="service_a">${options}</select>
          <span>succeeds &rarr; Run:</span>
          <select data-key="service_b">${options}</select>
          <span>args:</span>
          <input type="text" data-key="inputs_b" value="${this._escAttr(step.inputs_b || '(1)')}" style="width:54px;">
        `;
      } else if (step.type === "Type3") {
        inner = `
          <span>If</span>
          <select data-key="service_a">${options}</select>
          <span>returns</span>
          <select data-key="operator">
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
            <option value=">=">&gt;=</option>
            <option value="<=">&lt;=</option>
            <option value="==">==</option>
            <option value="!=">!=</option>
          </select>
          <input type="text" data-key="threshold" value="${this._escAttr(step.threshold ?? 28)}" style="width:66px;" title="Number or {var_name}">
          <span>&rarr; Run:</span>
          <select data-key="service_b">${options}</select>
          <input type="text" data-key="inputs_b" value="${this._escAttr(step.inputs_b || '(1)')}" style="width:48px;">
        `;
      } else if (step.type === "Type4") {
        const mode = (step.interaction_mode || "input").toLowerCase();
        if (mode === "input" || mode === "prompt") {
          inner = `
            <select data-key="interaction_mode" style="width:92px;">
              <option value="input">User Input</option>
              <option value="output">User Output</option>
            </select>
            <span>Var:</span>
            <input type="text" data-key="var_name" value="${this._escAttr(step.var_name || 'user_input')}" style="width:96px;" class="mono">
            <span>Prompt:</span>
            <input type="text" data-key="prompt" value="${this._escAttr(step.prompt || 'Enter parameter:')}" style="flex:1; min-width:160px;">
            <span>Default:</span>
            <input type="text" data-key="default_value" value="${this._escAttr(step.default_value || '')}" style="width:58px;">
          `;
        } else {
          inner = `
            <select data-key="interaction_mode" style="width:96px;">
              <option value="input">User Input</option>
              <option value="output">User Output</option>
            </select>
            <span>Display:</span>
            <input type="text" data-key="message" value="${this._escAttr(step.message || 'Operation status alert')}" style="flex:1; min-width:220px;" title="Supports {var_name} or {ServiceName}">
          `;
        }
      } else if (step.type === "Type5") {
        const chipTokens = ["(", ")", "AND", "OR", ">", "<", ...this.availableServices.map(s => s.name)];
        const chipsHtml = chipTokens.map(tok => `<button type="button" class="logic-chip mono" data-insert="${this._escAttr(tok)}">${tok}</button>`).join("");
        inner = `
          <div class="type5-grid">
            <div class="type5-expr-row">
              <span class="mono" style="font-weight:600; color:var(--chart-3);">IF</span>
              <input type="text" data-key="expression" class="type5-expr-input mono" value="${this._escAttr(step.expression || '(Read_Light_Level < 20 AND Read_Temperature > 30)')}" placeholder="(ServiceA < 20 AND (ServiceB > 30 OR ...))">
            </div>
            <div class="type5-chips-row">
              ${chipsHtml}
            </div>
            <div class="type5-action-row">
              <span>THEN &rarr;</span>
              <select data-key="service_b">${options}</select>
              <input type="text" data-key="inputs_b" value="${this._escAttr(step.inputs_b || '(1)')}" style="width:52px;">
              <span style="margin-left:6px;">ELSE &rarr;</span>
              <select data-key="else_service">${optionalOptions}</select>
              <input type="text" data-key="else_inputs" value="${this._escAttr(step.else_inputs || '(0)')}" style="width:52px;">
            </div>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="step-top">
          <div>
            <span class="step-tag tag-${String(step.type || 'Type1').toLowerCase()}">${step.type}</span>
            <strong style="font-size:0.85rem; margin-left:6px;">Step #${step.step_index}</strong>
          </div>
          <button class="btn-del-step" title="Remove Step">&times;</button>
        </div>
        <div class="step-controls">
          ${inner}
        </div>
      `;

      // Set input bindings
      card.querySelectorAll("select, input").forEach(el => {
        const key = el.dataset.key;
        if (key && step[key] !== undefined) el.value = step[key];
        const updateVal = (e) => {
          step[key] = e.target.value;
          if (key === "interaction_mode") {
            this.render();
          }
          this.syncToJson();
          this.notifyChange();
        };
        el.addEventListener("change", updateVal);
        el.addEventListener("input", updateVal);
      });

      // Logic expression quick-insert chips (Type 5)
      card.querySelectorAll(".logic-chip").forEach(chip => {
        chip.addEventListener("click", () => {
          const inp = card.querySelector(".type5-expr-input");
          if (!inp) return;
          const tok = chip.dataset.insert || "";
          const cur = inp.value;
          const sep = cur && !cur.endsWith(" ") && !cur.endsWith("(") && tok !== ")" ? " " : "";
          inp.value = cur + sep + tok + (tok === "(" ? "" : " ");
          step.expression = inp.value.trim();
          this.syncToJson();
          this.notifyChange();
          inp.focus();
        });
      });

      card.querySelector(".btn-del-step")?.addEventListener("click", () => {
        this.removeStep(idx);
      });

      container.appendChild(card);
    });
  }
}
