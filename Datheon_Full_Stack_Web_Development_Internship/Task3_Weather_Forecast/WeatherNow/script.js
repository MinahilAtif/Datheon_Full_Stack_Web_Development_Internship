// WeatherNow - search a city, get current weather + 5 day forecast.
// Works with Open-Meteo (default, no key) or OpenWeatherMap (key in config.js).

const OPEN_METEO_GEO = "https://geocoding-api.open-meteo.com/v1/search";
const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";
const OWM_BASE = "https://api.openweathermap.org/data/2.5";

const DEFAULT_CITY = "Lahore";
const TIMEOUT_MS = 10000;
const MAX_RECENT = 5;

const STORE = {
  unit: "weathernow_unit",
  lastCity: "weathernow_last_city",
  recent: "weathernow_recent",
};

// config.js defines OWM_API_KEY. typeof keeps this from crashing if the file is missing.
const useOwm = typeof OWM_API_KEY === "string" && OWM_API_KEY.trim() !== "";

const $ = (id) => document.getElementById(id);
const form = $("searchForm");
const cityInput = $("cityInput");
const searchBtn = $("searchBtn");
const recentBox = $("recent");
const errorBox = $("errorBox");
const loader = $("loader");
const weatherBox = $("weather");

let unit = readStore(STORE.unit) === "f" ? "f" : "c";
let current = null;     // the last weather result we got, so unit switching doesn't refetch
let requestCount = 0;   // used to ignore old responses if the user searches again quickly


/* ---------- small helpers ---------- */

function readStore(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function writeStore(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* private mode etc, not a big deal */ }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

class WeatherError extends Error {
  constructor(type, message) {
    super(message || type);
    this.type = type;
  }
}

// fetch + timeout + turn bad responses into WeatherErrors we can show nicely
async function getJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    throw new WeatherError(err.name === "AbortError" ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (res.status === 401) throw new WeatherError("auth");
    if (res.status === 404) throw new WeatherError("notfound");
    if (res.status === 429) throw new WeatherError("ratelimit");
    throw new WeatherError("server");
  }

  try {
    return await res.json();
  } catch (err) {
    throw new WeatherError("server");
  }
}


/* ---------- weather code -> {kind, label} ---------- */

// Open-Meteo uses WMO weather codes
const WMO = {
  0: ["clear", "Clear sky"],
  1: ["clear", "Mainly clear"],
  2: ["partly", "Partly cloudy"],
  3: ["cloudy", "Overcast"],
  45: ["fog", "Fog"],
  48: ["fog", "Freezing fog"],
  51: ["drizzle", "Light drizzle"],
  53: ["drizzle", "Drizzle"],
  55: ["drizzle", "Heavy drizzle"],
  56: ["drizzle", "Freezing drizzle"],
  57: ["drizzle", "Freezing drizzle"],
  61: ["rain", "Light rain"],
  63: ["rain", "Rain"],
  65: ["rain", "Heavy rain"],
  66: ["rain", "Freezing rain"],
  67: ["rain", "Freezing rain"],
  71: ["snow", "Light snow"],
  73: ["snow", "Snow"],
  75: ["snow", "Heavy snow"],
  77: ["snow", "Snow grains"],
  80: ["rain", "Light showers"],
  81: ["rain", "Showers"],
  82: ["rain", "Violent showers"],
  85: ["snow", "Snow showers"],
  86: ["snow", "Heavy snow showers"],
  95: ["thunder", "Thunderstorm"],
  96: ["thunder", "Thunderstorm with hail"],
  99: ["thunder", "Thunderstorm with hail"],
};

function fromWmo(code) {
  const hit = WMO[code] || ["cloudy", "Cloudy"];
  return { kind: hit[0], label: hit[1] };
}

// OpenWeatherMap uses its own condition ids (2xx thunder, 5xx rain, etc)
function fromOwmId(id, description) {
  let kind = "cloudy";
  if (id >= 200 && id < 300) kind = "thunder";
  else if (id >= 300 && id < 400) kind = "drizzle";
  else if (id >= 500 && id < 600) kind = "rain";
  else if (id >= 600 && id < 700) kind = "snow";
  else if (id >= 700 && id < 800) kind = "fog";
  else if (id === 800) kind = "clear";
  else if (id === 801 || id === 802) kind = "partly";
  return { kind, label: capitalize(description || kind) };
}


/* ---------- provider 1: Open-Meteo ---------- */

async function fetchFromOpenMeteo(query) {
  // "Lahore, Pakistan" -> search "Lahore" and use "Pakistan" to pick the right match
  const parts = query.split(",").map((p) => p.trim()).filter(Boolean);
  const name = parts[0];
  const hint = (parts[1] || "").toLowerCase();

  const geoUrl = `${OPEN_METEO_GEO}?name=${encodeURIComponent(name)}&count=10&language=en&format=json`;
  const geo = await getJSON(geoUrl);

  if (!geo.results || geo.results.length === 0) {
    throw new WeatherError("notfound");
  }

  let place = geo.results[0];
  if (hint) {
    const better = geo.results.find((r) =>
      (r.country || "").toLowerCase().includes(hint) ||
      (r.admin1 || "").toLowerCase().includes(hint) ||
      (r.country_code || "").toLowerCase() === hint
    );
    if (better) place = better;
  }

  const params = new URLSearchParams({
    latitude: place.latitude,
    longitude: place.longitude,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    wind_speed_unit: "kmh",
    timezone: "auto",
    forecast_days: 5,
  });
  const data = await getJSON(`${OPEN_METEO_FORECAST}?${params}`);

  const now = data.current;
  const cond = fromWmo(now.weather_code);

  const daily = data.daily.time.map((date, i) => ({
    date,
    ...fromWmo(data.daily.weather_code[i]),
    maxC: data.daily.temperature_2m_max[i],
    minC: data.daily.temperature_2m_min[i],
  }));

  return {
    city: place.name,
    region: [place.admin1, place.country].filter(Boolean).join(", "),
    utcOffset: data.utc_offset_seconds || 0,
    tempC: now.temperature_2m,
    feelsC: now.apparent_temperature,
    humidity: now.relative_humidity_2m,
    windKmh: now.wind_speed_10m,
    windDeg: now.wind_direction_10m,
    pressure: now.surface_pressure,
    isDay: now.is_day === 1,
    kind: cond.kind,
    label: cond.label,
    daily,
    source: "Open-Meteo",
  };
}


/* ---------- provider 2: OpenWeatherMap ---------- */

async function fetchFromOpenWeatherMap(query) {
  const key = encodeURIComponent(OWM_API_KEY.trim());

  const now = await getJSON(`${OWM_BASE}/weather?q=${encodeURIComponent(query)}&units=metric&appid=${key}`);
  const fc = await getJSON(`${OWM_BASE}/forecast?lat=${now.coord.lat}&lon=${now.coord.lon}&units=metric&appid=${key}`);

  const offset = now.timezone || 0;
  const w = now.weather[0];
  const cond = fromOwmId(w.id, w.description);

  // the forecast endpoint gives a reading every 3 hours, so group them by local day
  const days = {};
  fc.list.forEach((item) => {
    const local = new Date((item.dt + offset) * 1000);
    const dayKey = local.toISOString().slice(0, 10);
    const hour = local.getUTCHours();

    if (!days[dayKey]) {
      days[dayKey] = { date: dayKey, maxC: -Infinity, minC: Infinity, best: null, bestGap: 99 };
    }
    const d = days[dayKey];
    d.maxC = Math.max(d.maxC, item.main.temp_max);
    d.minC = Math.min(d.minC, item.main.temp_min);

    // use the reading closest to midday to describe the day
    const gap = Math.abs(hour - 12);
    if (gap < d.bestGap) {
      d.bestGap = gap;
      d.best = item.weather[0];
    }
  });

  const daily = Object.keys(days).sort().slice(0, 5).map((k) => {
    const d = days[k];
    const c = fromOwmId(d.best.id, d.best.description);
    return { date: k, kind: c.kind, label: c.label, maxC: d.maxC, minC: d.minC };
  });

  let country = now.sys && now.sys.country ? now.sys.country : "";
  try {
    if (country) country = new Intl.DisplayNames(["en"], { type: "region" }).of(country);
  } catch (e) { /* keep the country code */ }

  return {
    city: now.name,
    region: country,
    utcOffset: offset,
    tempC: now.main.temp,
    feelsC: now.main.feels_like,
    humidity: now.main.humidity,
    windKmh: now.wind.speed * 3.6,   // m/s -> km/h
    windDeg: now.wind.deg,
    pressure: now.main.pressure,
    isDay: w.icon.endsWith("d"),
    kind: cond.kind,
    label: cond.label,
    daily,
    source: "OpenWeatherMap",
  };
}

function fetchWeather(query) {
  return useOwm ? fetchFromOpenWeatherMap(query) : fetchFromOpenMeteo(query);
}


/* ---------- icons (inline SVG so they work offline and scale cleanly) ---------- */

function sunSvg(cx, cy, s) {
  let rays = "";
  for (let i = 0; i < 8; i++) {
    rays += `<line x1="0" y1="-15" x2="0" y2="-20" transform="rotate(${i * 45})"/>`;
  }
  return `<g transform="translate(${cx} ${cy}) scale(${s})">
    <circle r="10" fill="#ffd54a"/>
    <g stroke="#ffd54a" stroke-width="3" stroke-linecap="round">${rays}</g>
  </g>`;
}

function moonSvg(cx, cy, s) {
  return `<g transform="translate(${cx} ${cy}) scale(${s})">
    <path d="M6 -16 A16 16 0 1 0 16 6 A12 12 0 0 1 6 -16 Z" fill="#f3efc8"/>
  </g>`;
}

function cloudSvg(x, y, s, fill) {
  return `<path transform="translate(${x} ${y}) scale(${s})" fill="${fill || "#f4f7fa"}"
    d="M16 38 H42 A9 9 0 0 0 43.5 20.2 A13 13 0 0 0 18.3 17.6 A10.2 10.2 0 0 0 16 38 Z"/>`;
}

function iconSvg(kind, isDay) {
  const body = isDay ? sunSvg : moonSvg;
  let inner = "";

  switch (kind) {
    case "clear":
      inner = body(32, 32, 1.15);
      break;
    case "partly":
      inner = body(22, 22, 0.85) + cloudSvg(10, 16, 1);
      break;
    case "cloudy":
      inner = cloudSvg(-4, 0, 0.9, "#b8c3cf") + cloudSvg(8, 10, 1);
      break;
    case "fog":
      inner = cloudSvg(8, 2, 1) +
        `<g stroke="#e3e9ee" stroke-width="3" stroke-linecap="round">
          <line x1="14" y1="46" x2="50" y2="46"/><line x1="20" y1="53" x2="56" y2="53"/>
        </g>`;
      break;
    case "drizzle":
    case "rain": {
      const drops = kind === "rain" ? [22, 32, 42] : [24, 40];
      inner = cloudSvg(8, 2, 1, "#dfe6ec") +
        `<g stroke="#6cb4ff" stroke-width="3" stroke-linecap="round">` +
        drops.map((x) => `<line x1="${x + 3}" y1="46" x2="${x - 1}" y2="55"/>`).join("") +
        `</g>`;
      break;
    }
    case "snow":
      inner = cloudSvg(8, 2, 1, "#e6ecf1") +
        [22, 32, 42].map((x, i) => `<circle cx="${x}" cy="${49 + (i % 2) * 5}" r="2.6" fill="#ffffff"/>`).join("");
      break;
    case "thunder":
      inner = cloudSvg(8, 0, 1, "#aeb8c4") +
        `<polygon points="34,36 26,50 32,50 29,60 41,44 34,44 38,36" fill="#ffd54a"/>`;
      break;
    default:
      inner = cloudSvg(8, 10, 1);
  }

  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
}


/* ---------- page background ---------- */

function skyFor(data) {
  if (data.kind === "thunder") return "storm";
  if (data.kind === "rain" || data.kind === "drizzle") return "rain";
  if (data.kind === "snow") return "snow";
  if (data.kind === "fog") return "fog";
  if (data.kind === "cloudy") return data.isDay ? "cloudy-day" : "cloudy-night";
  // clear or partly cloudy
  return data.isDay ? "clear-day" : "clear-night";
}


/* ---------- formatting + rendering ---------- */

function temp(c) {
  const value = unit === "f" ? c * 9 / 5 + 32 : c;
  return Math.round(value) + "°";
}

function windText(kmh) {
  return unit === "f" ? Math.round(kmh * 0.621371) + " mph" : Math.round(kmh) + " km/h";
}

function localTimeText(offsetSeconds) {
  // shift "now" by the city's UTC offset, then print it as if it were UTC
  const shifted = new Date(Date.now() + offsetSeconds * 1000);
  return shifted.toLocaleString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  }) + " local time";
}

function shortDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function dayName(dateStr, index) {
  if (index === 0) return "Today";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" });
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

function cardinal(deg) {
  return COMPASS[Math.round(deg / 22.5) % 16];
}

// a short human sentence under the temperature, built from the numbers we have
function summaryText(d) {
  let feel = "Hot";
  if (d.tempC < 0) feel = "Freezing";
  else if (d.tempC < 10) feel = "Cold";
  else if (d.tempC < 18) feel = "Cool";
  else if (d.tempC < 26) feel = "Pleasant";
  else if (d.tempC < 32) feel = "Warm";

  let wind = "strong winds";
  if (d.windKmh < 6) wind = "almost no wind";
  else if (d.windKmh < 20) wind = "a light breeze";
  else if (d.windKmh < 40) wind = "a steady breeze";

  let tip = "";
  if (d.kind === "rain" || d.kind === "drizzle") tip = "Take an umbrella if you're heading out.";
  else if (d.kind === "thunder") tip = "Thunderstorms around, better to stay indoors.";
  else if (d.kind === "snow") tip = "Dress warm and watch for slippery ground.";
  else if (d.kind === "fog") tip = "Visibility is low, take it slow on the road.";
  else if (d.humidity >= 80) tip = "The air feels quite humid.";
  else if (d.kind === "clear" && !d.isDay) tip = "A good night for looking at the stars.";
  else if (d.kind === "clear" && d.tempC >= 30) tip = "Stay hydrated and keep to the shade.";

  return `${feel} with ${wind}. ${tip}`.trim();
}


/* ---------- animated sky behind the page ---------- */

let sceneKey = "";

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function buildScene(d) {
  const key = d.kind + (d.isDay ? "-day" : "-night");
  if (key === sceneKey) return;   // same weather as before, leave the animation alone
  sceneKey = key;

  const scene = $("scene");
  scene.innerHTML = "";

  function add(cls, vars) {
    const el = document.createElement("div");
    el.className = cls;
    Object.keys(vars || {}).forEach((name) => el.style.setProperty(name, vars[name]));
    scene.appendChild(el);
  }

  const phone = window.innerWidth < 700;
  const clearish = d.kind === "clear" || d.kind === "partly";

  if (clearish && d.isDay) add("sun");

  if (clearish && !d.isDay) {
    add("moon");
    for (let i = 0; i < (phone ? 45 : 85); i++) {
      add("star", {
        left: rand(0, 100) + "%",
        top: rand(0, 70) + "%",
        "--s": rand(1, 2.8).toFixed(1) + "px",
        "--t": rand(1.5, 4).toFixed(1) + "s",
        "--d": (-rand(0, 4)).toFixed(1) + "s",
      });
    }
  }

  const clouds = { partly: 3, cloudy: 7, fog: 3, drizzle: 5, rain: 6, snow: 5, thunder: 7 }[d.kind] || 0;
  for (let i = 0; i < clouds; i++) {
    const duration = rand(70, 140);
    add("cloud", {
      "--w": rand(170, 340).toFixed(0) + "px",
      "--y": rand(1, 48).toFixed(0) + "%",
      "--o": rand(0.55, 1).toFixed(2),
      "--t": duration.toFixed(0) + "s",
      "--d": (-rand(0, duration)).toFixed(0) + "s",
    });
  }

  const drops = { drizzle: 35, rain: 85, thunder: 110 }[d.kind] || 0;
  for (let i = 0; i < (phone ? drops / 2 : drops); i++) {
    add("drop", {
      "--x": rand(0, 125).toFixed(1) + "%",
      "--h": rand(16, 32).toFixed(0) + "px",
      "--t": rand(0.55, 1).toFixed(2) + "s",
      "--d": (-rand(0, 1)).toFixed(2) + "s",
    });
  }

  if (d.kind === "snow") {
    for (let i = 0; i < (phone ? 35 : 70); i++) {
      add("flake", {
        "--x": rand(0, 100).toFixed(1) + "%",
        "--s": rand(3, 7).toFixed(1) + "px",
        "--o": rand(0.5, 0.95).toFixed(2),
        "--dx": rand(-40, 40).toFixed(0) + "px",
        "--t": rand(7, 14).toFixed(1) + "s",
        "--d": (-rand(0, 14)).toFixed(1) + "s",
      });
    }
  }

  if (d.kind === "thunder") add("flash");

  if (d.kind === "fog") {
    [18, 42, 66].forEach((y, i) => add("fogband", { "--y": y + "%", "--t": 14 + i * 5 + "s" }));
  }
}


/* ---------- drawing the results ---------- */

function renderWeather() {
  if (!current) return;
  const d = current;
  const today = d.daily[0];

  $("cityName").textContent = d.city;
  $("regionName").textContent = d.region;
  $("localTime").textContent = localTimeText(d.utcOffset);
  $("temp").textContent = temp(d.tempC);
  $("condition").textContent = d.label;
  $("summary").textContent = summaryText(d);
  $("mainIcon").innerHTML = iconSvg(d.kind, d.isDay);

  // today's low / high, and where the current temperature sits between them
  $("lowToday").textContent = temp(today.minC);
  $("highToday").textContent = temp(today.maxC);
  const spread = today.maxC - today.minC;
  const where = spread > 0 ? (d.tempC - today.minC) / spread : 0.5;
  $("rangeDot").style.left = Math.min(1, Math.max(0, where)) * 100 + "%";

  // feels like
  $("feels").textContent = temp(d.feelsC);
  const diff = d.feelsC - d.tempC;
  $("feelsNote").textContent = diff >= 2 ? "Warmer than the actual temperature"
    : diff <= -2 ? "Colder than the actual temperature"
    : "Close to the actual temperature";

  // humidity
  $("humidity").textContent = Math.round(d.humidity) + "%";
  $("humidityBar").style.width = Math.min(100, Math.max(0, d.humidity)) + "%";
  $("humidityNote").textContent = d.humidity < 30 ? "Dry air" : d.humidity > 70 ? "Humid" : "Comfortable";

  // wind (the arrow points the way the wind is blowing, so add 180 to the "from" direction)
  $("wind").textContent = windText(d.windKmh);
  const hasDir = typeof d.windDeg === "number";
  $("windRow").hidden = !hasDir;
  if (hasDir) {
    $("compassArrow").style.transform = `rotate(${d.windDeg + 180}deg)`;
    $("windDir").textContent = `Blowing from the ${cardinal(d.windDeg)}`;
  }

  // pressure: map roughly 970 - 1050 hPa onto the bar
  $("pressure").textContent = Math.round(d.pressure) + " hPa";
  const pos = Math.min(1, Math.max(0, (d.pressure - 970) / 80));
  $("pressureDot").style.left = pos * 100 + "%";
  $("pressureNote").textContent = d.pressure < 1009 ? "Lower than usual" : d.pressure > 1022 ? "Higher than usual" : "Normal";

  // forecast cards - the little bars are scaled against the whole week
  const weekMin = Math.min(...d.daily.map((x) => x.minC));
  const weekMax = Math.max(...d.daily.map((x) => x.maxC));
  const weekSpan = weekMax - weekMin || 1;

  $("forecastList").innerHTML = d.daily.map((day, i) => {
    const bottom = ((day.minC - weekMin) / weekSpan) * 100;
    const height = ((day.maxC - day.minC) / weekSpan) * 100;
    return `
    <article class="day${i === 0 ? " today" : ""}" style="--i:${i}">
      <span class="day-name">${dayName(day.date, i)}</span>
      <span class="day-date">${shortDate(day.date)}</span>
      <div class="day-icon">${iconSvg(day.kind, true)}</div>
      <span class="day-label">${escapeHtml(day.label)}</span>
      <div class="day-range">
        <strong>${temp(day.maxC)}</strong>
        <div class="range-v"><span style="bottom:${bottom.toFixed(1)}%;height:${height.toFixed(1)}%"></span></div>
        <em>${temp(day.minC)}</em>
      </div>
    </article>`;
  }).join("");

  $("sourceNote").textContent = "Weather data from " + d.source;
  document.body.dataset.sky = skyFor(d);
  document.title = `${d.city} ${temp(d.tempC)} - WeatherNow`;
  buildScene(d);

  weatherBox.hidden = false;
  weatherBox.classList.remove("enter");
  void weatherBox.offsetWidth;          // restart the fade-in animation
  weatherBox.classList.add("enter");
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

function setLoading(isLoading) {
  loader.hidden = !isLoading;
  searchBtn.disabled = isLoading;
  searchBtn.textContent = isLoading ? "Searching..." : "Search";
  weatherBox.classList.toggle("dimmed", isLoading);
}

function errorMessage(err, query) {
  switch (err.type) {
    case "notfound":
      return `We couldn't find a city called "${query}". Check the spelling or try adding the country, like "Springfield, US".`;
    case "auth":
      return "The OpenWeatherMap API key was rejected. Check config.js (new keys can take a couple of hours to start working).";
    case "ratelimit":
      return "Too many requests right now. Wait a minute and try again.";
    case "timeout":
      return "The weather service is taking too long to respond. Try again in a moment.";
    case "network":
      return "Couldn't reach the weather service. Check your internet connection and try again.";
    default:
      return "Something went wrong on the weather service's side. Please try again shortly.";
  }
}


/* ---------- recent searches ---------- */

function getRecent() {
  try {
    const list = JSON.parse(readStore(STORE.recent) || "[]");
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function addRecent(city) {
  const list = getRecent().filter((c) => c.toLowerCase() !== city.toLowerCase());
  list.unshift(city);
  writeStore(STORE.recent, JSON.stringify(list.slice(0, MAX_RECENT)));
  renderRecent();
}

function renderRecent() {
  const list = getRecent();
  recentBox.innerHTML = list.length
    ? `<span>Recent:</span>` + list.map((c) => `<button type="button" class="chip">${escapeHtml(c)}</button>`).join("")
    : "";
}


/* ---------- main flow ---------- */

async function search(query) {
  const myRequest = ++requestCount;
  clearError();
  setLoading(true);

  try {
    const result = await fetchWeather(query);
    if (myRequest !== requestCount) return;   // a newer search already started

    current = result;
    renderWeather();
    writeStore(STORE.lastCity, result.city);
    addRecent(result.city);
    cityInput.value = "";
  } catch (err) {
    if (myRequest !== requestCount) return;
    if (!(err instanceof WeatherError)) console.error(err);
    showError(errorMessage(err instanceof WeatherError ? err : new WeatherError("server"), query));
  } finally {
    if (myRequest === requestCount) setLoading(false);
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const query = cityInput.value.trim();
  if (!query) {
    showError("Type a city name first.");
    cityInput.focus();
    return;
  }
  search(query);
});

recentBox.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (chip) search(chip.textContent);
});

document.querySelector(".unit-toggle").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-unit]");
  if (!btn) return;
  unit = btn.dataset.unit;
  writeStore(STORE.unit, unit);
  syncUnitButtons();
  renderWeather();
});

function syncUnitButtons() {
  document.querySelectorAll(".unit-toggle button").forEach((b) => {
    b.classList.toggle("active", b.dataset.unit === unit);
  });
}

// start up
syncUnitButtons();
renderRecent();
$("sourceNote").textContent = "Weather data from " + (useOwm ? "OpenWeatherMap" : "Open-Meteo");
search(readStore(STORE.lastCity) || DEFAULT_CITY);
