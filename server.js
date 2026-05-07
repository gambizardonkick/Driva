const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const path = require('path');

const app = express();
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

app.use(express.static('public'));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Driva.tv running on :${PORT}`));
