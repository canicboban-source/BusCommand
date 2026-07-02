const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname);
const PORT = 8766;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.pdf':  'application/pdf',
    '.json': 'application/json',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon'
};

const server = http.createServer((req, res) => {
    let url = req.url.split('?')[0]; // strip query string
    if (url === '/') url = '/index.html';
    
    const filePath = path.join(ROOT, url);
    
    // Safety: don't serve outside root
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found: ' + url);
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const ct = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': ct,
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(data);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    let localIP = 'localhost';
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                localIP = net.address;
            }
        }
    }
    console.log('');
    console.log('===========================================');
    console.log('  SERVER POKRENUT!');
    console.log('  Na kompjuteru:');
    console.log('  http://localhost:' + PORT);
    console.log('  Na telefonu (ista WiFi mreza):');
    console.log('  http://' + localIP + ':' + PORT);
    console.log('===========================================');
    console.log('  Pritisnite Ctrl+C da zaustavite server.');
    console.log('');
});
