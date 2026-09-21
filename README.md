# WaveLens

WaveLens is a real-time mapping and monitoring tool for amateur radio operators, and implements the PSK Reporter API to visualise global FT8 and WSPR traffic into colourful nodes on an interactive map, allowing you to see how signals are propagating across the various band frequencies live.

## Features
* **Live Telemetry Stream:** Extracts real-time reception reports across multiple HF bands (20m, 40m, 30m, 15m, 10m, 80m).
* **Interactive Propagation Map:** Built with Leaflet.js for the mapping interface, plotting transmitter-to-receiver great-circle paths and station nodes to illustrate the transmission of signals dynamically.
* **Callsign Filtering:** You can instantly filter traffic by narrowing down to specific callsigns, or prefixes.
* **Dynamic S-Meter & Signal Analytics:** The live average SNR bar allows you to visualise signal strength adaptively, providing you with a clear apeture of the mean signal health.
* **Theme Persistence:** WaveLens featrues a seamless toggle between tactical dark mode, and a high-contrast light mode, saved locally via `localStorage`, saving the theme even when refreshing or revisiting the site.

## Tech Stack
* **Backend:** Python for running the API, Flask for running the Web App, Gunicorn for running the server, `requests`, XML ElementTree for parsing the frequency data into semantic information.
* **Frontend:** HTML5 for the foundation of the website, CSS3 for the styling, JavaScript (ES6+) for powering the map with the nodes using Leaflet.js CartoDB tiles.
* **Deployment:** WSGI standard configured via `Procfile` and `requirements.txt`.

## Getting Started with WaveLens
To access this open-source project, you can either create your own local instance of WaveLens, or visit our [website](https://wavelens.vihaanvinoth.com) in real-time. If you want to create your own copy, follow these simple steps:

### Prerequisites
- Ensure that you have a version of Python 3 or greater installled on your machine
- Ensure that you have a code editor like VSCode or Atom.

### Installation
These are the steps to install WaveLens:

1. **Clone the GitHub Repository**:
You can clone the repository by entering:

`
git clone https://github.com/vihaanvinoth/wavelens.git
cd wavelens
`

2. **Setting up a virtual environment (Venv) (Recommended)**:
If you want an easy way to create a self-contained folder containing all of your Python libraries instead of having them all in your system, then you can do this:

`
python3 -m venv venv
source venv/bin/activate
`

3. **Installing dependencies**:
You can simply run this command in order to install the libraries for running the API:

`
pip install -r requirements.txt
`

4. **Running the application**:
Finally, to run the application, you can run this command:

`
python app.py
`

Once you have done that, you can head over to the output that is given in your console, most likely being `127.0.0.1:8000`.

### Alternative Option using Gunicorn
If you would like to use Gunicorn (as WaveLens supports and uses Gunicorn) and you don't want to use Flask's built in development server, you can complete these steps; note that these add on to the previous steps, and replace step 4:

1. **Installing Gunicorn**
To install Gunicorn, run this command:

` 
pip install gunicorn
`

2. **Running Gunicorn**
Once Gunicorn is installed, run this command to get it running:

`gunicorn -w 4 -b 127.0.0.1:5000 app:app`

(Assuming that your main flask file is `app.py`, and that the flask instance is named `app`, since the command could vary for you)
