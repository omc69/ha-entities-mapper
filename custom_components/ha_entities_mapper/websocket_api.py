"""WebSocket API for maintaining the mapping table from the panel."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.util import slugify

from .const import (
    DATA_ADD_ENTITIES,
    DATA_ENTITIES,
    DATA_MAPPINGS,
    DOMAIN,
)

WS_LIST = f"{DOMAIN}/list"
WS_ADD = f"{DOMAIN}/add"
WS_UPDATE = f"{DOMAIN}/update"
WS_DELETE = f"{DOMAIN}/delete"


@callback
def async_register_websocket_api(hass: HomeAssistant) -> None:
    """Register all websocket commands (idempotent per hass process)."""
    websocket_api.async_register_command(hass, ws_list)
    websocket_api.async_register_command(hass, ws_add)
    websocket_api.async_register_command(hass, ws_update)
    websocket_api.async_register_command(hass, ws_delete)


def _row(hass: HomeAssistant, mapping: dict[str, Any]) -> dict[str, Any]:
    """Build a table row enriched with live state of the target."""
    proxy_id = f"sensor.{mapping['key']}"
    target = mapping.get("target")
    tstate = hass.states.get(target) if target else None
    return {
        "key": mapping["key"],
        "name": mapping.get("name") or mapping["key"],
        "target": target,
        "icon": mapping.get("icon"),
        "proxy_entity_id": proxy_id,
        "target_available": tstate is not None,
        "target_state": tstate.state if tstate else None,
        "target_unit": (tstate.attributes.get("unit_of_measurement") if tstate else None),
    }


@websocket_api.websocket_command({vol.Required("type"): WS_LIST})
@callback
def ws_list(hass, connection, msg):
    """Return the full mapping table."""
    data = hass.data[DOMAIN]
    rows = [_row(hass, m) for m in data[DATA_MAPPINGS].values()]
    rows.sort(key=lambda r: r["name"].lower())
    connection.send_result(msg["id"], {"mappings": rows})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_ADD,
        vol.Required("key"): str,
        vol.Required("target"): str,
        vol.Optional("name"): str,
        vol.Optional("icon"): vol.Any(str, None),
    }
)
@websocket_api.async_response
async def ws_add(hass, connection, msg):
    """Add a new mapping and create its proxy sensor."""
    from . import async_persist
    from .sensor import MapperSensor

    data = hass.data[DOMAIN]
    key = slugify(msg["key"])
    if not key:
        connection.send_error(msg["id"], "invalid_key", "Key is empty after slugify.")
        return
    if key in data[DATA_MAPPINGS]:
        connection.send_error(msg["id"], "duplicate", f"Key '{key}' already exists.")
        return
    target = msg["target"].strip()
    if "." not in target:
        connection.send_error(msg["id"], "invalid_target", "Target must be an entity_id.")
        return

    mapping = {
        "key": key,
        "name": (msg.get("name") or key).strip(),
        "target": target,
        "icon": msg.get("icon") or None,
    }
    data[DATA_MAPPINGS][key] = mapping
    await async_persist(hass)

    add_entities = data.get(DATA_ADD_ENTITIES)
    if add_entities is not None:
        entity = MapperSensor(mapping)
        data[DATA_ENTITIES][key] = entity
        add_entities([entity])

    connection.send_result(msg["id"], _row(hass, mapping))


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_UPDATE,
        vol.Required("key"): str,
        vol.Optional("name"): str,
        vol.Optional("target"): str,
        vol.Optional("icon"): vol.Any(str, None),
    }
)
@websocket_api.async_response
async def ws_update(hass, connection, msg):
    """Update name/target/icon of an existing mapping (key is immutable)."""
    from . import async_persist

    data = hass.data[DOMAIN]
    key = msg["key"]
    mapping = data[DATA_MAPPINGS].get(key)
    if mapping is None:
        connection.send_error(msg["id"], "not_found", f"Key '{key}' not found.")
        return

    if "target" in msg:
        target = msg["target"].strip()
        if "." not in target:
            connection.send_error(msg["id"], "invalid_target", "Target must be an entity_id.")
            return
        mapping["target"] = target
    if "name" in msg:
        mapping["name"] = (msg["name"] or key).strip()
    if "icon" in msg:
        mapping["icon"] = msg["icon"] or None

    await async_persist(hass)

    entity = data[DATA_ENTITIES].get(key)
    if entity is not None:
        entity.update_mapping(mapping)

    connection.send_result(msg["id"], _row(hass, mapping))


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_DELETE,
        vol.Required("key"): str,
    }
)
@websocket_api.async_response
async def ws_delete(hass, connection, msg):
    """Delete a mapping and remove its proxy sensor."""
    from . import async_persist

    data = hass.data[DOMAIN]
    key = msg["key"]
    if key not in data[DATA_MAPPINGS]:
        connection.send_error(msg["id"], "not_found", f"Key '{key}' not found.")
        return

    data[DATA_MAPPINGS].pop(key, None)
    await async_persist(hass)

    entity = data[DATA_ENTITIES].pop(key, None)
    if entity is not None:
        await entity.async_remove(force_remove=True)

    registry = er.async_get(hass)
    ent_id = f"sensor.{key}"
    if registry.async_get(ent_id):
        registry.async_remove(ent_id)

    connection.send_result(msg["id"], {"deleted": key})
