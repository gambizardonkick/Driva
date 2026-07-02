const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const path = require('path');
const fs = require('fs');

const app = express();
app.set('trust proxy', true);
const ROMIX = 'https://romix.tv';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': ROMIX + '/',
  'Origin': ROMIX,
};

app.get('/api/leaderboard', async (req, res) => {
  try {
    const periodParam = req.query.period || 'current';
    const platform = req.query.platform || 'shuffle';
    const apiPeriod = periodParam === 'previous' ? 'last' : periodParam;
    const params = new URLSearchParams({ period: apiPeriod, platform });
    const url = `${ROMIX}/api/r/leaderboard?${params}`;
    const r = await fetch(url, { headers: HEADERS });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/vip-rewards', async (req, res) => {
  try {
    const r = await fetch(`${ROMIX}/api/r/vip-rewards/`, { headers: HEADERS });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── Dynamic OG embed image ──
   Rendered from live leaderboard data (pool, ends-in, period, top 3),
   cached for 10 minutes. Falls back to the static PNG on any failure. */
const sharp = require('sharp');
let ogCache = { buf: null, t: 0 };
const OG_TTL = 10 * 60 * 1000;

const xmlEsc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const truncName = (s, max) => {
  s = String(s || '—');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
};

async function buildOgImage() {
  const r = await fetch(`${ROMIX}/api/r/leaderboard?period=current&platform=shuffle`, { headers: HEADERS });
  const json = await r.json();
  const data = json.data;
  const lb = data.all_leaderboards.shuffle;
  const top3 = lb.top_three || [];
  const prizes = lb.prizes || [];
  const period = lb.current_period || {};
  const sym = lb.currency_symbol || '$';
  const pool = (data.platforms || []).find(p => p.slug === 'shuffle')?.active_leaderboard?.total_prize_pool || 0;

  let endsIn = '';
  if (period.endTimestamp) {
    const diff = period.endTimestamp - Date.now();
    if (diff > 0) {
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      endsIn = d > 0 ? `${d}D ${h}H` : `${h}H ${m}M`;
    }
  }
  const periodStr = period.start ? `${period.start} — ${period.end}` : '';

  const medals = [
    { c1: '#fde047', c2: '#d97706', txt: '#201200', stroke: 'rgba(251,191,36,0.65)' },
    { c1: '#f1f5f9', c2: '#94a3b8', txt: '#0f172a', stroke: 'rgba(203,213,225,0.35)' },
    { c1: '#e8935e', c2: '#b45309', txt: '#ffffff', stroke: 'rgba(217,122,69,0.45)' },
  ];

  const cards = [0, 1, 2].map(i => {
    const u = top3[i];
    const m = medals[i];
    const y = 84 + i * 170;
    const name = xmlEsc(truncName(u?.displayName, 14));
    const wager = u ? sym + money(u.wagered) : '—';
    const prize = prizes[i] ? sym + money(prizes[i].amount) : '—';
    return `
    <rect x="620" y="${y}" width="510" height="150" rx="24" fill="rgba(255,255,255,0.045)" stroke="${m.stroke}" stroke-width="2"/>
    <circle cx="682" cy="${y + 75}" r="31" fill="url(#medal${i})"/>
    <text x="682" y="${y + 87}" text-anchor="middle" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif" font-weight="900" font-size="32" fill="${m.txt}">${i + 1}</text>
    <text x="736" y="${y + 66}" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif" font-weight="800" font-size="29" fill="#ffffff">${name}</text>
    <text x="736" y="${y + 110}" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif" font-weight="600" font-size="19" fill="#8b91a5">WAGERED <tspan fill="#c9cdd8" font-weight="700">${wager}</tspan></text>
    <text x="1100" y="${y + 87}" text-anchor="end" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif" font-weight="900" font-size="30" fill="#34d399">${prize}</text>`;
  }).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a78bfa"/><stop offset="0.55" stop-color="#8b5cf6"/><stop offset="1" stop-color="#ec4899"/>
    </linearGradient>
    <linearGradient id="poolfill" x1="0" y1="0" x2="1" y2="0.4">
      <stop offset="0" stop-color="#fbbf24"/><stop offset="0.45" stop-color="#f9a8d4"/><stop offset="1" stop-color="#a78bfa"/>
    </linearGradient>
    <linearGradient id="codefill" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#c4b5fd"/><stop offset="1" stop-color="#f472b6"/>
    </linearGradient>
    <linearGradient id="medal0" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fde047"/><stop offset="1" stop-color="#d97706"/></linearGradient>
    <linearGradient id="medal1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1f5f9"/><stop offset="1" stop-color="#94a3b8"/></linearGradient>
    <linearGradient id="medal2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8935e"/><stop offset="1" stop-color="#b45309"/></linearGradient>
    <pattern id="grid" width="46" height="46" patternUnits="userSpaceOnUse">
      <path d="M 46 0 L 0 0 0 46" fill="none" stroke="rgba(167,139,250,0.07)" stroke-width="1"/>
    </pattern>
    <radialGradient id="gridfade" cx="0.35" cy="0.35" r="0.8">
      <stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <mask id="gridmask"><rect width="1200" height="630" fill="url(#gridfade)"/></mask>
    <filter id="blur90" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="90"/></filter>
  </defs>

  <rect width="1200" height="630" fill="#04040a"/>
  <circle cx="150" cy="90" r="250" fill="#7c3aed" opacity="0.45" filter="url(#blur90)"/>
  <circle cx="1080" cy="560" r="230" fill="#db2777" opacity="0.3" filter="url(#blur90)"/>
  <circle cx="700" cy="40" r="200" fill="#9333ea" opacity="0.28" filter="url(#blur90)"/>
  <rect width="1200" height="630" fill="url(#grid)" mask="url(#gridmask)"/>
  <rect x="14" y="14" width="1172" height="602" rx="34" fill="none" stroke="url(#edge)" stroke-width="3" opacity="0.75"/>

  <!-- logo composited at (70,56) 120px -->
  <text x="212" y="112" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif" font-weight="900" font-size="52" fill="#ffffff" letter-spacing="2">DRIVA<tspan fill="url(#codefill)">.TV</tspan></text>
  <text x="214" y="152" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif" font-weight="600" font-size="18" fill="#a78bfa" letter-spacing="6">SHUFFLE LEADERBOARD</text>

  <text x="72" y="266" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="20" fill="#8b91a5" letter-spacing="8">PRIZE POOL</text>
  <text x="66" y="352" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif" font-weight="900" font-size="76" fill="url(#poolfill)" letter-spacing="1">${sym}${money(pool)}</text>

  ${endsIn ? `
  <rect x="70" y="392" width="256" height="52" rx="26" fill="rgba(139,92,246,0.10)" stroke="rgba(139,92,246,0.45)" stroke-width="2"/>
  <circle cx="102" cy="418" r="6" fill="#34d399"/>
  <text x="122" y="426" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="21" fill="#d6d9e3" letter-spacing="2">ENDS IN ${xmlEsc(endsIn)}</text>` : ''}
  ${periodStr ? `
  <text x="72" y="486" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif" font-weight="600" font-size="19" fill="#8b91a5" letter-spacing="2">${xmlEsc(periodStr)}</text>` : ''}

  <rect x="70" y="524" width="320" height="62" rx="31" fill="rgba(139,92,246,0.10)" stroke="url(#edge)" stroke-width="2.5"/>
  <text x="230" y="564" text-anchor="middle" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="24" fill="#cfd3e0" letter-spacing="2">USE CODE <tspan font-weight="900" fill="url(#codefill)">DRIVA</tspan></text>

  <text x="620" y="66" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="17" fill="#8b91a5" letter-spacing="6">TOP WAGERERS</text>
  ${cards}
</svg>`;

  const base = await sharp(Buffer.from(svg), { density: 96 }).resize(1200, 630).png().toBuffer();
  const logo = await sharp(path.join(__dirname, 'public', 'logo.png')).resize(120, 120).png().toBuffer();
  return sharp(base).composite([{ input: logo, left: 70, top: 52 }]).png().toBuffer();
}

app.get('/og-preview.png', async (req, res) => {
  try {
    if (!ogCache.buf || Date.now() - ogCache.t > OG_TTL) {
      ogCache = { buf: await buildOgImage(), t: Date.now() };
    }
    res.set('Cache-Control', 'public, max-age=600').type('png').send(ogCache.buf);
  } catch (e) {
    console.error('og-preview generation failed:', e.message);
    res.sendFile(path.join(__dirname, 'public', 'og-preview.png'));
  }
});

// Serve index.html with og:image / og:url rewritten to the actual request
// origin, so link previews (Discord, Twitter, etc.) resolve the image no
// matter which domain the site is reached on.
function serveIndex(req, res) {
  const origin = `${req.protocol}://${req.get('host')}`;
  fs.readFile(path.join(__dirname, 'public', 'index.html'), 'utf8', (err, html) => {
    if (err) return res.status(500).send('Internal server error');
    res.type('html').send(html.replace(/https:\/\/driva\.tv/g, origin));
  });
}

app.get('/', serveIndex);
app.use(express.static('public', { index: false }));
app.use(serveIndex);

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Driva.tv running on :${PORT}`));
