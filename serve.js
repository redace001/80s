#!/usr/bin/env node
/* ============================================================
   The 80s Cruise - Deck Runner : local dev server
   Serves this folder over your LAN so you can play on a phone.

   Usage:
     node serve.js            (defaults to port 8000)
     node serve.js 8080       (custom port)
     PORT=8080 node serve.js  (env var)

   No dependencies - uses only Node built-ins.
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const HOST = '0.0.0.0';
const START_PORT = parseInt(process.argv[2] || process.env.PORT || '8000', 10) || 8000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function localIPv4() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push({ name, address: ni.address });
    }
  }
  return out;
}

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed');
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  } catch (e) {
    return send(res, 400, 'Bad Request');
  }
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  // Resolve and guard against path traversal.
  const filePath = path.resolve(ROOT, '.' + path.sep + urlPath);
  const rel = path.relative(ROOT, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return send(res, 403, 'Forbidden');
  }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not Found: ' + urlPath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache'
    });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('\n  Port ' + START_PORT + ' is already in use.');
    console.error('  Try another port:  node serve.js ' + (START_PORT + 1) + '\n');
  } else {
    console.error('\n  Server error:', err.message, '\n');
  }
  process.exit(1);
});

server.listen(START_PORT, HOST, () => {
  const ips = localIPv4();
  console.log('\n  The 80s Cruise - Deck Runner');
  console.log('  ==============================');
  console.log('  Serving: ' + ROOT);
  console.log('\n  On this computer:');
  console.log('    http://localhost:' + START_PORT);
  if (ips.length) {
    console.log('\n  On your phone (same Wi-Fi):');
    for (const ip of ips) {
      console.log('    http://' + ip.address + ':' + START_PORT + '   [' + ip.name + ']');
    }
  } else {
    console.log('\n  No LAN IPv4 address found - are you connected to Wi-Fi?');
  }
  console.log('\n  Ctrl+C to stop.\n');
});

process.on('SIGINT', () => {
  console.log('\n  Server stopped.');
  process.exit(0);
});
