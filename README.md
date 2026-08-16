# HA Entities Mapper

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=omc69&repository=ha-entities-mapper&category=integration)

A **semantic layer** over Home Assistant entities: you pick a friendly key
(e.g. `my_light`) and map it to a real entity (e.g. `light.office_desk`).
The table is maintained in a dedicated **sidebar panel**.

Each mapping provides:

- **`sensor.<key>`** — a proxy sensor mirroring the target's state **plus value
  and unit** (universal — works for any domain, not just lights). → for **reading**.
- **`ha_entities_mapper.action`** — a service that resolves the key and switches
  the real entity (`turn_on` / `turn_off` / `toggle`, domain-agnostic). → for **switching**.

Domain slug: `ha_entities_mapper`. Single instance.

---

## Installation

### Via HACS (recommended)

1. Click the badge above, or add `omc69/ha-entities-mapper` as a **custom
   repository** (category **Integration**) in HACS.
2. Download **HA Entities Mapper** in HACS.
3. **Restart Home Assistant.**
4. **Settings → Devices & Services → Add Integration → "HA Entities Mapper".**
5. Open the **"Entities Mapper"** panel in the sidebar and add your first mapping.

### Manual

Copy `custom_components/ha_entities_mapper/` into your `/config/custom_components/`,
restart Home Assistant, then add the integration as in step 4 above.

---

## Using the panel

- **New mapping:** key (slug), display name, target entity (searchable picker) → *Add*.
- Per row: the target's live value, test buttons **▲ On / ▼ Off / ⇅ Toggle**,
  **Edit** (change name/target) and **✕** (delete, with confirmation).
- The **key is immutable** (it is the `sensor.<key>` address). To rename: delete
  and re-create. The proxy inherits the target entity's icon/device class automatically.

---

## Using it from an app (WebSocket)

**Switch** (by key, regardless of light/switch/…):

```json
{
  "type": "call_service",
  "domain": "ha_entities_mapper",
  "service": "action",
  "service_data": { "key": "my_light", "action": "toggle" }
}
```

**Read** — subscribe to the proxy entity as usual:

```json
{ "type": "subscribe_entities", "entity_ids": ["sensor.my_light"] }
```

`sensor.my_light.state` carries the target's value; for numeric targets including
`unit_of_measurement`. Extra attributes: `source_entity_id`, `source_domain`,
`source_state`, `source_unit`, `source_device_class`.

The mapping table can also be read/maintained via WebSocket commands:
`ha_entities_mapper/list`, `/add`, `/update`, `/delete` (add/update/delete require admin).

---

## Limits (v1)

- Switching covers `turn_on/turn_off/toggle` (no brightness/color/percentage
  pass-through — that would need a domain-specific extension).
- The proxy is a **sensor** (read + switch via service); it is intentionally
  universal, so it does not behave like a real `light.` with brightness etc.
- Single instance, stored under `.storage/ha_entities_mapper`.
