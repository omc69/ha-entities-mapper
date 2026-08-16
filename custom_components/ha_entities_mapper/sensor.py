"""Proxy sensor platform for HA Entities Mapper.

Each mapping produces one ``sensor.<key>`` that mirrors the mapped target
entity's state. Numeric targets keep their value + unit_of_measurement (and
a valid device_class where applicable); non-numeric targets pass the state
through as text. Works for any source domain, not just lights.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_state_change_event

from .const import (
    DATA_ADD_ENTITIES,
    DATA_ENTITIES,
    DATA_MAPPINGS,
    DOMAIN,
)

_VALID_DEVICE_CLASSES = {c.value for c in SensorDeviceClass}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up proxy sensors for all stored mappings and enable live adds."""
    data = hass.data[DOMAIN]
    data[DATA_ADD_ENTITIES] = async_add_entities

    entities: list[MapperSensor] = []
    for key, mapping in data[DATA_MAPPINGS].items():
        entity = MapperSensor(mapping)
        data[DATA_ENTITIES][key] = entity
        entities.append(entity)

    if entities:
        async_add_entities(entities)


class MapperSensor(SensorEntity):
    """A sensor that mirrors another entity's state, value and unit."""

    _attr_should_poll = False
    _attr_has_entity_name = False

    def __init__(self, mapping: dict[str, Any]) -> None:
        self._key: str = mapping["key"]
        self._target: str = mapping["target"]
        self._icon_override: str | None = mapping.get("icon")
        self._attr_unique_id = f"{DOMAIN}_{self._key}"
        self._attr_name = mapping.get("name") or self._key
        # Force the object_id so the app can address sensor.<key>.
        self.entity_id = f"sensor.{self._key}"
        self._unsub = None

    # --- lifecycle -----------------------------------------------------

    async def async_added_to_hass(self) -> None:
        self._subscribe()
        self._pull(self.hass.states.get(self._target))

    async def async_will_remove_from_hass(self) -> None:
        if self._unsub is not None:
            self._unsub()
            self._unsub = None

    @callback
    def _subscribe(self) -> None:
        if self._unsub is not None:
            self._unsub()
        self._unsub = async_track_state_change_event(
            self.hass, [self._target], self._handle_change
        )

    @callback
    def _handle_change(self, event: Event[EventStateChangedData]) -> None:
        self._pull(event.data["new_state"])
        self.async_write_ha_state()

    # --- live edit from the panel --------------------------------------

    @callback
    def update_mapping(self, mapping: dict[str, Any]) -> None:
        """Apply a name/target/icon change coming from the panel."""
        self._attr_name = mapping.get("name") or self._key
        self._icon_override = mapping.get("icon")
        new_target = mapping["target"]
        if new_target != self._target:
            self._target = new_target
            self._subscribe()
        self._pull(self.hass.states.get(self._target))
        self.async_write_ha_state()

    # --- state mirroring ------------------------------------------------

    @callback
    def _pull(self, state) -> None:
        """Copy state/value/unit/device_class/icon from the target."""
        if state is None or state.state == STATE_UNAVAILABLE:
            self._attr_available = False
            self._attr_native_value = None
            self._attr_native_unit_of_measurement = None
            self._attr_device_class = None
            self._attr_extra_state_attributes = {"source_entity_id": self._target}
            return

        self._attr_available = True
        attrs = state.attributes
        raw = state.state

        # Numeric target -> keep value + unit; else pass through as text.
        value: Any
        unit: str | None
        try:
            value = float(raw)
            unit = attrs.get("unit_of_measurement")
        except (TypeError, ValueError):
            value = raw  # e.g. "on", "playing", "home", or STATE_UNKNOWN
            unit = None

        source_dc = attrs.get("device_class")
        self._attr_device_class = (
            source_dc if source_dc in _VALID_DEVICE_CLASSES else None
        )
        self._attr_native_value = None if raw == STATE_UNKNOWN else value
        self._attr_native_unit_of_measurement = unit
        self._attr_extra_state_attributes = {
            "source_entity_id": self._target,
            "source_domain": self._target.split(".", 1)[0],
            "source_state": raw,
            "source_device_class": source_dc,
            "source_unit": attrs.get("unit_of_measurement"),
        }

    @property
    def icon(self) -> str | None:
        if self._icon_override:
            return self._icon_override
        state = self.hass.states.get(self._target) if self.hass else None
        if state and (src := state.attributes.get("icon")):
            return src
        return None
