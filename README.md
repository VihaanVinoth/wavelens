# WaveLens

WaveLens is a production-ready, real-time amateur radio telemetry and propagation mapping console designed for tracking live global FT8 and WSPR digital mode traffic via the PSK Reporter API.

## Features
* **Live Telemetry Stream:** Queries real-time ionospheric reception reports across multiple amateur frequency bands (20m, 40m, 30m, 15m, 10m, 80m).
* **Interactive Propagation Map:** Built with Leaflet.js, plotting transmitter-to-receiver great-circle paths and station nodes.
* **Callsign Filtering:** Instant client-side filtering to isolate specific stations or callsign prefixes.
* **Dynamic S-Meter & Signal Analytics:** Computes live average SNR and visualizes signal strength dynamically.
* **Theme Persistence:** Seamless toggle between tactical dark mode and high-contrast light mode, saved locally via `localStorage`.

## Tech Stack
* **Backend:** Python, Flask, Gunicorn, `requests`, XML ElementTree parsing.
* **Frontend:** HTML5, CSS3, JavaScript (ES6+), Leaflet.js CartoDB tiles.
* **Deployment:** WSGI standard configured via `Procfile` and `requirements.txt`.