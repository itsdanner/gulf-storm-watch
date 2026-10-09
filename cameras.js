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
