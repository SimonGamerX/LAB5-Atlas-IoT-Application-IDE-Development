/**
 * Atlas IoT Relationships Graph Visualizer
 * Requirement 2: Presents all relationships heard (Order-based & Condition-based) graphically.
 */

class RelationshipsGraph {
  constructor(svgElementId, detailsContainerId) {
    this.svg = document.getElementById(svgElementId);
    this.detailsContainer = document.getElementById(detailsContainerId);
    this.services = [];
    this.relationships = [];
  }

  setData(services, relationships) {
    this.services = services || [];
    this.relationships = relationships || [];
    this.render();
  }

  render() {
    if (!this.svg) return;
    this.svg.innerHTML = "";

    const width = this.svg.clientWidth || 600;
    const height = this.svg.clientHeight || 450;

    // Define SVG arrowhead markers
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <marker id="arrow-order" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6"/>
      </marker>
      <marker id="arrow-condition" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b"/>
      </marker>
    `;
    this.svg.appendChild(defs);

    if (this.services.length === 0) {
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", width / 2);
      text.setAttribute("y", height / 2);
      text.setAttribute("fill", "#64748b");
      text.setAttribute("text-anchor", "middle");
      text.textContent = "Listening for relationships tweets...";
      this.svg.appendChild(text);
      return;
    }

    // Position services in a circle or columns
    const nodePositions = {};
    const n = this.services.length;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.38;

    this.services.forEach((s, idx) => {
      const angle = (idx / n) * 2 * Math.PI - Math.PI / 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      nodePositions[s.name] = { x, y, service: s };
    });

    // Draw Relationship Edges
    this.relationships.forEach(rel => {
      const p1 = nodePositions[rel.fs_name];
      const p2 = nodePositions[rel.ss_name];

      if (p1 && p2) {
        const isOrder = rel.relation_type.toLowerCase().includes("order");
        const color = isOrder ? "#3b82f6" : "#f59e0b";
        const marker = isOrder ? "url(#arrow-order)" : "url(#arrow-condition)";

        // Curve path
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const mx = (p1.x + p2.x) / 2 - dy * 0.15;
        const my = (p1.y + p2.y) / 2 + dx * 0.15;

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M ${p1.x} ${p1.y} Q ${mx} ${my} ${p2.x} ${p2.y}`);
        path.setAttribute("stroke", color);
        path.setAttribute("stroke-width", "2.5");
        path.setAttribute("fill", "none");
        if (!isOrder) {
          path.setAttribute("stroke-dasharray", "6,4");
        }
        path.setAttribute("marker-end", marker);
        path.style.cursor = "pointer";

        path.addEventListener("click", () => this.highlightRelationship(rel));
        this.svg.appendChild(path);

        // Edge label
        const lbl = document.createElementNS("http://www.w3.org/2000/svg", "text");
        lbl.setAttribute("x", mx);
        lbl.setAttribute("y", my);
        lbl.setAttribute("fill", color);
        lbl.setAttribute("font-size", "10px");
        lbl.setAttribute("font-family", "monospace");
        lbl.setAttribute("text-anchor", "middle");
        lbl.textContent = isOrder ? "Order" : "Condition";
        this.svg.appendChild(lbl);
      }
    });

    // Draw Service Nodes
    Object.keys(nodePositions).forEach(name => {
      const pos = nodePositions[name];
      const s = pos.service;
      const isSensor = s.service_type.toLowerCase() === "report" || s.is_sensor;
      const nodeColor = isSensor ? "#10b981" : "#ef4444";

      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.style.cursor = "pointer";

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", pos.x);
      circle.setAttribute("cy", pos.y);
      circle.setAttribute("r", 18);
      circle.setAttribute("fill", "#1e293b");
      circle.setAttribute("stroke", nodeColor);
      circle.setAttribute("stroke-width", "2.5");
      g.appendChild(circle);

      // Icon / text inside node
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "text");
      icon.setAttribute("x", pos.x);
      icon.setAttribute("y", pos.y + 4);
      icon.setAttribute("text-anchor", "middle");
      icon.setAttribute("font-size", "12px");
      icon.setAttribute("fill", "#fff");
      icon.textContent = isSensor ? "👁" : "⚙";
      g.appendChild(icon);

      // Node label
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", pos.x);
      text.setAttribute("y", pos.y + 30);
      text.setAttribute("fill", "#e2e8f0");
      text.setAttribute("font-size", "11px");
      text.setAttribute("font-weight", "600");
      text.setAttribute("text-anchor", "middle");
      text.textContent = name;
      g.appendChild(text);

      g.addEventListener("click", () => this.highlightService(s));
      this.svg.appendChild(g);
    });

    this.renderSidebarList();
  }

  highlightRelationship(rel) {
    if (!this.detailsContainer) return;
    this.detailsContainer.innerHTML = `
      <div class="rel-item-card ${rel.relation_type.toLowerCase().includes('order') ? 'order' : 'condition'}">
        <div class="rel-header">
          <strong>${rel.name}</strong>
          <span class="badge-state ${rel.relation_type.toLowerCase().includes('order') ? 'active' : 'completed'}">${rel.relation_type}</span>
        </div>
        <p>${rel.description}</p>
        <div class="rel-link">From: <strong>${rel.fs_name}</strong> &rarr; To: <strong>${rel.ss_name}</strong></div>
        <div style="font-size:0.75rem; color:#94a3b8; margin-top:6px;">Thing: ${rel.thing_id} | Category: ${rel.category}</div>
      </div>
    `;
  }

  highlightService(s) {
    if (!this.detailsContainer) return;
    this.detailsContainer.innerHTML = `
      <div class="rel-item-card order">
        <div class="rel-header">
          <strong>${s.name}</strong>
          <span class="service-type-badge ${s.is_sensor ? 'sensor' : 'actuator'}">${s.service_type}</span>
        </div>
        <p>${s.description}</p>
        <div class="service-api-sig">${s.api || s.name + '()'}</div>
        <div style="font-size:0.75rem; color:#94a3b8; margin-top:6px;">
          Thing: ${s.thing_id} &bull; Entity: ${s.entity_id}
        </div>
      </div>
    `;
  }

  renderSidebarList() {
    if (!this.detailsContainer) return;
    if (this.relationships.length === 0) {
      this.detailsContainer.innerHTML = "<p style='color:#64748b; font-size:0.8rem;'>No relationships discovered yet.</p>";
      return;
    }

    let html = "";
    this.relationships.forEach(rel => {
      const isOrder = rel.relation_type.toLowerCase().includes("order");
      html += `
        <div class="rel-item-card ${isOrder ? 'order' : 'condition'}">
          <div class="rel-header">
            <span>${rel.name}</span>
            <span style="font-size:0.7rem; color:${isOrder ? '#60a5fa' : '#f59e0b'}; font-weight:bold;">${rel.relation_type}</span>
          </div>
          <p>${rel.description}</p>
          <div class="rel-link">${rel.fs_name} &rarr; ${rel.ss_name}</div>
        </div>
      `;
    });
    this.detailsContainer.innerHTML = html;
  }
}

