# WaveLens

![Propagation Map Demo](https://cdn.hackclub.com/01a0c59b-1f4f-7fe7-9ff3-883c11278eb8/Screenshot%202026-09-22%20at%206.14.23%E2%80%AFAM.png)

WaveLens is a small real-time amateur radio propagation visualiser. It takes spots from the public PSK Reporter MQTT feed and puts them on a world map so you can see where radio signals are being received.

It uses Maidenhead grid locators from the incoming data to work out the approximate location of each station, then draws the paths between them on a Leaflet map.

## How it works

The backend is written in Python using Flask. A separate MQTT thread listens for new PSK Reporter spots and stores the latest ones in a thread-safe `deque`.

The frontend is just HTML, CSS and JavaScript with Leaflet handling the map.

I wanted to keep the project fairly lightweight instead of using a large frontend framework, since most of what WaveLens needs is displaying data and updating the map.

A couple of things that took some work:

* Converting Maidenhead grid squares into latitude and longitude.
* Dealing with incomplete or malformed MQTT data without bringing down the server.
* Keeping the number of stored spots limited so the application doesn't keep using more memory as new spots arrive.
* Updating the map regularly without having to reload the page.
* Making the interface simple enough that the map and radio activity are still the main focus.

The deque currently stores up to 150 spots at a time.

## Running it

You'll need Python 3 and the two Python packages used by the project.

Clone the repository:

```bash
git clone https://github.com/VihaanVinoth/wavelens.git
cd wavelens
```

Install the dependencies:

```bash
pip install flask paho-mqtt
```

Then start the server:

```bash
python3 app.py
```

WaveLens will be available at:

```text
http://localhost:5001
```

### Keeping it running

If you're running it on a VPS and want to leave it running after closing the terminal, you can use:

```bash
nohup python3 app.py > output.log 2>&1 &
```

To stop it:

```bash
pkill -f app.py
```

## Tech stack

* Python
* Flask
* Paho MQTT
* HTML
* CSS
* JavaScript
* Leaflet.js
* PSK Reporter

## AI disclosure

I used AI during development to help with parts of the initial structure and some CSS. The project was then edited and put together by me.
