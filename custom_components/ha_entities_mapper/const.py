"""Constants for the HA Entities Mapper integration."""

DOMAIN = "ha_entities_mapper"

# Storage
STORAGE_KEY = "ha_entities_mapper"
STORAGE_VERSION = 1

# Data keys inside hass.data[DOMAIN]
DATA_STORE = "store"
DATA_MAPPINGS = "mappings"          # dict: key -> mapping dict
DATA_ENTITIES = "entities"          # dict: key -> MapperSensor
DATA_ADD_ENTITIES = "add_entities"  # AddEntitiesCallback from sensor platform

# Panel / frontend
PANEL_URL_PATH = "ha-entities-mapper"                  # sidebar route -> /ha-entities-mapper
PANEL_FILES_URL = "/ha_entities_mapper_files"          # static path for JS
PANEL_MODULE = f"{PANEL_FILES_URL}/ha-entities-mapper-panel.js"
PANEL_COMPONENT = "ha-entities-mapper-panel"
PANEL_TITLE = "Entities Mapper"
PANEL_ICON = "mdi:table-cog"

# Service
SERVICE_ACTION = "action"
ATTR_KEY = "key"
ATTR_ACTION = "action"
VALID_ACTIONS = ("turn_on", "turn_off", "toggle")

# A mapping dict has these fields:
#   key    -> slug, also the proxy object_id (sensor.<key>)  [immutable]
#   name   -> friendly name shown in HA / the app
#   target -> the real entity_id to mirror & control
#   icon   -> optional mdi icon override (else mirrors source)
