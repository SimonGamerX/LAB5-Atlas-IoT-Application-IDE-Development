"""
Atlas Virtual Smart Space (VSS) Hardware Simulator
Course: B8019 - Programming the Internet of Things

Provides an authentic mock Atlas Thing Middleware node matching the Lab 4 hardware:
- Thing ATID: MySmartThing01 (SmartSpacePi, RPi 4B)
- Entity 1: LightSensor (ADS1115 CH0) -> Service: Read_Light_Level() -> int 0-100
- Entity 2: TempSensor (Rotary Encoder GPIO 20/21) -> Service: Read_Temperature() -> int 15-45 C
- Entity 3: AlarmLED (Red LED GPIO 16) -> Service: Set_Alarm_LED(state) -> void
- Entity 4: CoolingLED (Green LED GPIO 12) -> Service: Set_Cooling_Indicator(state) -> void
- Relationships:
    1) Order-based: Read_Temperature -> Set_Cooling_Indicator
    2) Condition-based: Read_Temperature [> 28] -> Set_Cooling_Indicator(1)
    3) Condition-based: Read_Light_Level [< 20] -> Set_Alarm_LED(1)

Includes a mock TCP 6668 Unicast server that handles Service Call tweets identical
to the real Atlas C++ middleware!
"""

import socket
import json
import threading
import time
import random
import logging
from typing import Dict, Any, Optional
from backend.atlas_core import SmartSpaceRegistry

logger = logging.getLogger("MockSpace")

class MockAtlasThingServer:
    def __init__(self, port: int = 6668, host: str = "127.0.0.1"):
        self.host = host
        self.port = port
        self.running = False
        self.server_sock: Optional[socket.socket] = None
        self.thread: Optional[threading.Thread] = None

        # Simulated physical state
        self.state = {
            "light_level": 55,       # 0 - 100%
            "temperature": 24,       # 15 - 45 °C
            "alarm_led": 0,          # 0 or 1
            "cooling_indicator": 0   # 0 or 1
        }

    def start(self):
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(target=self._run_server, daemon=True)
        self.thread.name = "Mock-Atlas-TCP-6668"
        self.thread.start()
        logger.info(f"Mock Atlas Thing TCP Server started on {self.host}:{self.port}")

    def stop(self):
        self.running = False
        if self.server_sock:
            try:
                self.server_sock.close()
            except Exception:
                pass

    def _run_server(self):
        self.server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            self.server_sock.bind((self.host, self.port))
            self.server_sock.listen(5)
            self.server_sock.settimeout(1.0)
        except Exception as e:
            logger.warning(f"Could not bind Mock TCP server on {self.host}:{self.port}: {e}")
            return

        while self.running:
            try:
                client_sock, addr = self.server_sock.accept()
                threading.Thread(target=self._handle_client, args=(client_sock,), daemon=True).start()
            except socket.timeout:
                continue
            except Exception as e:
                if self.running:
                    logger.debug(f"Mock server accept error: {e}")
                break

    def _handle_client(self, client_sock: socket.socket):
        client_sock.settimeout(3.0)
        try:
            data = client_sock.recv(4096)
            if not data:
                return
            req_str = data.decode("utf-8", errors="ignore").strip()
            req = json.loads(req_str)

            # Validate Atlas Service call format
            service_name = req.get("Service Name", "")
            raw_inputs = req.get("Service Inputs", "()")
            
            # Extract inputs inside parentheses e.g. "(1)" -> "1"
            arg = ""
            if "(" in raw_inputs and ")" in raw_inputs:
                arg = raw_inputs[raw_inputs.find("(")+1 : raw_inputs.find(")")].strip()

            resp_payload: Dict[str, Any] = {
                "Tweet Type": "Service response",
                "Service Name": service_name,
                "Status": "SUCCESS"
            }

            if service_name == "Read_Light_Level":
                # Jitter light slightly
                self.state["light_level"] = max(5, min(95, self.state["light_level"] + random.randint(-2, 2)))
                resp_payload["Return"] = self.state["light_level"]
                resp_payload["Value"] = self.state["light_level"]

            elif service_name == "Read_Temperature":
                # Simulated thermostat dial with realistic small drift
                self.state["temperature"] = max(16, min(42, self.state["temperature"] + random.choice([-1, 0, 0, 1])))
                resp_payload["Return"] = self.state["temperature"]
                resp_payload["Value"] = self.state["temperature"]

            elif service_name == "Set_Alarm_LED":
                val = int(arg) if arg.isdigit() else 1
                self.state["alarm_led"] = val
                resp_payload["Return"] = 0
                resp_payload["Message"] = f"Red Alarm LED set to {val}"

            elif service_name == "Set_Cooling_Indicator":
                val = int(arg) if arg.isdigit() else 1
                self.state["cooling_indicator"] = val
                resp_payload["Return"] = 0
                resp_payload["Message"] = f"Green Cooling LED set to {val}"

            else:
                resp_payload["Return"] = 0
                resp_payload["Message"] = f"Unknown service {service_name} executed."

            client_sock.sendall(json.dumps(resp_payload).encode("utf-8"))
        except Exception as e:
            logger.debug(f"Error handling mock service call: {e}")
        finally:
            try:
                client_sock.close()
            except Exception:
                pass


def generate_lab4_tweets(rpi_ip: str = "127.0.0.1", port: int = 6668) -> list:
    """Returns the exact sequence of Atlas tweets generated by the Lab 4 IoT-DDL."""
    return [
        # 1. Identity_Thing
        {
            "Tweet Type": "Identity_Thing",
            "Thing ID": "MySmartThing01",
            "Space ID": "MySmartSpace",
            "Name": "SmartSpacePi",
            "Model": "4B",
            "Vendor": "RaspberryPiCo",
            "Owner": "iotpj",
            "Description": "Raspberry Pi 4B Smart Environmental and Safety Space",
            "OS": "Raspbian"
        },
        # 2. Identity_Language
        {
            "Tweet Type": "Identity_Language",
            "Thing ID": "MySmartThing01",
            "Space ID": "MySmartSpace",
            "Network Name": "MySpaceNetwork",
            "Communication Language": "JSON/TCP",
            "IP": rpi_ip,
            "Port": str(port)
        },
        # 3. Identity_Entity: LightSensor
        {
            "Tweet Type": "Identity_Entity",
            "Thing ID": "MySmartThing01",
            "Space ID": "MySmartSpace",
            "Name": "LightSensor",
            "ID": "Entity_LightSensor",
            "Type": "Sensor",
            "Owner": "iotpj",
            "Vendor": "LDR",
            "Description": "Measures ambient light intensity via ADS1115 Channel 0"
        },
        # 4. Identity_Entity: TempSensor
        {
            "Tweet Type": "Identity_Entity",
            "Thing ID": "MySmartThing01",
            "Space ID": "MySmartSpace",
            "Name": "TempSensor",
            "ID": "Entity_TempSensor",
            "Type": "Sensor",
            "Owner": "iotpj",
            "Vendor": "RotaryEncoder",
            "Description": "Reads simulated thermostat temperature dial via Rotary Encoder on GPIO 20 and 21"
        },
        # 5. Identity_Entity: AlarmLED
        {
            "Tweet Type": "Identity_Entity",
            "Thing ID": "MySmartThing01",
            "Space ID": "MySmartSpace",
            "Name": "AlarmLED",
            "ID": "Entity_AlarmLED",
            "Type": "Actuator",
            "Owner": "iotpj",
            "Vendor": "Generic",
            "Description": "Red Alert indicator LED connected to GPIO 16"
        },
        # 6. Identity_Entity: CoolingLED
        {
            "Tweet Type": "Identity_Entity",
            "Thing ID": "MySmartThing01",
            "Space ID": "MySmartSpace",
            "Name": "CoolingLED",
            "ID": "Entity_CoolingLED",
            "Type": "Actuator",
            "Owner": "iotpj",
            "Vendor": "Generic",
            "Description": "Green Cooling/Fan status LED connected to GPIO 12"
        },
        # 7. Service: Read_Light_Level
        {
            "Tweet Type": "Service",
            "Name": "Read_Light_Level",
            "Thing ID": "MySmartThing01",
            "Entity ID": "Entity_LightSensor",
            "Space ID": "MySmartSpace",
            "Vendor": "LDR",
            "API": "int Read_Light_Level()",
            "Type": "Report",
            "AppCategory": "Sensing",
            "Description": "Reads ambient light level percentage (0-100) from ADS1115 ADC Channel 0",
            "Keywords": "Light,Sensor,ADC,LDR"
        },
        # 8. Service: Read_Temperature
        {
            "Tweet Type": "Service",
            "Name": "Read_Temperature",
            "Thing ID": "MySmartThing01",
            "Entity ID": "Entity_TempSensor",
            "Space ID": "MySmartSpace",
            "Vendor": "RotaryEncoder",
            "API": "int Read_Temperature()",
            "Type": "Report",
            "AppCategory": "Sensing",
            "Description": "Reads simulated thermostat dial temperature (15-45 C) from Rotary Encoder",
            "Keywords": "Temperature,Sensor,Thermostat,RotaryEncoder,GPIO"
        },
        # 9. Service: Set_Alarm_LED
        {
            "Tweet Type": "Service",
            "Name": "Set_Alarm_LED",
            "Thing ID": "MySmartThing01",
            "Entity ID": "Entity_AlarmLED",
            "Space ID": "MySmartSpace",
            "Vendor": "Generic",
            "API": "void Set_Alarm_LED(int state)",
            "Type": "Action",
            "AppCategory": "Actuation",
            "Description": "Switches Red Alarm LED ON (1) or OFF (0) on GPIO 16",
            "Keywords": "Alarm,LED,Actuator,GPIO"
        },
        # 10. Service: Set_Cooling_Indicator
        {
            "Tweet Type": "Service",
            "Name": "Set_Cooling_Indicator",
            "Thing ID": "MySmartThing01",
            "Entity ID": "Entity_CoolingLED",
            "Space ID": "MySmartSpace",
            "Vendor": "Generic",
            "API": "void Set_Cooling_Indicator(int state)",
            "Type": "Action",
            "AppCategory": "Actuation",
            "Description": "Switches Green Cooling LED ON (1) or OFF (0) on GPIO 12",
            "Keywords": "Cooling,Fan,LED,Actuator,GPIO"
        },
        # 11. Relationship 1: Order-based
        {
            "Tweet Type": "Relationship",
            "Thing ID": "MySmartThing01",
            "Space ID": "MySmartSpace",
            "Name": "Rel_Temp_Cooling_Order",
            "Owner": "iotpj",
            "Category": "Cooperative",
            "Type": "Order-based",
            "Description": "Service Set_Cooling_Indicator may run only after Read_Temperature completes",
            "FS name": "Read_Temperature",
            "SS name": "Set_Cooling_Indicator"
        },
        # 12. Relationship 2: Condition-based
        {
            "Tweet Type": "Relationship",
            "Thing ID": "MySmartThing01",
            "Space ID": "MySmartSpace",
            "Name": "Rel_Overheat_Cooling",
            "Owner": "iotpj",
            "Category": "Cooperative",
            "Type": "Condition-based",
            "Description": "Service Set_Cooling_Indicator runs if Read_Temperature > 28 C",
            "FS name": "Read_Temperature",
            "SS name": "Set_Cooling_Indicator"
        },
        # 13. Relationship 3: Condition-based Dark Alarm
        {
            "Tweet Type": "Relationship",
            "Thing ID": "MySmartThing01",
            "Space ID": "MySmartSpace",
            "Name": "Rel_Darkness_Alert",
            "Owner": "iotpj",
            "Category": "Cooperative",
            "Type": "Condition-based",
            "Description": "Service Set_Alarm_LED runs if Read_Light_Level < 15%",
            "FS name": "Read_Light_Level",
            "SS name": "Set_Alarm_LED"
        }
    ]

def inject_mock_space(registry: SmartSpaceRegistry, rpi_ip: str = "127.0.0.1", port: int = 6668):
    """Feeds the simulated Lab 4 device tweets directly into the registry."""
    tweets = generate_lab4_tweets(rpi_ip, port)
    for t in tweets:
        registry.process_tweet(t)
    logger.info("Injected Lab 4 Virtual Smart Space tweets into registry.")

