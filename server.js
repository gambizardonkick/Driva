const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const path = require('path');
const zlib = require('zlib');

const app = express();
const TARGET = 'https://romix.tv';
const TARGET_HOST = 'romix.tv';

const STRIP_RES_HEADERS = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'strict-transport-security',
  'x-xss-protection',
  'transfer-encoding',
  'content-encoding',
  'content-length',
]);

const NAV_INJECT = `
<style>
#driva-nav{
  position:fixed;top:0;left:0;right:0;height:50px;
  background:#111;border-bottom:1px solid #1e1e1e;
  display:flex;align-items:center;justify-content:space-between;
  padding:0 24px;z-index:999999;font-family:'Segoe UI',sans-serif;
}
#driva-nav .dn-logo{display:flex;align-items:center;gap:9px;text-decoration:none;cursor:pointer}
#driva-nav .dn-icon{width:30px;height:30px;background:linear-gradient(135deg,#e63946,#c1121f);border-radius:7px;display:flex;align-items:center;justify-content:center}
#driva-nav .dn-icon svg{width:16px;height:16px;fill:#fff}
#driva-nav .dn-wordmark{font-size:19px;font-weight:700;color:#fff;letter-spacing:.2px}
#driva-nav .dn-wordmark em{font-style:normal;color:#e63946}
#driva-nav .dn-links{display:flex;gap:24px;list-style:none}
#driva-nav .dn-links a{color:#aaa;text-decoration:none;font-size:13px;font-weight:500;cursor:pointer;transition:color .15s}
#driva-nav .dn-links a:hover{color:#fff}
#driva-nav .dn-btn{background:#e63946;color:#fff;border:none;padding:7px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;transition:background .15s}
#driva-nav .dn-btn:hover{background:#c1121f}
body{padding-top:50px!important}
@media(max-width:600px){#driva-nav .dn-links{display:none}#driva-nav{padding:0 14px}}
</style>
<div id="driva-nav">
  <a class="dn-logo" href="/">
    <div class="dn-icon"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
    <div class="dn-wordmark">Driva<em>.tv</em></div>
  </a>
  <ul class="dn-links">
    <li><a href="/">Home</a></li>
    <li><a href="/stream">Stream</a></li>
    <li><a href="/leaderboard">Leaderboard</a></li>
    <li><a href="/store">Store</a></li>
  </ul>
  <a class="dn-btn" href="/">Watch Now</a>
</div>
`;

const INTERCEPT_SCRIPT = `
<script>
(function(){
  var T='https://romix.tv';
  var W='https://www.romix.tv';
  function rw(u){
    if(!u||typeof u!=='string') return u;
    if(u.startsWith(T)) return u.slice(T.length)||'/';
    if(u.startsWith(W)) return u.slice(W.length)||'/';
    return u;
  }
  var oFetch=window.fetch;
  window.fetch=function(input,init){
    if(typeof input==='string') input=rw(input);
    else if(input instanceof Request){
      var url=rw(input.url);
      if(url!==input.url) input=new Request(url,input);
    }
    return oFetch.call(this,input,init);
  };
  var oOpen=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,u){
    arguments[1]=rw(u);
    return oOpen.apply(this,arguments);
  };
  var oPush=history.pushState;
  history.pushState=function(s,t,u){ return oPush.call(this,s,t,rw(u)||u); };
  var oReplace=history.replaceState;
  history.replaceState=function(s,t,u){ return oReplace.call(this,s,t,rw(u)||u); };
  Object.defineProperty(document,'cookie',{
    set:function(v){ document.cookie=v; },
    get:function(){ return document.cookie; },
    configurable:true
  });
})();
</script>
`;

function rewriteText(text) {
  return text
    .replace(/https?:\/\/(?:www\.)?romix\.tv(\/[^\s"'`),>]*)/g, '$1')
    .replace(/https?:\/\/(?:www\.)?romix\.tv(['"`\s),>])/g, '/$1')
    .replace(/((?:href|src|action|srcset)\s*=\s*["'])(\/(?!\/)[^"']*)(["'])/g, '$1$2$3');
}

async function proxyRequest(req, res) {
  const targetUrl = TARGET + req.url;

  const reqHeaders = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'accept': req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'accept-encoding': 'identity',
    'referer': TARGET + '/',
    'origin': TARGET,
    'host': TARGET_HOST,
  };

  if (req.headers['content-type']) reqHeaders['content-type'] = req.headers['content-type'];
  if (req.headers['authorization']) reqHeaders['authorization'] = req.headers['authorization'];
  if (req.headers['x-requested-with']) reqHeaders['x-requested-with'] = req.headers['x-requested-with'];

  const rawCookies = req.headers['cookie'] || '';
  if (rawCookies) reqHeaders['cookie'] = rawCookies;

  let body;
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    body = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: reqHeaders,
      body: body || undefined,
      redirect: 'manual',
    });

    const contentType = response.headers.get('content-type') || '';
    const status = response.status;

    response.headers.forEach((value, name) => {
      const lower = name.toLowerCase();
      if (STRIP_RES_HEADERS.has(lower)) return;

      if (lower === 'set-cookie') {
        const cookies = value.split(/,(?=[^ ])/);
        cookies.forEach(cookie => {
          const rewritten = cookie
            .replace(/\s*domain=[^;]+;?/gi, '')
            .replace(/\s*secure;?/gi, '')
            .replace(/\s*samesite=[^;]+;?/gi, '');
          res.append('set-cookie', rewritten.trim());
        });
        return;
      }

      if (lower === 'location') {
        let loc = value;
        if (loc.startsWith('https://romix.tv')) loc = loc.replace('https://romix.tv', '');
        if (loc.startsWith('https://www.romix.tv')) loc = loc.replace('https://www.romix.tv', '');
        res.setHeader('location', loc || '/');
        return;
      }

      res.setHeader(name, value);
    });

    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-credentials', 'true');
    res.status(status);

    if (contentType.includes('text/html')) {
      let text = await response.text();
      text = rewriteText(text);
      text = text.replace(/<head([^>]*)>/i, `<head$1>${INTERCEPT_SCRIPT}`);
      text = text.replace(/<body([^>]*)>/i, `<body$1>${NAV_INJECT}`);
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.send(text);
    }

    if (contentType.includes('javascript') || contentType.includes('text/css')) {
      const text = await response.text();
      return res.send(rewriteText(text));
    }

    const buf = await response.arrayBuffer();
    res.send(Buffer.from(buf));

  } catch (err) {
    console.error('[proxy error]', req.url, err.message);
    if (!res.headersSent) res.status(502).send('Proxy error: ' + err.message);
  }
}

app.use(express.raw({ type: '*/*', limit: '20mb' }));

app.get('/sw.js', (req, res) => {
  res.setHeader('content-type', 'application/javascript');
  res.setHeader('service-worker-allowed', '/');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

app.use('/', proxyRequest);

app.listen(5000, '0.0.0.0', () => console.log('Driva.tv proxy running on :5000'));
