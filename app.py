from flask import Flask, jsonify, render_template
import paho.mqtt.client as mqtt

import json
import logging
import os
import threading
import time

from collections import deque

HOST = "0.0.0.0"
PORT = int(os.getenv("PORT", "5001"))

MQTT_HOST = "mqtt.pskreporter.info"
MQTT_PORT = 1883

HUB_CALLSIGN = os.getenv(
    "WAVELENS_CALLSIGN",
    "WB2QEF"
)

HUB_LAT = float(
    os.getenv("WAVELENS_LAT", "40.7128")
)

HUB_LON = float(
    os.getenv("WAVELENS_LON", "-74.0060")
)

MAX_SPOTS = 150

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

logger = logging.getLogger("wavelens")

app = Flask(__name__)


LATEST_SPOTS = deque(maxlen=MAX_SPOTS)

spots_lock = threading.Lock()

def grid_to_latlon(grid):

    if not grid:
        return None, None

    grid = str(grid).strip().upper()

    if len(grid) < 4:
        return None, None

    try:
        lon = (
            (ord(grid[0]) - ord("A")) * 20
            - 180
            + (ord(grid[2]) - ord("0")) * 2
            + 1
        )

        lat = (
            (ord(grid[1]) - ord("A")) * 10
            - 90
            + (ord(grid[3]) - ord("0"))
            + 0.5
        )

        if len(grid) >= 6:
            lon += (
                (ord(grid[4]) - ord("A"))
                + 0.5
            ) / 12.0

            lat += (
                (ord(grid[5]) - ord("A"))
                + 0.5
            ) / 24.0

        return lat, lon

    except (TypeError, ValueError, IndexError):
        return None, None

def on_connect(
    client,
    userdata,
    flags,
    reason_code,
    properties=None
):

    code = (
        reason_code.value
        if hasattr(reason_code, "value")
        else reason_code
    )

    if code == 0:
        logger.info(
            "Connected to PSK Reporter MQTT broker."
        )

        client.subscribe(
            "pskr/filter/v2/+/+/+/+/+/+/+/+"
        )

    else:
        logger.warning(
            "MQTT connection failed: %s",
            code
        )


def on_message(client, userdata, msg):

    try:
        raw = json.loads(
            msg.payload.decode("utf-8")
        )

        sender_grid = raw.get("sl", "")
        receiver_grid = raw.get("rl", "")

        lat1, lon1 = grid_to_latlon(
            sender_grid
        )

        lat2, lon2 = grid_to_latlon(
            receiver_grid
        )

        if lat1 is None or lat2 is None:
            return

        spot = {
            "sender": raw.get(
                "sc",
                "Unknown"
            ),

            "receiver": raw.get(
                "rc",
                "Unknown"
            ),

            "mode": raw.get(
                "md",
                "FT8"
            ),

            "frequency": raw.get(
                "f",
                14074000
            ),

            "snr": raw.get(
                "rp",
                0
            ),

            "lat1": lat1,
            "lon1": lon1,

            "lat2": lat2,
            "lon2": lon2
        }

        with spots_lock:
            LATEST_SPOTS.appendleft(spot)

    except json.JSONDecodeError:
        logger.warning(
            "Received invalid MQTT JSON."
        )

    except Exception:
        logger.exception(
            "Error processing MQTT spot."
        )


def start_mqtt_client():
    """
    Keep the MQTT connection alive.
    """

    while True:

        client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2
        )

        client.on_connect = on_connect
        client.on_message = on_message

        try:

            logger.info(
                "Connecting to %s:%s...",
                MQTT_HOST,
                MQTT_PORT
            )

            client.connect(
                MQTT_HOST,
                MQTT_PORT,
                60
            )

            client.loop_forever()

        except Exception as error:

            logger.error(
                "MQTT connection error: %s",
                error
            )

            logger.info(
                "Retrying MQTT connection in 10 seconds..."
            )

            time.sleep(10)

mqtt_thread = threading.Thread(
    target=start_mqtt_client,
    name="wavelens-mqtt",
    daemon=True
)

mqtt_thread.start()

@app.route("/")
def index():

    return render_template(
        "index.html",
        hub={
            "lat": HUB_LAT,
            "lon": HUB_LON,
            "callsign": HUB_CALLSIGN
        }
    )


@app.route("/api/spots")
def get_spots():

    with spots_lock:
        spots = list(LATEST_SPOTS)

    if not spots:

        spots = [
            {
                "sender": "W1AW",
                "receiver": "VK3XYZ",
                "mode": "FT8",
                "frequency": 14074000,
                "snr": -12,

                "lat1": 41.7148,
                "lon1": -72.7271,

                "lat2": -37.8136,
                "lon2": 144.9631
            }
        ]

    return jsonify(spots)

@app.route("/api/health")
def health():

    with spots_lock:
        count = len(LATEST_SPOTS)

    return jsonify({
        "status": "ok",
        "spots": count,
        "mqtt": MQTT_HOST
    })

if __name__ == "__main__":

    app.run(
        host=HOST,
        port=PORT,
        debug=True,
        use_reloader=False
    )