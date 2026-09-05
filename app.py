from flask import Flask, jsonify, render_template
import requests

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/spots')
def get_spots():
    url = "https://retrieve.v2.pskreporter.info/query?grid=QF22&noLocatorDetails=1&rronly=1&enc=json"

    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()

        data = response.json()

        spots = []
        for rx in data.get('receptions', []):
            spots.append({
                "sender": rx.get('callsign'),
                "receiver": rx.get('reporterCallsign'),
                "lat1": rx.get('sLat'),
                "lon1": rx.get('sLon'),
                "lat2": rx.get('sLat'),
                "lon2": rx.get('sLon'),
                "snr": rx.get('sNR')
            })

        return jsonify(spots)
    except Exception as e:
        fallback_spots = [
            {"sender": "VK3XYZ", "receiver": "VK2ABC", "lat1": -37.8, "lon1": 144.9, "lat2": -33.8, "lon2": 151.2, "snr": -15}
        ]
        return jsonify(fallback_spots)

if __name__ == "__main__":
    app.run(debug=True, port=5001)