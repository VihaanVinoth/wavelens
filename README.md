# WaveLens

![Propagation Map Demo](https://cdn.hackclub.com/01a0c521-91ff-7149-b6e6-1a47022c296d/Screenshot%202026-09-22%20at%204.01.38%E2%80%AFAM.png)

WaveLens is a real-time amateur radio propagation visualiser that uses the public PSKReporter MQTT API, converts Maidenhead grid squares into map coordinates, and plots live radio paths on an interactive Leaflet map. 

## How It Was Made

This project is built using Python and flask backend that handles the MQTT stream in a background thread with a thread-safe deque. The frontend is vanilla HTML, CSS, and JavaScript paired with Leaflet.js, and CartoDB map tiles. 

Some of the hurdles tackled during development:
- Handling raw MQTT payloads and safely parsing 4-character and 6-character Maidenhead grid locators (`sl`/`rl`) into precise latitude and longitude values without crashing when telemetry data is malformed.
- Managing memory efficiently by capping the deque size (`maxlen=150`) to prevent the server from bloating over time from thousands of incoming FT8/FT4 spots.

## Running the Project
1. Clone the source code to your device:

`
git clone https://github.com/VihaanVinoth/wavelens.git
cd propagation-map
`

2. Install the project's dependencies:

`
pip install flask paho-mqtt
`

3. Start the development server on `localhost:5001`:

`
python3 app.py
`

4. Running in the Background (Production / Nohup)
If you're hosting this on a VPS and want it to stay up persistently:

`
nohup python3 app.py > output.log 2>&1 &
`

To stop the background service later:

`
pkill -f app.py
`

## AI Disclosure
AI was used to help structure the initial layout components and speed up CSS grid styling definitions.