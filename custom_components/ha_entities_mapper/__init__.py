"""HA Entities Mapper — a semantic layer over Home Assistant entities.

Maps a friendly key (e.g. "mein_licht") to a real entity_id. Each mapping gets:
  * a proxy sensor ``sensor.<key>`` that mirrors the target's state, value & unit
    (universal — works for any domain, not just lights),
  * control via the ``homecommander.action`` service (turn_on/turn_off/toggle),
    resolved by key to the real entity.

The mapping table is maintained in a custom sidebar panel (CRUD over a
WebSocket API). Everything is stored via Home Assistant's Store helper.
"""

from __future__ import annotations

import logging
import os

import voluptuous as vol

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.storage import Store

from .const import (
    ATTR_ACTION,
    ATTR_KEY,
    DATA_ADD_ENTITIES,
    DATA_ENTITIES,
    DATA_MAPPINGS,
    DATA_STORE,
    DOMAIN,
    PANEL_COMPONENT,
    PANEL_FILES_URL,
    PANEL_ICON,
    PANEL_MODULE,
    PANEL_TITLE,
    PANEL_URL_PATH,
    SERVICE_ACTION,
    STORAGE_KEY,
    STORAGE_VERSION,
    VALID_ACTIONS,
)
from .websocket_api import async_register_websocket_api

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [Platform.SENSOR]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up HomeCommander from a config entry."""
    store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    stored = await store.async_load() or {}
    mappings: dict[str, dict] = {m["key"]: m for m in stored.get("mappings", [])}

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN] = {
        DATA_STORE: store,
        DATA_MAPPINGS: mappings,
        DATA_ENTITIES: {},
        DATA_ADD_ENTITIES: None,
    }

    # Serve the panel JS and register the sidebar panel (once).
    await _async_register_panel(hass)

    # WebSocket CRUD API for the panel.
    async_register_websocket_api(hass)

    # Control service: ha_entities_mapper.action(key, action)
    async def _handle_action(call: ServiceCall) -> None:
        key: str = call.data[ATTR_KEY]
        action: str = call.data[ATTR_ACTION]
        data = hass.data[DOMAIN]
        mapping = data[DATA_MAPPINGS].get(key)
        if mapping is None:
            raise ServiceValidationError(f"HomeCommander: unknown key '{key}'")
        target = mapping["target"]
        await hass.services.async_call(
            "homeassistant",
            action,
            {"entity_id": target},
            blocking=True,
            context=call.context,
        )

    hass.services.async_register(
        DOMAIN,
        SERVICE_ACTION,
        _handle_action,
        schema=vol.Schema(
            {
                vol.Required(ATTR_KEY): cv.string,
                vol.Required(ATTR_ACTION): vol.In(VALID_ACTIONS),
            }
        ),
    )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    if hass.services.has_service(DOMAIN, SERVICE_ACTION):
        hass.services.async_remove(DOMAIN, SERVICE_ACTION)

    frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)
    hass.data.pop(DOMAIN, None)
    return unload_ok


async def _async_register_panel(hass: HomeAssistant) -> None:
    """Register the static JS path and the custom sidebar panel.

    Static paths and frontend panels live for the lifetime of the HA process
    (unload does not remove the static path), so guard against re-registering
    on a config-entry reload.
    """
    if frontend.async_panel_exists(hass, PANEL_URL_PATH):
        return

    panel_dir = os.path.join(os.path.dirname(__file__), "panel")
    try:
        await hass.http.async_register_static_paths(
            [StaticPathConfig(PANEL_FILES_URL, panel_dir, cache_headers=False)]
        )
    except (RuntimeError, ValueError) as err:
        # Already registered from a previous setup in this process.
        _LOGGER.debug("Static path already registered: %s", err)

    await panel_custom.async_register_panel(
        hass,
        webcomponent_name=PANEL_COMPONENT,
        frontend_url_path=PANEL_URL_PATH,
        module_url=f"{PANEL_MODULE}?v=0.1.2",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        require_admin=True,
        embed_iframe=False,
    )


async def async_persist(hass: HomeAssistant) -> None:
    """Write the current mapping table back to storage."""
    data = hass.data[DOMAIN]
    store: Store = data[DATA_STORE]
    await store.async_save({"mappings": list(data[DATA_MAPPINGS].values())})
