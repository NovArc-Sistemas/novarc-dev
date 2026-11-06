// Serve uma pasta de planejamento para a prévia local, declarando UTF-8. O index.html é um fragmento (o claude.ai
// acrescenta o esqueleto com o charset ao publicar), então um servidor que não declara a codificação, como o
// http.server do Python, mostra os acentos da casca quebrados.
// Uso: node ferramentas/servir.js <pasta> [porta]   (padrão 8765, só em 127.0.0.1)
const http = require('http'), fs = require('fs'), path = require('path');
const raiz = path.resolve(process.argv[2] || '.'), porta = +(process.argv[3] || 8765);
const TIPOS = { '.html': 'text/html', '.json': 'application/json', '.md': 'text/markdown', '.js': 'text/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const arq = path.join(raiz, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (!arq.startsWith(raiz + path.sep) && arq !== raiz) { res.writeHead(403); return res.end(); }
  fs.readFile(arq, (erro, dados) => {
    if (erro) { res.writeHead(404); return res.end('não encontrado'); }
    const tipo = TIPOS[path.extname(arq).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': tipo.startsWith('image/') ? tipo : `${tipo}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(dados);
  });
}).listen(porta, '127.0.0.1', () => console.log(`prévia em http://127.0.0.1:${porta}/ (pasta ${raiz})`));
