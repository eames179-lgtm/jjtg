const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 5173;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.woff2': 'font/woff2',
};

http.createServer((request, response) => {
  const requestPath = decodeURIComponent((request.url || '/').split('?')[0]);
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, relativePath);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    const type = types[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const range = request.headers.range;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match?.[1] ? Number(match[1]) : 0;
      const end = match?.[2] ? Number(match[2]) : stat.size - 1;
      if (!match || start > end || end >= stat.size) {
        response.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
        return;
      }
      response.writeHead(206, {
        'Content-Type': type, 'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath, { start, end }).pipe(response);
      return;
    }
    response.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    fs.createReadStream(filePath).pipe(response);
  });
}).listen(PORT, () => console.log(`Ocean research game: http://localhost:${PORT}`));
