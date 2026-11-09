import http from 'node:http';

const routes = [
  { port: 8790, destination: 'https://nekoneko-pc.tail877793.ts.net/' },
  { port: 8791, destination: 'https://aabattle-vkc5.onrender.com/' }
];

for (const { port, destination } of routes) {
  http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' });
      return res.end();
    }
    res.writeHead(302, { Location: destination, 'Cache-Control': 'no-store' });
    res.end();
  }).listen(port, '127.0.0.1');
}
