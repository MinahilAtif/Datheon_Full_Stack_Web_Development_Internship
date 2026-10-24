# WeatherNow - Real-Time Weather Forecast App

Internship Task 3. Search any city in the world and get the current weather
plus a 5-day forecast. Plain HTML, CSS and JavaScript, no frameworks.

## Running it
Open `index.html` in a browser. You need an internet connection because the
weather comes from a live API (and the Outfit font from Google Fonts, which
falls back to a system font if it can't load).

## API choice
The app supports two providers:

1. **Open-Meteo** (default). Free, no signup, no key. Works immediately.
2. **OpenWeatherMap** (as suggested in the task). Create a free key at
   https://home.openweathermap.org/api_keys, paste it into `config.js`
   (`const OWM_API_KEY = "your-key";`) and reload. New keys can take an hour
   or two to activate, so an "invalid key" error right after signing up is
   normal.

Both providers are turned into the same data shape inside `script.js`, so the
rest of the app doesn't care which one is used.

## What it does
- City search (also accepts "Paris, France" style input)
- Current temperature, condition, feels like, humidity, wind speed and
  direction, pressure
- A short written summary ("Warm with a light breeze. Take an umbrella...")
- Today's low/high with a marker showing where the current temperature sits
- Animated sky behind the page that matches the weather: drifting clouds, rain,
  snow, fog, lightning, a glowing sun, or a moon with twinkling stars at night
- The background colours fade between weather types and switch for day/night
  at the searched city
- Dynamic SVG weather icons (day and night versions)
- 5-day forecast cards built with `Array.map()`, each with a high/low bar
  scaled against the whole week
- Loading spinner while fetching
- Friendly errors: empty input, unknown city, no internet, timeout, rate limit,
  bad API key
- Celsius / Fahrenheit switch, remembered between visits
- Recent searches, and the last city is reloaded next time
- Responsive layout (forecast swipes sideways on phones) and reduced-motion
  support

## Files
- `index.html` - structure
- `style.css` - glass-style layout, sky colours and animations
- `script.js` - fetching (async/await + try/catch), data conversion, rendering,
  sky animation
- `config.js` - optional OpenWeatherMap key
