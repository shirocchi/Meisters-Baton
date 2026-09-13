import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = process.env.VITE_BASE_PATH || '/';
const at = (path) => base + path.replace(/^\//, '');
const assets = (await readdir('dist/assets'))
  .filter((name) => /\.(js|css)$/.test(name))
  .map((name) => at(`assets/${name}`));
const version = createHash('sha256')
  .update(assets.join('\n'))
  .update(await readFile('dist/third-party-notices.txt'))
  .digest('hex')
  .slice(0, 12);
const shell = [
  '/',
  '/index.html',
  '/icon.svg',
  '/manifest.webmanifest',
  '/third-party-notices.txt',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]
  .map(at)
  .concat(assets);
await writeFile(
  'dist/sw.js',
  `const PREFIX='baton-${createHash('sha256').update(base).digest('hex').slice(0, 8)}-';
const CACHE=PREFIX+'${version}';
const SHELL=${JSON.stringify(shell)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(request.mode==='navigate') {event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('${at('index.html')}',copy));}return response;}).catch(()=>caches.match('${at('index.html')}')));return;}
 if(url.pathname.startsWith('${at('assets/')}')||url.pathname.startsWith('${at('icons/')}')||url.pathname==='${at('icon.svg')}'||url.pathname==='${at('third-party-notices.txt')}')event.respondWith(caches.match(request).then(hit=>hit||fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;})));
});\n`,
);
console.log('Offline application shell generated. Private API responses are never cached.');
