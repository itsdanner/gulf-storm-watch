// Shared camera list (used by the dashboard and the TV page).
const CAMERAS = [
  { id: 'beach-club',      name: 'Beach Club',            sub: 'Sandestin Resort · Gulf Beach',   type: 'angelcam', code: '8dr53koeyx' },
  { id: 'miramar-pano',    name: 'Miramar Beach',         sub: 'Oceanfront Panorama',              type: 'youtube',  code: 'K1PkxWM6QB4' },
  { id: 'marina',          name: 'Baytowne Marina',       sub: 'Sandestin Resort',                 type: 'angelcam', code: '9kyznnm2y4' },
  { id: 'marina-bar',      name: 'Marina Bar & Grill',    sub: 'Sandestin Resort',                 type: 'angelcam', code: '91yxbb1xro' },
  { id: 'leeward',         name: 'Leeward Key',           sub: 'Miramar Beach Shores',             type: 'youtube',  code: 'CVgBM39TOh8' },
  { id: 'village',         name: 'Baytowne Wharf',        sub: 'Sandestin Village',                type: 'angelcam', code: '91rx29pxlo' },
  { id: 'whales-tail',     name: 'Whales Tail Beach',     sub: 'Seascape, FL (~2 mi W)',           type: 'youtube',  code: 'TyX02EtQcYI' },
  { id: 'pelican',         name: 'Pelican Beach Resort',  sub: 'Destin (~3 mi W)',                 type: 'youtube',  code: 'FOHZhqCwRTo' },
  { id: 'henderson',       name: 'Henderson Park Inn',    sub: 'Destin Beach (~4 mi W)',           type: 'youtube',  code: 'RMBfYql2dxk' },
];

const EXTRA_CAMERAS = [
  { id: 'tennis',          name: 'Tennis Center',         sub: 'Sandestin Resort',                 type: 'angelcam', code: 'j3r771e5rm' },
  { id: 'maravilla',       name: 'Maravilla Overlook',    sub: 'Miramar Beach (stream offline)',   type: 'youtube',  code: 'j2AYwnv0M7k' },
  { id: 'maryann',         name: 'Marina Bar — MaryAnn',  sub: 'Sandestin Mascot Cam',             type: 'angelcam', code: 'm1ervd6gr7' },
  { id: 'destin-marina',   name: 'Destin Harbor Marina',  sub: 'Destin (~4 mi W)',                 type: 'youtube',  code: '_9VkcK5vHgY' },
  { id: 'santa-rosa',      name: 'Santa Rosa Beach',      sub: '~5 mi E',                          type: 'youtube',  code: 'Tcw_v8NiQz8' },
];

function getCamSrc(cam) {
  return cam.type === 'angelcam'
    ? `https://v.angelcam.com/iframe?v=${cam.code}&autoplay=1`
    : `https://www.youtube-nocookie.com/embed/${cam.code}?autoplay=1&mute=1&playsinline=1&controls=0&modestbranding=1&rel=0`;
}

// ─── Camera failover ───
// YouTube cams expose their player state, so a tile whose stream errors out (or never plays for
// DEAD_AFTER ms) is swapped for a standby camera. Angelcam embeds are cross-origin with no API,
// so their health cannot be detected from the page.
const CamManager = (() => {
  const DEAD_AFTER = 30e3, DEAD_TTL = 10 * 60e3, RETRY = 60e3;
  const standby = EXTRA_CAMERAS.slice().sort((a, b) => (a.type === 'youtube' ? -1 : 1) - (b.type === 'youtube' ? -1 : 1));
  const tiles = new Set();
  let ytReady = null;

  function ytApi() {
    if (ytReady) return ytReady;
    ytReady = new Promise(resolve => {
      if (window.YT && YT.Player) return resolve();
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
    return ytReady;
  }

  function stop(t) {
    clearInterval(t.timer); clearTimeout(t.retry);
    try { t.player && t.player.destroy(); } catch {}
    t.player = null;
  }

  function render(t) {
    stop(t);
    const host = t.tile.querySelector('.cam-feed');
    host.innerHTML = '';
    t.tile.dataset.cam = t.cam.id;
    t.lastOk = Date.now();
    if (t.onChange) t.onChange(t.cam, t.cam.id !== t.home.id);
    if (t.cam.type === 'angelcam') {
      const f = document.createElement('iframe');
      f.src = getCamSrc(t.cam); f.title = t.cam.name;
      f.allow = 'autoplay; encrypted-media; picture-in-picture';
      host.appendChild(f);
      return;
    }
    const slot = document.createElement('div');
    host.appendChild(slot);
    ytApi().then(() => {
      if (t.cam.type !== 'youtube' || !host.contains(slot)) return;
      t.player = new YT.Player(slot, {
        host: 'https://www.youtube-nocookie.com', videoId: t.cam.code, width: '100%', height: '100%',
        playerVars: { autoplay: 1, mute: 1, controls: 0, playsinline: 1, rel: 0, modestbranding: 1, disablekb: 1 },
        events: {
          onReady: e => { e.target.mute(); e.target.playVideo(); },
          onStateChange: e => { // 1 playing, 3 buffering, 2 paused (autoplay blocked: not an outage)
            if (e.data === 1 || e.data === 3 || e.data === 2) t.lastOk = Date.now();
            if (e.data === 2) e.target.playVideo();
          },
          onError: () => dead(t),
        },
      });
    });
    t.timer = setInterval(() => { if (Date.now() - t.lastOk > DEAD_AFTER) dead(t); }, 5000);
  }

  function dead(t) {
    stop(t);
    t.cam.deadAt = Date.now();
    const shown = new Set([...tiles].map(x => x.cam.id));
    const i = standby.findIndex(c => !shown.has(c.id) && (!c.deadAt || Date.now() - c.deadAt > DEAD_TTL));
    if (i >= 0) {
      const next = standby.splice(i, 1)[0];
      standby.push(t.cam);
      console.warn(`[cams] ${t.cam.name} offline -> ${next.name}`);
      t.cam = next;
      render(t);
    } else {
      t.retry = setTimeout(() => render(t), RETRY); // nothing to swap in: retry the same camera
    }
  }

  return {
    // tile must contain a .cam-feed element; onChange(cam, isBackup) updates labels
    mount(tile, cam, onChange) {
      const t = { tile, cam, home: cam, onChange, player: null, timer: null, retry: null, lastOk: Date.now() };
      tiles.add(t); render(t); return t;
    },
    // reload only the Angelcam iframes (YouTube players are watched, not reloaded)
    reloadAngelcam() { document.querySelectorAll('.cam-feed iframe[src*="angelcam"]').forEach(f => { f.src = f.src; }); },
  };
})();

// ─── Viewer counts (YouTube cams only) ───
// Needs a free YouTube Data API v3 key. In Google Cloud Console: create a project, enable "YouTube Data API v3",
// create an API key and restrict it to HTTP referrer https://itsdanner.github.io/* . Paste it below.
// Angelcam (Sandestin) feeds publish no viewer count, so those tiles show none.
const YT_API_KEY = '';
if (YT_API_KEY) {
  const fmt = n => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));
  async function updateViewers() {
    const tiles = [...document.querySelectorAll('[data-cam]')];
    const cams = tiles.map(t => [...CAMERAS, ...EXTRA_CAMERAS].find(c => c.id === t.dataset.cam)).filter(c => c && c.type === 'youtube');
    if (!cams.length) return;
    try {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${cams.map(c => c.code).join(',')}&key=${YT_API_KEY}`);
      const d = await r.json();
      const counts = Object.fromEntries((d.items || []).map(i => [i.id, i.liveStreamingDetails && i.liveStreamingDetails.concurrentViewers]));
      tiles.forEach(t => {
        const cam = [...CAMERAS, ...EXTRA_CAMERAS].find(c => c.id === t.dataset.cam);
        let badge = t.querySelector('.cam-viewers');
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'cam-viewers';
          badge.style.cssText = 'position:absolute;top:6px;left:22px;z-index:3;font-size:11px;font-weight:700;color:#fff;background:rgba(0,0,0,.65);padding:2px 7px;border-radius:10px;display:none;pointer-events:none';
          t.appendChild(badge);
        }
        const n = cam && counts[cam.code];
        badge.style.display = n ? 'block' : 'none';
        if (n) badge.textContent = '👁 ' + fmt(+n);
      });
    } catch (e) { console.warn('[viewers]', e); }
  }
  updateViewers(); setInterval(updateViewers, 60e3);
}
