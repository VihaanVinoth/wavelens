from flask import Flask, render_template, jsonify, request
import requests
import xml.etree.ElementTree as ET

app = Flask(__name__)

BAND_RANGES = {
    '20m': (14000000, 14100000),
    '40m': (7000000, 7150000),
    '30m': (10100000, 10150000),
    '15m': (21000000, 21150000),
    '10m': (28000000, 28200000),
    '80m': (3500000, 3600000)
}

def maidenhead_to_latlon(locator):
    if not locator or len(locator) < 4:
        return None, None
    locator = locator.upper()
    try:
        lon = (ord(locator[0]) - ord('A')) * 20 - 180
        lat = (ord(locator[1]) - ord('A')) * 10 - 90
        lon += int(locator[2]) * 2
        lat += int(locator[3]) * 1
        if len(locator) >= 6:
            lon += (ord(locator[4]) - ord('A')) / 12.0
            lat += (ord(locator[5]) - ord('A')) / 24.0
            lon += 1.0 / 24.0
            lon += 1.0 / 48.0
        else:
            lon += 1.0
            lat += 0.5
        return lat, lon
    except Exception:
        return None, None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/spots')
def get_spots():
    band = request.args.get('band', '20m')
    freq_range = BAND_RANGES.get(band, BAND_RANGES['20m'])
    
    url = f"https://retrieve.pskreporter.info/query?frange={freq_range[0]}-{freq_range[1]}&flowStartSeconds=-7200&rronly=1"
    headers = {'User-Agent': 'WaveLens-SDR-Telemetry/1.0'}
    
    spots = []
    try:
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            root = ET.fromstring(response.content)
            for report in root.findall('.//receptionReport'):
                sender = report.get('senderCallsign')
                receiver = report.get('receiverCallsign')
                s_locator = report.get('senderLocator')
                r_locator = report.get('receiverLocator')
                freq = report.get('frequency')
                snr = report.get('sNR')
                mode = report.get('mode', 'FT8')
                
                lat1, lon1 = maidenhead_to_latlon(s_locator)
                lat2, lon2 = maidenhead_to_latlon(r_locator)
                
                if lat1 is not None and lon1 is not None and lat2 is not None and lon2 is not None:
                    spots.append({
                        'sender': sender,
                        'receiver': receiver,
                        'lat1': lat1,
                        'lon1': lon1,
                        'lat2': lat2,
                        'lon2': lon2,
                        'frequency': int(freq) if freq else freq_range[0],
                        'snr': int(snr) if snr else 0,
                        'mode': mode
                    })
    except Exception as e:
        print(f"PSK Reporter query warning: {e}")
        
    return jsonify(spots[:100])

if __name__ == '__main__':
    app.run(debug=True)