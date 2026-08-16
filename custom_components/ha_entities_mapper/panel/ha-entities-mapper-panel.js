// HA Entities Mapper — sidebar panel
// Vanilla custom element (no build step, no external deps). Uses hass.callWS
// for the CRUD API and hass.callService for the control/test buttons.

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
  }

  set hass(hass) {
    const first = this._hass === null;
    this._hass = hass;
    if (!this._built) {
      this._build();
      this._loadDatalist();
      this._reload();
    } else {
      this._refreshLiveStates();
    }
    if (first) this._loadDatalist();
  }

  connectedCallback() {
    if (this._hass && !this._built) {
      this._build();
      this._loadDatalist();
      this._reload();
    }
  }

  // ---- data ----------------------------------------------------------

  async _reload() {
    try {
      const res = await this._hass.callWS({ type: `${DOMAIN}/list` });
      this._mappings = res.mappings || [];
      this._renderRows();
    } catch (err) {
      this._toast(`Fehler beim Laden: ${err.message || err}`, true);
    }
  }

  async _add() {
    const key = this._q("#f-key").value.trim();
    const name = this._q("#f-name").value.trim();
    const target = this._q("#f-target").value.trim();
    const icon = this._q("#f-icon").value.trim();
    if (!key || !target) {
      this._toast("Key und Ziel-Entity sind Pflicht.", true);
      return;
    }
    try {
      await this._hass.callWS({
        type: `${DOMAIN}/add`,
        key,
        name: name || key,
        target,
        icon: icon || null,
      });
      this._q("#f-key").value = "";
      this._q("#f-name").value = "";
      this._q("#f-target").value = "";
      this._q("#f-icon").value = "";
      this._toast(`Mapping "${key}" angelegt.`);
      this._reload();
    } catch (err) {
      this._toast(`Add fehlgeschlagen: ${err.message || err}`, true);
    }
  }

  async _saveEdit(key) {
    const row = this.shadowRoot.querySelector(`tr[data-key="${key}"]`);
    if (!row) return;
    const name = row.querySelector(".e-name").value.trim();
    const target = row.querySelector(".e-target").value.trim();
    const icon = row.querySelector(".e-icon").value.trim();
    if (!target) {
      this._toast("Ziel-Entity darf nicht leer sein.", true);
      return;
    }
    try {
      await this._hass.callWS({
        type: `${DOMAIN}/update`,
        key,
        name: name || key,
        target,
        icon: icon || null,
      });
      this._editingKey = null;
      this._toast(`"${key}" gespeichert.`);
      this._reload();
    } catch (err) {
      this._toast(`Speichern fehlgeschlagen: ${err.message || err}`, true);
    }
  }

  async _delete(key) {
    try {
      await this._hass.callWS({ type: `${DOMAIN}/delete`, key });
      this._confirmKey = null;
      this._toast(`"${key}" gelöscht.`);
      this._reload();
    } catch (err) {
      this._toast(`Löschen fehlgeschlagen: ${err.message || err}`, true);
    }
  }

  async _control(key, action) {
    try {
      await this._hass.callService(DOMAIN, "action", { key, action });
      this._toast(`${action} → ${key}`);
    } catch (err) {
      this._toast(`${action} fehlgeschlagen: ${err.message || err}`, true);
    }
  }

  // ---- rendering -----------------------------------------------------

  _build() {
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <div class="wrap">
        <div class="head">
          <h1>Entities Mapper</h1>
          <p class="sub">Wunschname (Key) → echte Entity. Der App-Layer adressiert
          <code>sensor.&lt;key&gt;</code> zum Lesen und den Service
          <code>${DOMAIN}.action</code> zum Schalten.</p>
        </div>

        <div class="card add">
          <h2>Neues Mapping</h2>
          <div class="form">
            <label>Key <span>(slug, wird zu sensor.&lt;key&gt;)</span>
              <input id="f-key" placeholder="mein_licht" />
            </label>
            <label>Anzeigename
              <input id="f-name" placeholder="Mein Licht" />
            </label>
            <label>Ziel-Entity
              <input id="f-target" list="entity-list" placeholder="light.buro_christian" />
            </label>
            <label>Icon <span>(optional)</span>
              <input id="f-icon" placeholder="mdi:lightbulb" />
            </label>
            <button id="f-add" class="primary">Hinzufügen</button>
          </div>
        </div>

        <div class="card">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Key / Proxy</th><th>Ziel-Entity</th>
                <th>Wert</th><th class="actions">Aktionen</th>
              </tr>
            </thead>
            <tbody id="rows"></tbody>
          </table>
          <div id="empty" class="empty" hidden>Noch keine Mappings angelegt.</div>
        </div>
      </div>
      <datalist id="entity-list"></datalist>
      <div id="toast" class="toast" hidden></div>
    `;
    this._q("#f-add").addEventListener("click", () => this._add());
    this._built = true;
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

    tbody.innerHTML = this._mappings
      .map((m) => this._rowHtml(m))
      .join("");

    // wire up per-row buttons
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
          <td><input class="e-target" list="entity-list" value="${esc(m.target)}" /></td>
          <td><input class="e-icon" placeholder="mdi:…" value="${esc(m.icon || "")}" /></td>
          <td class="actions">
            <button class="btn-save primary">Speichern</button>
            <button class="btn-cancel">Abbrechen</button>
          </td>
        </tr>`;
    }
    const actions = confirming
      ? `<span class="confirm">Löschen?</span>
         <button class="btn-del-yes danger">Ja</button>
         <button class="btn-del-no">Nein</button>`
      : `<button class="btn-on" title="An">▲</button>
         <button class="btn-off" title="Aus">▼</button>
         <button class="btn-toggle" title="Toggle">⇅</button>
         <button class="btn-edit">Edit</button>
         <button class="btn-del danger">✕</button>`;
    return `
      <tr data-key="${m.key}">
        <td>${m.icon ? iconSpan(m.icon) : ""}${esc(m.name)}</td>
        <td><code>${m.key}</code><br><span class="proxy">${m.proxy_entity_id}</span></td>
        <td>${esc(m.target)}${m.target_available ? "" : ' <span class="warn">✗ fehlt</span>'}</td>
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
  .form { display: grid; grid-template-columns: repeat(4, 1fr) auto; gap: 10px; align-items: end; }
  .form label { display: flex; flex-direction: column; font-size: 12px; color: var(--secondary-text-color); gap: 4px; }
  .form label span { font-weight: 400; opacity: .8; }
  input { padding: 8px; border: 1px solid var(--divider-color, #ddd); border-radius: 8px;
          background: var(--primary-background-color); color: var(--primary-text-color); font-size: 14px; }
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
