from flask import Flask, jsonify, render_template
import paho.mqtt.client as mqtt

import json
import logging
import os
import threading
import time
from collections import deque
from pathlib import Path

HOST = "0.0.0.0"
PORT = int(os.getenv("PORT", "5001"))

MQTT_HOST = "mqtt.pskreporter.info"
MQTT_PORT = 1883

HUB_CALLSIGN = os.getenv("WAVELENS_CALLSIGN", "WB2QEF")
HUB_LAT = float(os.getenv("WAVELENS_LAT", "40.7128"))
HUB_LON = float(os.getenv("WAVELENS_LON", "-74.0060"))

SPOTS_PER_BAND = 75

BANDS = {
    "160m": (1.8, 2.0),
    "80m": (3.5, 4.0),
    "40m": (7.0, 7.3),
    "20m": (14.0, 14.35),
    "15m": (21.0, 21.45),
    "10m": (28.0, 29.7),
    "6m": (50.0, 54.0),
    "2m": (144.0, 148.0)
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

logger = logging.getLogger("wavelens")

app = Flask(__name__)

CACHE_DIR = Path("data")
CACHE_FILE = CACHE_DIR / "spots.json"
SNAPSHOT_FILE = CACHE_DIR / "snapshot.json"

CACHE_DIR.mkdir(parents=True, exist_ok=True)

BAND_SPOTS = {
    band: deque(maxlen=SPOTS_PER_BAND)
    for band in BANDS
}

spots_lock = threading.Lock()

cache_dirty = False
cache_dirty_lock = threading.Lock()

def mark_cache_dirty():
    global cache_dirty

    with cache_dirty_lock:
        cache_dirty = True

def save_cache():
    with spots_lock:
        data = {
            band: list(spots)
            for band, spots in BAND_SPOTS.items()
        }

    payload = {
        "saved_at": time.time(),
        "bands": data
    }

    temporary_file = CACHE_DIR / "spots.tmp"

    try:
        with open(temporary_file, "w", encoding="utf-8") as file:
            json.dump(payload, file, separators=(",", ":"))

        os.replace(temporary_file, CACHE_FILE)

    except Exception:
        logger.exception("Could not save WaveLens cache.")


def load_cache():
    if not CACHE_FILE.exists():
        logger.info("No existing spot cache found.")
        return

    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as file:
            payload = json.load(file)

        bands = payload.get("bands", {})

        with spots_lock:
            for band in BANDS:
                BAND_SPOTS[band].clear()

                for spot in bands.get(band, []):
                    BAND_SPOTS[band].append(spot)

        logger.info("Loaded cached WaveLens data.")

    except Exception:
        logger.exception("Could not load WaveLens cache.")


def cache_writer():
    global cache_dirty

    while True:
        time.sleep(5)

        with cache_dirty_lock:
            dirty = cache_dirty
            cache_dirty = False

        if dirty:
            save_cache()

load_cache()


cache_thread = threading.Thread(
    target=cache_writer,
    name="wavelens-cache",
    daemon=True
)

cache_thread.start()

def create_snapshot():
    with spots_lock:
        bands = {
            band: list(spots)
            for band, spots in BAND_SPOTS.items()
        }

    snapshot = {
        "saved_at": time.time(),
        "bands": bands
    }

    temporary_file = CACHE_DIR / "snapshot.tmp"

    try:
        with open(
            temporary_file,
            "w",
            encoding="utf-8"
        ) as file:
            json.dump(
                snapshot,
                file,
                separators=(",", ":")
            )

        os.replace(
            temporary_file,
            SNAPSHOT_FILE
        )

        logger.info("Created new WaveLens snapshot.")

        return snapshot

    except Exception:
        logger.exception(
            "Could not create WaveLens snapshot."
        )

        return None


def load_snapshot():
    if not SNAPSHOT_FILE.exists():
        logger.info(
            "No snapshot exists yet. Creating one from cache."
        )

        return create_snapshot()

    try:
        with open(
            SNAPSHOT_FILE,
            "r",
            encoding="utf-8"
        ) as file:
            return json.load(file)

    except Exception:
        logger.exception(
            "Could not load WaveLens snapshot."
        )

        return create_snapshot()

def get_band(frequency):
    try:
        mhz = float(frequency) / 1_000_000
    except (TypeError, ValueError):
        return None

    for band, (low, high) in BANDS.items():
        if low <= mhz <= high:
            return band

    return None


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
                (ord(grid[4]) - ord("A")) + 0.5
            ) / 12.0

            lat += (
                (ord(grid[5]) - ord("A")) + 0.5
            ) / 24.0

        return lat, lon

    except (
        TypeError,
        ValueError,
        IndexError
    ):
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
            "pskr/filter/v2/#"
        )

        logger.info(
            "Subscribed to the full PSK Reporter MQTT feed."
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

        sender_lat, sender_lon = grid_to_latlon(
            sender_grid
        )

        receiver_lat, receiver_lon = grid_to_latlon(
            receiver_grid
        )

        if (
            sender_lat is None
            and receiver_lat is None
        ):
            return

        frequency = raw.get("f", 0)

        try:
            frequency = int(frequency)
        except (
            TypeError,
            ValueError
        ):
            frequency = 0

        band = get_band(frequency)

        if band is None:
            return

        snr = raw.get("rp", 0)

        try:
            snr = float(snr)
        except (
            TypeError,
            ValueError
        ):
            snr = 0

        spot = {
            "sender": raw.get("sc") or "Unknown",
            "receiver": raw.get("rc") or "Unknown",
            "mode": raw.get("md") or "Unknown",

            "frequency": frequency,
            "snr": snr,

            "sender_grid": sender_grid,
            "receiver_grid": receiver_grid,

            "lat1": sender_lat,
            "lon1": sender_lon,

            "lat2": receiver_lat,
            "lon2": receiver_lon,

            "timestamp": time.time()
        }

        with spots_lock:
            BAND_SPOTS[band].appendleft(spot)

        mark_cache_dirty()

    except json.JSONDecodeError:
        logger.warning(
            "Received invalid MQTT JSON."
        )

    except Exception:
        logger.exception(
            "Error processing MQTT spot."
        )


def start_mqtt_client():
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

@app.route("/map")
def map_page():
    return render_template(
        "map.html",
        hub={
            "lat": HUB_LAT,
            "lon": HUB_LON,
            "callsign": HUB_CALLSIGN
        }
    )

@app.route("/api/spots")
def get_spots():
    with spots_lock:
        spots = []

        for band_spots in BAND_SPOTS.values():
            spots.extend(band_spots)

    spots.sort(
        key=lambda spot: spot["timestamp"],
        reverse=True
    )

    return jsonify(spots)


@app.route("/api/snapshot")
def get_snapshot():
    snapshot = load_snapshot()

    if snapshot is None:
        return jsonify({
            "saved_at": None,
            "bands": {}
        })

    spots = []

    for band_spots in snapshot.get(
        "bands",
        {}
    ).values():
        spots.extend(band_spots)

    spots.sort(
        key=lambda spot: spot.get(
            "timestamp",
            0
        ),
        reverse=True
    )

    return jsonify({
        "saved_at": snapshot.get(
            "saved_at"
        ),
        "spots": spots
    })


@app.route(
    "/api/snapshot/update",
    methods=["POST"]
)
def update_snapshot():
    snapshot = create_snapshot()

    if snapshot is None:
        return jsonify({
            "error": "Could not create snapshot"
        }), 500

    spots = []

    for band_spots in snapshot[
        "bands"
    ].values():
        spots.extend(band_spots)

    spots.sort(
        key=lambda spot: spot.get(
            "timestamp",
            0
        ),
        reverse=True
    )

    return jsonify({
        "saved_at": snapshot["saved_at"],
        "spots": spots
    })


@app.route("/api/spots/<band>")
def get_band_spots(band):
    band = band.lower()

    if band not in BAND_SPOTS:
        return jsonify({
            "error": "Unknown band"
        }), 404

    with spots_lock:
        spots = list(BAND_SPOTS[band])

    return jsonify(spots)


@app.route("/api/stats")
def get_stats():
    with spots_lock:
        stats = {
            band: len(spots)
            for band, spots in BAND_SPOTS.items()
        }

    return jsonify(stats)


@app.route("/api/health")
def health():
    with spots_lock:
        total = sum(
            len(spots)
            for spots in BAND_SPOTS.values()
        )

        stats = {
            band: len(spots)
            for band, spots in BAND_SPOTS.items()
        }

    return jsonify({
        "status": "ok",
        "spots": total,
        "bands": stats,
        "mqtt": MQTT_HOST,
        "cache": CACHE_FILE.exists(),
        "snapshot": SNAPSHOT_FILE.exists()
    })

if __name__ == "__main__":
    logger.info(
        "Starting WaveLens on port %s",
        PORT
    )

    app.run(
        host=HOST,
        port=PORT,
        debug=False,
        use_reloader=False
    )