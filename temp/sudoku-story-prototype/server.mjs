import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { Store } from './store.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const dir = resolve(process.env.SUDOKU_DATA_DIR || '/private/tmp/mumu-sudoku-story-data');
if (dir === root.slice(0, -1) || dir.startsWith(root)) throw new Error('数据目录必须在原型源码目录之外');
const port = Number(process.env.PORT || 4317), store = new Store(dir);
let loadError = null; try { await store.load(); } catch(e) { loadError = e.message; }
const files = { '/': ['index.html', 'text/html'], '/app.mjs': ['app.mjs', 'text/javascript'], '/engine.mjs': ['engine.mjs', 'text/javascript'], '/art.mjs': ['art.mjs', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
const server = createServer(async (req, res) => {
  const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  try {
    const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!allowed.includes(req.headers.host)) return send(403, { error: '请通过本机地址打开' });
    if (req.url === '/api/state' && req.method === 'GET') { if (loadError) return send(503, { error: loadError }); return send(200, store.view()); }
    if (req.url === '/api/action' && req.method === 'POST') {
      if (loadError) return send(503, { error: loadError });
      if (req.headers.origin && !allowed.some(host => req.headers.origin === `http://${host}`)) return send(403, { error: '请在原型页面里操作' });
      if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: '请选择有效操作' });
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 10000) return send(413, { error: '本次操作内容过多' }); }
      let parsed; try { parsed = JSON.parse(body); } catch { return send(400, { error: '本次操作格式不完整' }); }
      return send(200, await store.mutate(parsed));
    }
    const asset = /^\/assets\/v2\/(?:icons\/(?:gems|elements|numbers|letters|crew)\/symbol-0[1-9]|backgrounds\/(?:gems|elements|numbers|letters|crew))\.png$/.test(req.url);
    const entry = files[req.url] || (asset ? [req.url.slice(1), 'image/png'] : null);
    if (!entry || req.method !== 'GET') return send(404, { error: '没有找到这一页' });
    let content;
    try { content = await readFile(join(root, entry[0])); }
    catch (error) { if (error.code === 'ENOENT') return send(404, { error: '这张图片还在准备中' }); throw error; }
    res.writeHead(200, { 'Content-Type': entry[1] + (entry[1].startsWith('text/') ? '; charset=utf-8' : ''), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'" });
    res.end(content);
  } catch(e) { send(e.status || 400, { error: e.message || '暂时没有完成，请重试' }); }
});
server.listen(port, '127.0.0.1', () => { console.log(`数独原型：http://127.0.0.1:${port}`); console.log(`隔离数据目录：${dir}`); });
