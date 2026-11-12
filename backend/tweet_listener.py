"""
Tweet Listener Thread for Atlas Smart Space Discovery
Course: B8019 - Programming the Internet of Things

Listens for:
1) UDP Multicast tweets on 232.1.1.1:1235
2) MQTT tweets on broker.hivemq.com:1883 (Topic /Atlas/#)
Passes all parsed JSON tweets into SmartSpaceRegistry.
"""

import socket
import struct
import json
import threading
import time
import logging
from typing import Optional, Callable
from backend.atlas_core import SmartSpaceRegistry

logger = logging.getLogger("TweetListener")

MULTICAST_GROUP = "232.1.1.1"
MULTICAST_PORT = 1235
MQTT_BROKER = "broker.hivemq.com"
MQTT_PORT = 1883
MQTT_TOPIC = "/Atlas/#"

class TweetListener:
    def __init__(self, registry: SmartSpaceRegistry, on_tweet_callback: Optional[Callable[[dict], None]] = None):
        self.registry = registry
        self.on_tweet_callback = on_tweet_callback
        self.running = False
        self.multicast_thread: Optional[threading.Thread] = None
        self.mqtt_thread: Optional[threading.Thread] = None
        self.mqtt_client = None
        self.last_tweet_time = 0.0

    def start(self):
        """Starts background listening threads."""
        if self.running:
            return
        self.running = True
        logger.info("Starting Atlas Tweet Discovery Listeners...")

        # 1. Start UDP Multicast listener thread
        self.multicast_thread = threading.Thread(target=self._run_multicast_listener, daemon=True)
        self.multicast_thread.name = "UDP-Multicast-Listener"
        self.multicast_thread.start()

        # 2. Start MQTT listener thread (if paho-mqtt is available)
        self.mqtt_thread = threading.Thread(target=self._run_mqtt_listener, daemon=True)
        self.mqtt_thread.name = "MQTT-Tweet-Listener"
        self.mqtt_thread.start()

    def stop(self):
        """Stops background listening threads."""
        self.running = False
        if self.mqtt_client:
            try:
                self.mqtt_client.disconnect()
            except Exception:
                pass

    def _handle_raw_message(self, raw_str: str, source: str = "Multicast"):
        raw_str = raw_str.strip()
        if not raw_str:
            return
        try:
            data = json.loads(raw_str)
            if isinstance(data, dict) and "Tweet Type" in data:
                self.last_tweet_time = time.time()
                res = self.registry.process_tweet(data)
                if res:
                    logger.info(f"[{source}] {res}")
                if self.on_tweet_callback:
                    self.on_tweet_callback(data)
        except json.JSONDecodeError:
            pass
        except Exception as e:
            logger.debug(f"Error handling tweet: {e}")

    def _run_multicast_listener(self):
        sock = None
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

            # Bind to multicast port
            try:
                sock.bind(("", MULTICAST_PORT))
            except Exception:
                # Windows fallback
                sock.bind(("0.0.0.0", MULTICAST_PORT))

            # Join multicast group
            mreq = struct.pack("=4sl", socket.inet_aton(MULTICAST_GROUP), socket.INADDR_ANY)
            sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
            sock.settimeout(2.0)
            logger.info(f"Joined Multicast Group {MULTICAST_GROUP}:{MULTICAST_PORT}")

            while self.running:
                try:
                    data, addr = sock.recvfrom(8192)
                    decoded = data.decode("utf-8", errors="ignore")
                    self._handle_raw_message(decoded, source=f"UDP-{addr[0]}")
                except socket.timeout:
                    continue
                except Exception as e:
                    if self.running:
                        logger.debug(f"Multicast recv error: {e}")
                    time.sleep(0.5)

        except Exception as e:
            logger.warning(f"Could not bind Multicast socket on {MULTICAST_GROUP}:{MULTICAST_PORT}: {e}")
        finally:
            if sock:
                try:
                    sock.close()
                except Exception:
                    pass

    def _run_mqtt_listener(self):
        try:
            import paho.mqtt.client as mqtt

            def on_connect(client, userdata, flags, rc):
                if rc == 0:
                    logger.info(f"Connected to HiveMQ Broker ({MQTT_BROKER}:{MQTT_PORT}), subscribing to {MQTT_TOPIC}")
                    client.subscribe(MQTT_TOPIC)
                else:
                    logger.warning(f"MQTT connect returned code {rc}")

            def on_message(client, userdata, msg):
                try:
                    payload = msg.payload.decode("utf-8", errors="ignore")
                    self._handle_raw_message(payload, source=f"MQTT-{msg.topic}")
                except Exception as e:
                    logger.debug(f"MQTT parse error: {e}")

            client = mqtt.Client()
            client.on_connect = on_connect
            client.on_message = on_message
            self.mqtt_client = client

            try:
                client.connect(MQTT_BROKER, MQTT_PORT, keepalive=30)
                client.loop_start()
                while self.running:
                    time.sleep(1.0)
                client.loop_stop()
            except Exception as e:
                logger.info(f"MQTT broker connection unavailable ({e}). Continuing with Multicast.")
        except ImportError:
            logger.info("paho-mqtt not available; operating on UDP Multicast only.")
        except Exception as e:
            logger.debug(f"MQTT thread exception: {e}")

