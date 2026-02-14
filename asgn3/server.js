// Simple static file server for Assignment 3
// Run with: node server.js
// Then open http://localhost:8000 in your browser

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const BASE_DIR = path.join(__dirname, 'src');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.json': 'application/json',
  '.obj':  'text/plain',
  '.mtl':  'text/plain',
};

const server = http.createServer((req, res) => {
  // Default to index.html
  let filePath = req.url === '/' ? '/asgn3.html' : req.url;

  // Resolve against base directory
  let fullPath = path.join(BASE_DIR, filePath);

  // Also allow serving files from asgn0/src/lib for the matrix library
  if (filePath.includes('cuon-matrix')) {
    fullPath = path.join(__dirname, '..', 'asgn0', 'src', 'lib', path.basename(filePath));
  }

  const ext = path.extname(fullPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found: ' + filePath);
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n  Assignment 3 server running at:\n`);
  console.log(`    http://localhost:${PORT}\n`);
  console.log(`  Serving files from: ${BASE_DIR}`);
  console.log(`  Press Ctrl+C to stop.\n`);
});
