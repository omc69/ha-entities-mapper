// HA Entities Mapper — sidebar panel
// Vanilla custom element (no build step). Uses hass.callWS for the CRUD API,
// hass.callService for control/test buttons, and HA's native <ha-entity-picker>
// as a searchable entity browser for the target field (with a text-input
// fallback if the picker component can't be loaded).

const DOMAIN = "ha_entities_mapper";

class HaEntitiesMapperPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._mappings = [];
    this._built = false;
    this._editingKey = null;
    this._confirmKey = null;
    this._pickerReady = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) {
      this._build();
      this._loadDatalist();
      this._ensurePicker();
      this._reload();
    } else {
      this._refreshLiveStates();
      this._updatePickerHass();
    }
  }

  connectedCallback() {
    if (this._hass && !this._built) {
      this._build();
      this._loadDatalist();
      this._ensurePicker();
      this._reload();
    }
  }

  // ---- native entity picker loading ---------------------------------

  async _ensurePicker() {
    if (this._pickerReady || customElements.get("ha-entity-picker")) {
      this._pickerReady = true;
      this._hydratePickers();
      return;
    }
    try {
      // Force HA to load its editor components (which include ha-entity-picker).
      if (window.loadCardHelpers) {
        const helpers = await window.loadCardHelpers();
        const card = await helpers.createCardElement({ type: "entities", entities: [] });
        if (card && card.constructor && card.constructor.getConfigElement) {
          await card.constructor.getConfigElement();
        }
      }
    } catch (e) {
      // ignore — we'll fall back to the text input
    }
    this._pickerReady = !!customElements.get("ha-entity-picker");
    this._hydratePickers();
  }

  _makeTargetField(value) {
    // Returns a fresh element: ha-entity-picker if available, else <input>.
    if (this._pickerReady && customElements.get("ha-entity-picker")) {
      const el = document.createElement("ha-entity-picker");
      el.hass = this._hass;
      el.allowCustomEntity = true;
      el.label = "Target entity";
      if (value) el.value = value;
      return el;
    }
    const inp = document.createElement("input");
    inp.type = "text";
    inp.setAttribute("list", "entity-list");
    inp.placeholder = "light.office_desk";
    inp.className = "fallback-target";
    if (value) inp.value = value;
    return inp;
  }

  _fillSlot(slot, value) {
    if (!slot) return;
    const cur =
      slot.querySelector("ha-entity-picker, input")?.value ?? value ?? "";
    slot.innerHTML = "";
    slot.appendChild(this._makeTargetField(cur));
  }

  _hydratePickers() {
    this._fillSlot(this._q("#f-target-slot"));
    const editSlot = this.shadowRoot.querySelector(".e-target-slot");
    if (editSlot) this._fillSlot(editSlot, editSlot.dataset.value || "");
  }

  _updatePickerHass() {
    this.shadowRoot
      .querySelectorAll("ha-entity-picker")
      .forEach((el) => (el.hass = this._hass));
  }

  _slotValue(slot) {
    const el = slot ? slot.querySelector("ha-entity-picker, input") : null;
    return (el && el.value ? String(el.value) : "").trim();
  }

  // ---- data ----------------------------------------------------------

  async _reload() {
    try {
      const res = await this._hass.callWS({ type: `${DOMAIN}/list` });
      this._mappings = res.mappings || [];
      this._renderRows();
    } catch (err) {
      this._toast(`Failed to load: ${err.message || err}`, true);
    }
  }

  async _add() {
    const key = this._q("#f-key").value.trim();
    const name = this._q("#f-name").value.trim();
    const target = this._slotValue(this._q("#f-target-slot"));
    if (!key || !target) {
      this._toast("Key and target entity are required.", true);
      return;
    }
    try {
      await this._hass.callWS({
        type: `${DOMAIN}/add`,
        key,
        name: name || key,
        target,
      });
      this._q("#f-key").value = "";
      this._q("#f-name").value = "";
      this._fillSlot(this._q("#f-target-slot"), "");
      const p = this._q("#f-target-slot").querySelector("ha-entity-picker, input");
      if (p) p.value = "";
      this._toast(`Mapping "${key}" created.`);
      this._reload();
    } catch (err) {
      this._toast(`Add failed: ${err.message || err}`, true);
    }
  }

  async _saveEdit(key) {
    const row = this.shadowRoot.querySelector(`tr[data-key="${key}"]`);
    if (!row) return;
    const name = row.querySelector(".e-name").value.trim();
    const target = this._slotValue(row.querySelector(".e-target-slot"));
    if (!target) {
      this._toast("Target entity must not be empty.", true);
      return;
    }
    try {
      await this._hass.callWS({
        type: `${DOMAIN}/update`,
        key,
        name: name || key,
        target,
      });
      this._editingKey = null;
      this._toast(`"${key}" saved.`);
      this._reload();
    } catch (err) {
      this._toast(`Save failed: ${err.message || err}`, true);
    }
  }

  async _delete(key) {
    try {
      await this._hass.callWS({ type: `${DOMAIN}/delete`, key });
      this._confirmKey = null;
      this._toast(`"${key}" deleted.`);
      this._reload();
    } catch (err) {
      this._toast(`Delete failed: ${err.message || err}`, true);
    }
  }

  async _control(key, action) {
    try {
      await this._hass.callService(DOMAIN, "action", { key, action });
      this._toast(`${action} → ${key}`);
    } catch (err) {
      this._toast(`${action} failed: ${err.message || err}`, true);
    }
  }

  // ---- rendering -----------------------------------------------------

  _build() {
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <div class="wrap">
        <div class="head">
          <h1>Entities Mapper</h1>
          <p class="sub">Friendly key → real entity. The app layer addresses
          <code>sensor.&lt;key&gt;</code> to read and the
          <code>${DOMAIN}.action</code> service to switch.</p>
        </div>

        <div class="card add">
          <h2>New mapping</h2>
          <div class="form">
            <label>Key <span>(slug, becomes sensor.&lt;key&gt;)</span>
              <input id="f-key" placeholder="my_light" />
            </label>
            <label>Display name
              <input id="f-name" placeholder="My Light" />
            </label>
            <label>Target entity
              <div id="f-target-slot" class="target-slot"></div>
            </label>
            <button id="f-add" class="primary">Add</button>
          </div>
        </div>

        <div class="card">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Key / Proxy</th><th>Target entity</th>
                <th>Value</th><th class="actions">Actions</th>
              </tr>
            </thead>
            <tbody id="rows"></tbody>
          </table>
          <div id="empty" class="empty" hidden>No mappings yet.</div>
        </div>
      </div>
      <datalist id="entity-list"></datalist>
      <div id="toast" class="toast" hidden></div>
    `;
    this._q("#f-add").addEventListener("click", () => this._add());
    this._built = true;
    this._fillSlot(this._q("#f-target-slot"), "");
  }

  _loadDatalist() {
    if (!this._hass) return;
    const dl = this._q("#entity-list");
    if (!dl) return;
    const ids = Object.keys(this._hass.states).sort();
    dl.innerHTML = ids.map((id) => `<option value="${id}"></option>`).join("");
  }

  _renderRows() {
    const tbody = this._q("#rows");
    const empty = this._q("#empty");
    if (!tbody) return;
    empty.hidden = this._mappings.length > 0;

    tbody.innerHTML = this._mappings.map((m) => this._rowHtml(m)).join("");

    this._mappings.forEach((m) => {
      const row = this.shadowRoot.querySelector(`tr[data-key="${m.key}"]`);
      if (!row) return;
      const on = (sel, fn) => {
        const el = row.querySelector(sel);
        if (el) el.addEventListener("click", fn);
      };
      on(".btn-on", () => this._control(m.key, "turn_on"));
      on(".btn-off", () => this._control(m.key, "turn_off"));
      on(".btn-toggle", () => this._control(m.key, "toggle"));
      on(".btn-edit", () => { this._editingKey = m.key; this._renderRows(); });
      on(".btn-cancel", () => { this._editingKey = null; this._renderRows(); });
      on(".btn-save", () => this._saveEdit(m.key));
      on(".btn-del", () => { this._confirmKey = m.key; this._renderRows(); });
      on(".btn-del-no", () => { this._confirmKey = null; this._renderRows(); });
      on(".btn-del-yes", () => this._delete(m.key));
    });

    // Hydrate the editing row's target picker (if any).
    const editSlot = this.shadowRoot.querySelector(".e-target-slot");
    if (editSlot) this._fillSlot(editSlot, editSlot.dataset.value || "");

    this._refreshLiveStates();
  }

  _rowHtml(m) {
    const editing = this._editingKey === m.key;
    const confirming = this._confirmKey === m.key;
    if (editing) {
      return `
        <tr data-key="${m.key}" class="editing">
          <td><input class="e-name" value="${esc(m.name)}" /></td>
          <td><code>${m.key}</code></td>
          <td><div class="e-target-slot target-slot" data-value="${esc(m.target)}"></div></td>
          <td class="value" data-target="${esc(m.target)}">—</td>
          <td class="actions">
            <button class="btn-save primary">Save</button>
            <button class="btn-cancel">Cancel</button>
          </td>
        </tr>`;
    }
    const actions = confirming
      ? `<span class="confirm">Delete?</span>
         <button class="btn-del-yes danger">Yes</button>
         <button class="btn-del-no">No</button>`
      : `<button class="btn-on" title="On">▲</button>
         <button class="btn-off" title="Off">▼</button>
         <button class="btn-toggle" title="Toggle">⇅</button>
         <button class="btn-edit">Edit</button>
         <button class="btn-del danger">✕</button>`;
    return `
      <tr data-key="${m.key}">
        <td>${m.icon ? iconSpan(m.icon) : ""}${esc(m.name)}</td>
        <td><code>${m.key}</code><br><span class="proxy">${m.proxy_entity_id}</span></td>
        <td>${esc(m.target)}${m.target_available ? "" : ' <span class="warn">✗ missing</span>'}</td>
        <td class="value" data-target="${esc(m.target)}">—</td>
        <td class="actions">${actions}</td>
      </tr>`;
  }

  _refreshLiveStates() {
    if (!this._hass) return;
    this.shadowRoot.querySelectorAll("td.value[data-target]").forEach((td) => {
      const id = td.getAttribute("data-target");
      const st = this._hass.states[id];
      if (!st) { td.textContent = "—"; td.classList.add("warn"); return; }
      td.classList.remove("warn");
      const unit = st.attributes.unit_of_measurement;
      td.textContent = unit ? `${st.state} ${unit}` : st.state;
    });
  }

  // ---- helpers -------------------------------------------------------

  _q(sel) { return this.shadowRoot.querySelector(sel); }

  _toast(msg, isError) {
    const t = this._q("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.toggle("error", !!isError);
    t.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
  }
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function iconSpan(icon) {
  return `<ha-icon icon="${esc(icon)}" class="rowicon"></ha-icon>`;
}

const STYLE = `
  :host { display:block; background: var(--primary-background-color); min-height:100vh; }
  .wrap { max-width: 1000px; margin: 0 auto; padding: 16px; color: var(--primary-text-color); }
  .head h1 { margin: 8px 0 0; font-size: 22px; }
  .sub { color: var(--secondary-text-color); font-size: 13px; margin: 4px 0 16px; }
  code { background: var(--secondary-background-color); padding: 1px 5px; border-radius: 4px; font-size: 12px; }
  .card { background: var(--card-background-color, #fff); border-radius: 12px;
          box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0,0,0,.12)); padding: 16px; margin-bottom: 16px; }
  .card h2 { margin: 0 0 12px; font-size: 16px; }
  .form { display: grid; grid-template-columns: repeat(3, 1fr) auto; gap: 10px; align-items: end; }
  .form label { display: flex; flex-direction: column; font-size: 12px; color: var(--secondary-text-color); gap: 4px; }
  .form label span { font-weight: 400; opacity: .8; }
  input { padding: 8px; border: 1px solid var(--divider-color, #ddd); border-radius: 8px;
          background: var(--primary-background-color); color: var(--primary-text-color); font-size: 14px; }
  .target-slot { display: block; width: 100%; }
  .target-slot ha-entity-picker { display: block; width: 100%; }
  button { padding: 7px 10px; border: none; border-radius: 8px; cursor: pointer; font-size: 13px;
           background: var(--secondary-background-color); color: var(--primary-text-color); }
  button.primary { background: var(--primary-color); color: var(--text-primary-color, #fff); }
  button.danger { background: transparent; color: var(--error-color, #db4437); }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--divider-color, #eee); font-size: 14px; vertical-align: top; }
  th { font-size: 12px; text-transform: uppercase; color: var(--secondary-text-color); }
  td.actions, th.actions { text-align: right; white-space: nowrap; }
  td.actions button { margin-left: 4px; }
  td.value { font-variant-numeric: tabular-nums; font-weight: 600; }
  .proxy { color: var(--secondary-text-color); font-size: 11px; }
  .warn { color: var(--error-color, #db4437); font-size: 12px; }
  .confirm { color: var(--error-color, #db4437); margin-right: 6px; font-size: 13px; }
  .empty { padding: 20px; text-align: center; color: var(--secondary-text-color); }
  .rowicon { --mdc-icon-size: 18px; margin-right: 6px; vertical-align: -4px; color: var(--state-icon-color, var(--primary-text-color)); }
  tr.editing input { width: 100%; }
  .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
           background: #323232; color: #fff; padding: 10px 16px; border-radius: 8px; font-size: 14px; z-index: 9; }
  .toast.error { background: var(--error-color, #db4437); }
  @media (max-width: 720px) { .form { grid-template-columns: 1fr 1fr; } }
`;

if (!customElements.get("ha-entities-mapper-panel")) {
  customElements.define("ha-entities-mapper-panel", HaEntitiesMapperPanel);
}
