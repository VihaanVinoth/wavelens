from flask import Flask, jsonify, render_template
import paho.mqtt.client as mqtt
import json
import threading
from collections import deque
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')

app = Flask(__name__)

LATEST_SPOTS = deque(maxlen=150)
spots_lock = threading.Lock()

def grid_to_latlon(grid):
    if not grid or len(grid) < 4:
        return None, None
    grid = grid.upper()
    try:
        lon = (ord(grid[0]) - ord('A')) * 20 - 180 + (ord(grid[2]) - ord('0')) * 2 + 1
        lat = (ord(grid[1]) - ord('A')) * 10 - 90 + (ord(grid[3]) - ord('0')) * 1 + 0.5
        if len(grid) >= 6:
            lon += (ord(grid[4]) - ord('A')) / 12.0
            lat += (ord(grid[5]) - ord('A')) / 24.0
        return lat, lon
    except Exception:
        return None, None

def on_connect(client, userdata, flags, reason_code, properties=None):
    rc_value = reason_code.value if hasattr(reason_code, 'value') else reason_code
    if rc_value == 0:
        logging.info("Connected successfully to PSK Reporter MQTT broker!")
        client.subscribe("pskr/filter/v2/+/+/+/+/+/+/+/+")
    else:
        logging.warning(f"Failed to connect to MQTT broker, return code {rc_value}")

def on_message(client, userdata, msg):
    try:
        raw = json.loads(msg.payload.decode('utf-8'))
        
        sender_grid = raw.get('sl', '')
        receiver_grid = raw.get('rl', '')
        
        lat1, lon1 = grid_to_latlon(sender_grid)
        lat2, lon2 = grid_to_latlon(receiver_grid)
        
        spot_data = {
            "sender": raw.get('sc', 'Unknown'),
            "receiver": raw.get('rc', 'Unknown'),
            "mode": raw.get('md', 'FT8'),
            "frequency": raw.get('f', 14074000),
            "snr": raw.get('rp', 0),
            "lat1": lat1,
            "lon1": lon1,
            "lat2": lat2,
            "lon2": lon2
        }
        
        if lat1 is not None and lat2 is not None:
            with spots_lock:
                LATEST_SPOTS.appendleft(spot_data)
                
    except Exception as e:
        logging.error(f"Error parsing incoming MQTT spot: {e}")

def start_mqtt_client():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_message = on_message
    
    while True:
        try:
            logging.info("Connecting to mqtt.pskreporter.info...")
            client.connect("mqtt.pskreporter.info", 1883, 60)
            client.loop_forever()
        except Exception as e:
            logging.error(f"MQTT connection error: {e}. Retrying in 10 seconds...")
            threading.Event().wait(10)

mqtt_thread = threading.Thread(target=start_mqtt_client, daemon=True)
mqtt_thread.start()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/spots', methods=['GET'])
def get_spots():
    with spots_lock:
        spots_list = list(LATEST_SPOTS)
    
    if not spots_list:
        spots_list = [
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
        
    return jsonify(spots_list)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)