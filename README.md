# HA Entities Mapper

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=omc69&repository=ha-entities-mapper&category=integration)

Ein **semantischer Layer** über Home-Assistant-Entities: Du vergibst einen Wunsch-Key
(z. B. `mein_licht`) und ordnest ihm eine echte Entity zu (z. B. `light.buro_christian`).
Gepflegt wird die Tabelle in einem eigenen **Seitenleisten-Panel**.

Pro Mapping entsteht:

- **`sensor.<key>`** — ein Proxy-Sensor, der State **und Wert + Einheit** der Ziel-Entity
  spiegelt (universal, für jede Domain, nicht nur Licht). → zum **Lesen** in der App.
- **`ha_entities_mapper.action`** — ein Service, der den Key auflöst und die echte Entity
  schaltet (`turn_on` / `turn_off` / `toggle`, domän-unabhängig). → zum **Schalten**.

Domain-Slug: `ha_entities_mapper`. Nur eine Instanz.

---

## Installation (Studio Code Server)

1. Öffne das Add-on **Studio Code Server** (VS Code im Browser).
2. Lege den Ordner an: **`/config/custom_components/ha_entities_mapper/`**
   (der Ordner `custom_components` liegt neben deiner `configuration.yaml`; falls er
   noch nicht existiert, einfach anlegen).
3. Kopiere den kompletten Inhalt von `custom_components/ha_entities_mapper/` aus diesem
   Repo dort hinein. Danach muss es so aussehen:

   ```
   config/custom_components/ha_entities_mapper/
     __init__.py
     config_flow.py
     const.py
     manifest.json
     sensor.py
     services.yaml
     strings.json
     websocket_api.py
     translations/en.json
     translations/de.json
     panel/ha-entities-mapper-panel.js
   ```

4. **Home Assistant neu starten** (Einstellungen → System → ⟲, oder Entwicklerwerkzeuge → Neustart).
5. **Einstellungen → Geräte & Dienste → Integration hinzufügen → „HA Entities Mapper"**.
6. In der linken Seitenleiste erscheint **„Entities Mapper"** — dort die Tabelle pflegen.

> Änderst du nur die Panel-JS später, reicht ein Reload der Integration bzw. der Seite;
> für Python-Änderungen ist ein HA-Neustart nötig.

---

## Bedienung im Panel

- **Neues Mapping:** Key (slug), Anzeigename, Ziel-Entity (mit Autovervollständigung),
  optional Icon → *Hinzufügen*.
- Pro Zeile: Live-Wert der Ziel-Entity, Test-Buttons **▲ An / ▼ Aus / ⇅ Toggle**,
  **Edit** (Name/Ziel/Icon ändern) und **✕** (löschen, mit Rückfrage).
- Der **Key ist unveränderlich** (er ist die `sensor.<key>`-Adresse). Zum Umbenennen:
  löschen + neu anlegen.

---

## Nutzung aus der HomeCommander-App (WebSocket)

**Schalten** (per Key, egal ob Licht/Schalter/…):

```json
{
  "id": 1,
  "type": "call_service",
  "domain": "ha_entities_mapper",
  "service": "action",
  "service_data": { "key": "mein_licht", "action": "toggle" }
}
```

**Lesen** — die Proxy-Entity ganz normal abonnieren/abfragen:

```json
{ "id": 2, "type": "subscribe_entities", "entity_ids": ["sensor.mein_licht"] }
```

`sensor.mein_licht.state` trägt den Wert der Ziel-Entity; bei numerischen Zielen inkl.
`unit_of_measurement`. Zusätzliche Attribute: `source_entity_id`, `source_domain`,
`source_state`, `source_unit`, `source_device_class`.

Die Mapping-Tabelle kann die App auch selbst lesen/pflegen:
`ha_entities_mapper/list`, `/add`, `/update`, `/delete` (WebSocket-Commands; add/update/delete
erfordern Admin).

---

## Grenzen (v1)

- Schalten deckt `turn_on/turn_off/toggle` ab (kein Dimmen/Farbe/Prozent durchgereicht —
  dafür wäre eine domänenspezifische Erweiterung nötig).
- Der Proxy ist ein **Sensor** (Lesen + Schalten via Service). Er ist bewusst universal,
  daher kein `light.`-Verhalten mit Helligkeit etc.
- Eine Instanz, lokale Speicherung unter `.storage/ha_entities_mapper`.
