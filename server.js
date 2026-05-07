const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const TARGET = 'https://romix.tv';

const BLOCKED_HEADERS = [
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'x-content-type-options',
  'strict-transport-security',
  'x-xss-protection',
];

function rewriteUrls(html, base) {
  return html
    .replace(/(href|src|action)=["'](\/[^"']*?)["']/g, (_, attr, path) => `${attr}="/proxy${path}"`)
    .replace(/(href|src|action)=["'](https?:\/\/(?:romix\.tv|www\.romix\.tv)[^"']*?)["']/g, (_, attr, url) => {
      const path = url.replace(/^https?:\/\/(?:www\.)?romix\.tv/, '');
      return `${attr}="/proxy${path || '/'}"`;
    })
    .replace(/url\(["']?(\/[^"')]+)["']?\)/g, (_, path) => `url(/proxy${path})`)
    .replace(/url\(["']?(https?:\/\/(?:romix\.tv|www\.romix\.tv)[^"')]+)["']?\)/g, (_, url) => {
      const path = url.replace(/^https?:\/\/(?:www\.)?romix\.tv/, '');
      return `url(/proxy${path || '/'})`;
    });
}

async function proxyRequest(req, res, targetPath) {
  try {
    const url = `${TARGET}${targetPath}`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': req.headers['accept'] || '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
      'Referer': TARGET,
      'Origin': TARGET,
    };

    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];

    const response = await fetch(url, {
      method: req.method,
      headers,
      redirect: 'follow',
    });

    const contentType = response.headers.get('content-type') || '';

    response.headers.forEach((value, name) => {
      const lower = name.toLowerCase();
      if (BLOCKED_HEADERS.includes(lower)) return;
      if (lower === 'transfer-encoding') return;
      if (lower === 'content-encoding') return;
      res.setHeader(name, value);
    });

    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(response.status);

    if (contentType.includes('text/html')) {
      let body = await response.text();
      body = rewriteUrls(body);
      body = body.replace('</head>', `
        <base href="${TARGET}/">
        <style>
          body { margin: 0 !important; }
          iframe, frame { border: none !important; }
        </style>
        <script>
          (function() {
            var origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url) {
              if (url && url.startsWith('/') && !url.startsWith('/proxy')) {
                url = '/proxy' + url;
              }
              return origOpen.apply(this, arguments);
            };
          })();
        </script>
      </head>`);
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.send(body);
    } else if (contentType.includes('text/css') || contentType.includes('javascript')) {
      let body = await response.text();
      body = rewriteUrls(body);
      res.send(body);
    } else {
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    }
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(502).send('Proxy error: ' + err.message);
  }
}

app.use('/proxy', async (req, res) => {
  const targetPath = req.url || '/';
  await proxyRequest(req, res, targetPath);
});

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Driva TV</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0a; color: #fff; font-family: 'Segoe UI', sans-serif; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
    nav { display: flex; align-items: center; justify-content: space-between; padding: 0 24px; height: 54px; background: #111; border-bottom: 1px solid #222; flex-shrink: 0; z-index: 10; }
    .nav-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
    .logo-icon { width: 32px; height: 32px; background: linear-gradient(135deg, #e63946, #c1121f); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
    .logo-icon svg { width: 18px; height: 18px; fill: #fff; }
    .logo-text { font-size: 20px; font-weight: 700; color: #fff; }
    .logo-text span { color: #e63946; }
    .nav-links { display: flex; gap: 28px; list-style: none; }
    .nav-links a { color: #bbb; text-decoration: none; font-size: 14px; font-weight: 500; transition: color 0.2s; }
    .nav-links a:hover { color: #fff; }
    .nav-right { display: flex; align-items: center; gap: 12px; }
    .btn { background: #e63946; color: #fff; border: none; padding: 8px 18px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; transition: background 0.2s; }
    .btn:hover { background: #c1121f; }
    .frame-wrapper { flex: 1; position: relative; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: none; display: block; }
    .loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 16px; background: #0a0a0a; z-index: 5; }
    .spinner { width: 44px; height: 44px; border: 3px solid #222; border-top-color: #e63946; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading p { color: #666; font-size: 14px; }
    footer { background: #111; border-top: 1px solid #222; text-align: center; padding: 10px 24px; font-size: 12px; color: #555; flex-shrink: 0; }
    footer a { color: #777; text-decoration: none; }
    @media (max-width: 600px) { .nav-links { display: none; } }
  </style>
</head>
<body>
  <nav>
    <a class="nav-logo" href="/">
      <div class="logo-icon"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
      <div class="logo-text">Driva<span>.tv</span></div>
    </a>
    <ul class="nav-links">
      <li><a href="/proxy/">Home</a></li>
      <li><a href="/proxy/live" id="live-link">Live</a></li>
      <li><a href="/proxy/shows" id="shows-link">Shows</a></li>
      <li><a href="/proxy/sports" id="sports-link">Sports</a></li>
    </ul>
    <div class="nav-right">
      <a class="btn" href="/proxy/">Watch Now</a>
    </div>
  </nav>

  <div class="frame-wrapper">
    <div class="loading" id="loading">
      <div class="spinner"></div>
      <p>Loading Romix TV&hellip;</p>
    </div>
    <iframe
      id="main-frame"
      src="/proxy/"
      allowfullscreen
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      title="Romix TV"
    ></iframe>
  </div>

  <footer>
    &copy; 2026 Driva.tv &mdash; Powered by <a href="/proxy/" target="_self">Romix TV</a>
  </footer>

  <script>
    const frame = document.getElementById('main-frame');
    const loading = document.getElementById('loading');
    frame.addEventListener('load', () => { loading.style.display = 'none'; });
    setTimeout(() => { loading.style.display = 'none'; }, 8000);
  </script>
</body>
</html>`);
});

app.listen(5000, '0.0.0.0', () => {
  console.log('Driva.tv proxy running on port 5000');
});
