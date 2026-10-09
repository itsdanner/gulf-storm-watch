// TV mode: 3x3 cameras + always-on banner + live NWS radar loops. No interaction needed.
const SITE = { lat: 30.38, lon: -86.34 };
const MAPSERVER = 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer';
const RADARS = [
  { name: 'Local radar · Eglin (KEVX)', url: 'https://radar.weather.gov/ridge/standard/KEVX_loop.gif' },
  { name: 'Mobile / Pensacola (KMOB)', url: 'https://radar.weather.gov/ridge/standard/KMOB_loop.gif' },
  { name: 'Southeast regional', url: 'https://radar.weather.gov/ridge/standard/SOUTHEAST_loop.gif' },
];
const $ = id => document.getElementById(id);

// cameras (first nine)
CAMERAS.forEach(c => {
  const d = document.createElement('div');
  d.className = 'tile';
  d.innerHTML = `<iframe src="${getCamSrc(c)}" allow="autoplay; encrypted-media" title="${c.name}"></iframe><div class="label">${c.name} · ${c.sub}</div>`;
  $('cams').appendChild(d);
});

// radar loops: preload the fresh GIF, then swap so there is no blank flash
RADARS.forEach((r, i) => {
  const d = document.createElement('div');
  d.className = 'radar';
  d.innerHTML = `<img id="rad${i}" alt="${r.name}"><div class="age" id="radAge${i}"></div><div class="label">${r.name}</div>`;
  $('radars').appendChild(d);
});
function refreshRadars() {
  RADARS.forEach((r, i) => {
    const n = new Image();
    n.onload = () => { $('rad' + i).src = n.src; $('radAge' + i).textContent = 'updated ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
    n.src = `${r.url}?t=${Date.now()}`;
  });
}

// banner: storm summary (NHC) + active NWS alerts
const state = { storm: '', alerts: [] };
function drawBanner() {
  const parts = [];
  if (state.storm) parts.push('🌀 ' + state.storm);
  if (state.alerts.length) state.alerts.forEach(a => parts.push('⚠ ' + a.toUpperCase()));
  else parts.push('NO ACTIVE NWS ALERTS FOR THE SITE');
  parts.push('LIVE · AUTO-UPDATING');
  const msg = parts.join('      ●      ');
  const t = $('tick');
  if (t.dataset.msg !== msg) { t.dataset.msg = msg; t.textContent = msg; t.style.animationDuration = Math.max(45, msg.length * 0.3) + 's'; }
}
async function loadStorm() {
  try {
    const meta = await (await fetch(`${MAPSERVER}?f=json`, { cache: 'no-store' })).json();
    const layer = meta.layers.find(l => l.name === 'AT4 Forecast Points');
    const id = layer ? layer.id : 84;
    const d = await (await fetch(`${MAPSERVER}/${id}/query?where=tau%3D0&outFields=*&f=json`, { cache: 'no-store' })).json();
    const p = d.features[0].attributes;
    const mph = Math.round(p.maxwind * 1.15078);
    const cap = `${p.ssnum > 0 ? 'CAT ' + p.ssnum : p.tcdvlp.toUpperCase()} · ${mph} MPH`;
    $('cat').textContent = `${cap} · ADV ${p.advisnum}`;
    state.storm = `HURRICANE ${p.stormname.replace(/^Hurricane /, '').toUpperCase()} · ${cap} · ADVISORY ${p.advisnum}`;
    drawBanner();
  } catch (e) { console.error(e); }
}
async function loadAlerts() {
  try {
    const d = await (await fetch(`https://api.weather.gov/alerts/active?point=${SITE.lat},${SITE.lon}`, { cache: 'no-store' })).json();
    state.alerts = (d.features || []).map(f => f.properties.headline || f.properties.event);
    drawBanner();
  } catch (e) { console.error(e); }
}

function tickClock() {
  $('clock').textContent = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' }) + ' CDT';
}

// keep the screen awake, reload cameras if they stall, pick up new deployments
async function keepAwake() { try { await navigator.wakeLock.request('screen'); } catch {} }
document.addEventListener('visibilitychange', () => { if (!document.hidden) keepAwake(); });
let version = null;
async function checkVersion() {
  try {
    const r = await fetch(location.pathname, { method: 'HEAD', cache: 'no-store' });
    const v = r.headers.get('etag') || r.headers.get('last-modified');
    if (v && version && v !== version) location.reload();
    if (v) version = v;
  } catch {}
}

keepAwake(); tickClock(); setInterval(tickClock, 1000);
loadStorm(); setInterval(loadStorm, 120e3);
loadAlerts(); setInterval(loadAlerts, 60e3);
refreshRadars(); setInterval(refreshRadars, 180e3);
setInterval(() => document.querySelectorAll('.tile iframe').forEach(f => { f.src = f.src; }), 30 * 60e3);
checkVersion(); setInterval(checkVersion, 5 * 60e3);

// Google Cast receiver mode: when the TV itself loads this page as a Custom Web Receiver
// (user agent contains "CrKey"), start the Cast receiver framework so the session stays open.
if (/CrKey/.test(navigator.userAgent)) {
  const sc = document.createElement('script');
  sc.src = 'https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js';
  sc.onload = () => {
    const ctx = cast.framework.CastReceiverContext.getInstance();
    ctx.start({ disableIdleTimeout: true, maxInactivity: 86400 });
  };
  document.head.appendChild(sc);
}
