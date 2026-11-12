"""
Atlas IoT Core Data Models & Repository
Course: B8019 - Programming the Internet of Things
Atlas IoT Application IDE
"""

import json
import threading
import time
from typing import Dict, List, Optional, Any

class AtlasThing:
    def __init__(self, thing_id: str, space_id: str = "", name: str = "", model: str = "",
                 vendor: str = "", owner: str = "", description: str = "", os: str = "",
                 ip: str = "127.0.0.1", port: int = 6668):
        self.thing_id = thing_id
        self.space_id = space_id
        self.name = name or thing_id
        self.model = model
        self.vendor = vendor
        self.owner = owner
        self.description = description
        self.os = os
        self.ip = ip
        self.port = int(port)
        self.network_name = ""
        self.communication_language = ""
        self.first_seen = time.time()
        self.last_seen = time.time()
        self.skin_image = "rpi4.png"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "thing_id": self.thing_id,
            "space_id": self.space_id,
            "name": self.name,
            "model": self.model,
            "vendor": self.vendor,
            "owner": self.owner,
            "description": self.description,
            "os": self.os,
            "ip": self.ip,
            "port": self.port,
            "network_name": self.network_name,
            "communication_language": self.communication_language,
            "last_seen": self.last_seen,
            "skin_image": self.skin_image
        }

class AtlasEntity:
    def __init__(self, entity_id: str, thing_id: str, space_id: str = "", name: str = "",
                 category: str = "", entity_type: str = "", owner: str = "", vendor: str = "",
                 description: str = ""):
        self.entity_id = entity_id
        self.thing_id = thing_id
        self.space_id = space_id
        self.name = name or entity_id
        self.category = category
        self.entity_type = entity_type  # "Sensor", "Actuator", etc.
        self.owner = owner
        self.vendor = vendor
        self.description = description
        self.skin_image = "sensor.png" if "sensor" in entity_type.lower() else "actuator.png"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "entity_id": self.entity_id,
            "thing_id": self.thing_id,
            "space_id": self.space_id,
            "name": self.name,
            "category": self.category,
            "entity_type": self.entity_type,
            "owner": self.owner,
            "vendor": self.vendor,
            "description": self.description,
            "skin_image": self.skin_image
        }

class AtlasService:
    def __init__(self, name: str, thing_id: str, entity_id: str = "", space_id: str = "",
                 vendor: str = "", api: str = "", service_type: str = "Report",
                 app_category: str = "Sensing", description: str = "", keywords: str = "",
                 inputs: Optional[List[Dict[str, str]]] = None):
        self.name = name
        self.thing_id = thing_id
        self.entity_id = entity_id
        self.space_id = space_id
        self.vendor = vendor
        self.api = api
        self.service_type = service_type  # "Report" (Sensor) or "Action" (Actuator)
        self.app_category = app_category  # "Sensing", "Actuation"
        self.description = description
        self.keywords = keywords
        self.inputs = inputs or []
        self.skin_image = "service_sensor.png" if self.service_type.lower() == "report" or "sens" in self.app_category.lower() else "service_actuator.png"

    def is_sensor(self) -> bool:
        return self.service_type.lower() == "report" or "sens" in self.app_category.lower()

    def is_actuator(self) -> bool:
        return self.service_type.lower() == "action" or "actuat" in self.app_category.lower()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "thing_id": self.thing_id,
            "entity_id": self.entity_id,
            "space_id": self.space_id,
            "vendor": self.vendor,
            "api": self.api,
            "service_type": self.service_type,
            "app_category": self.app_category,
            "description": self.description,
            "keywords": self.keywords,
            "inputs": self.inputs,
            "is_sensor": self.is_sensor(),
            "is_actuator": self.is_actuator(),
            "skin_image": self.skin_image
        }

class AtlasRelationship:
    def __init__(self, name: str, thing_id: str, space_id: str = "", owner: str = "",
                 category: str = "Cooperative", relation_type: str = "Order-based",
                 description: str = "", fs_name: str = "", ss_name: str = "",
                 condition_op: str = "", condition_val: str = ""):
        self.name = name
        self.thing_id = thing_id
        self.space_id = space_id
        self.owner = owner
        self.category = category
        self.relation_type = relation_type  # "Order-based" or "Condition-based"
        self.description = description
        self.fs_name = fs_name  # First Service name (A)
        self.ss_name = ss_name  # Second Service name (B)
        self.condition_op = condition_op
        self.condition_val = condition_val

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "thing_id": self.thing_id,
            "space_id": self.space_id,
            "owner": self.owner,
            "category": self.category,
            "relation_type": self.relation_type,
            "description": self.description,
            "fs_name": self.fs_name,
            "ss_name": self.ss_name,
            "condition_op": self.condition_op,
            "condition_val": self.condition_val
        }

class SmartSpaceRegistry:
    """Thread-safe catalog of all discovered Atlas IoT things, services, and relationships."""
    def __init__(self, space_id: str = "MySmartSpace"):
        self.space_id = space_id
        self.things: Dict[str, AtlasThing] = {}
        self.entities: Dict[str, AtlasEntity] = {}
        self.services: Dict[str, AtlasService] = {}  # key: f"{thing_id}:{service_name}"
        self.relationships: Dict[str, AtlasRelationship] = {}  # key: f"{thing_id}:{name}"
        self.tweet_log: List[Dict[str, Any]] = []
        self._lock = threading.Lock()

    def process_tweet(self, tweet_data: Dict[str, Any]) -> Optional[str]:
        """Parses a tweet dictionary according to Atlas 3.0 specification."""
        tweet_type = tweet_data.get("Tweet Type", "")
        with self._lock:
            self.tweet_log.append({
                "timestamp": time.time(),
                "tweet": tweet_data
            })
            if len(self.tweet_log) > 200:
                self.tweet_log.pop(0)

            if tweet_type == "Identity_Thing":
                thing_id = tweet_data.get("Thing ID")
                if not thing_id:
                    return None
                if thing_id not in self.things:
                    self.things[thing_id] = AtlasThing(
                        thing_id=thing_id,
                        space_id=tweet_data.get("Space ID", self.space_id),
                        name=tweet_data.get("Name", thing_id),
                        model=tweet_data.get("Model", ""),
                        vendor=tweet_data.get("Vendor", ""),
                        owner=tweet_data.get("Owner", ""),
                        description=tweet_data.get("Description", ""),
                        os=tweet_data.get("OS", "")
                    )
                else:
                    t = self.things[thing_id]
                    t.name = tweet_data.get("Name", t.name)
                    t.model = tweet_data.get("Model", t.model)
                    t.vendor = tweet_data.get("Vendor", t.vendor)
                    t.owner = tweet_data.get("Owner", t.owner)
                    t.description = tweet_data.get("Description", t.description)
                    t.os = tweet_data.get("OS", t.os)
                    t.last_seen = time.time()
                return f"Updated Thing: {thing_id}"

            elif tweet_type == "Identity_Language":
                thing_id = tweet_data.get("Thing ID")
                if thing_id:
                    if thing_id not in self.things:
                        self.things[thing_id] = AtlasThing(thing_id=thing_id)
                    t = self.things[thing_id]
                    t.ip = tweet_data.get("IP", t.ip)
                    try:
                        t.port = int(tweet_data.get("Port", t.port))
                    except (ValueError, TypeError):
                        pass
                    t.network_name = tweet_data.get("Network Name", "")
                    t.communication_language = tweet_data.get("Communication Language", "")
                    t.last_seen = time.time()
                    return f"Updated Language for Thing: {thing_id}"

            elif tweet_type == "Identity_Entity":
                thing_id = tweet_data.get("Thing ID", "")
                entity_id = tweet_data.get("ID") or tweet_data.get("Name")
                if not entity_id:
                    return None
                key = f"{thing_id}:{entity_id}"
                self.entities[key] = AtlasEntity(
                    entity_id=entity_id,
                    thing_id=thing_id,
                    space_id=tweet_data.get("Space ID", self.space_id),
                    name=tweet_data.get("Name", entity_id),
                    category=tweet_data.get("Category", ""),
                    entity_type=tweet_data.get("Type", "Sensor"),
                    owner=tweet_data.get("Owner", ""),
                    vendor=tweet_data.get("Vendor", ""),
                    description=tweet_data.get("Description", "")
                )
                return f"Discovered Entity: {entity_id} on {thing_id}"

            elif tweet_type == "Service":
                thing_id = tweet_data.get("Thing ID", "")
                name = tweet_data.get("Name", "")
                if not name or not thing_id:
                    return None
                key = f"{thing_id}:{name}"
                self.services[key] = AtlasService(
                    name=name,
                    thing_id=thing_id,
                    entity_id=tweet_data.get("Entity ID", ""),
                    space_id=tweet_data.get("Space ID", self.space_id),
                    vendor=tweet_data.get("Vendor", ""),
                    api=tweet_data.get("API", ""),
                    service_type=tweet_data.get("Type", "Report"),
                    app_category=tweet_data.get("AppCategory", "Sensing"),
                    description=tweet_data.get("Description", ""),
                    keywords=tweet_data.get("Keywords", "")
                )
                return f"Discovered Service: {name} on {thing_id}"

            elif tweet_type == "Relationship":
                thing_id = tweet_data.get("Thing ID", "")
                name = tweet_data.get("Name", "")
                if not name or not thing_id:
                    return None
                key = f"{thing_id}:{name}"
                self.relationships[key] = AtlasRelationship(
                    name=name,
                    thing_id=thing_id,
                    space_id=tweet_data.get("Space ID", self.space_id),
                    owner=tweet_data.get("Owner", ""),
                    category=tweet_data.get("Category", "Cooperative"),
                    relation_type=tweet_data.get("Type", "Order-based"),
                    description=tweet_data.get("Description", ""),
                    fs_name=tweet_data.get("FS name", ""),
                    ss_name=tweet_data.get("SS name", "")
                )
                return f"Discovered Relationship: {name} on {thing_id}"

        return None

    def get_space_snapshot(self) -> Dict[str, Any]:
        with self._lock:
            # Sort services alphabetically by thing, then name
            sorted_services = sorted(
                [s.to_dict() for s in self.services.values()],
                key=lambda x: (x["thing_id"], x["name"])
            )
            return {
                "space_id": self.space_id,
                "things": [t.to_dict() for t in self.things.values()],
                "entities": [e.to_dict() for e in self.entities.values()],
                "services": sorted_services,
                "relationships": [r.to_dict() for r in self.relationships.values()],
                "counts": {
                    "things": len(self.things),
                    "entities": len(self.entities),
                    "services": len(self.services),
                    "relationships": len(self.relationships)
                }
            }

