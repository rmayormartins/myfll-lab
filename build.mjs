// Monta o arquivo único dist/index.html (e uma cópia em ./index.html para o GitHub Pages)
import * as esbuild from 'esbuild';
import fs from 'fs';

const PYODIDE_VERSION = '0.29.5';
const t0 = Date.now();

// 1) three.js (subconjunto, minificado)
const three = await esbuild.build({ entryPoints: ['src/three-entry.js'], bundle: true, format: 'iife', globalName: 'THREE', minify: true, write: false, legalComments: 'none', target: 'es2020' });
let threeJs = three.outputFiles[0].text.replace(new RegExp(String.fromCharCode(0x2014), 'g'), '\\u2014').replace(new RegExp(String.fromCharCode(0x2013), 'g'), '\\u2013');

// 2) worker (física + ponte Python), como texto
const worker = await esbuild.build({ entryPoints: ['src/sim/worker.js'], bundle: true, format: 'iife', write: false, loader: { '.py': 'text' }, target: 'es2020', legalComments: 'none' });
const workerSrc = worker.outputFiles[0].text;

// 3) aplicação principal
const app = await esbuild.build({
  entryPoints: ['src/main/app.js'], bundle: true, format: 'iife', write: false, target: 'es2020', legalComments: 'none',
  loader: { '.py': 'text', '.txt': 'text', '.md': 'text' },
  define: { __WORKER_SRC__: JSON.stringify(workerSrc), __PYODIDE_URL__: JSON.stringify(`https://cdn.jsdelivr.net/npm/pyodide@${PYODIDE_VERSION}/`) },
});
const appJs = app.outputFiles[0].text;

const css = fs.readFileSync('src/main/styles.css', 'utf8');
const body = fs.readFileSync('src/main/body.html', 'utf8');
let html = fs.readFileSync('src/main/index.html', 'utf8');
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
html = html.replace('/*CSS*/', () => css).replace('<!--BODY-->', () => body)
  .replace('/*THREE*/', () => safe(threeJs)).replace('/*APP*/', () => safe(appJs));

// sem travessões (preferência do autor)
const DASHES = new RegExp('[' + String.fromCharCode(0x2014) + String.fromCharCode(0x2013) + ']', 'g');
const bad = [...html.matchAll(DASHES)];
if (bad.length) {
  for (const m of bad.slice(0, 5)) console.log('TRAVESSAO em:', JSON.stringify(html.slice(Math.max(0, m.index - 60), m.index + 20)));
  throw new Error('há travessões no HTML final');
}
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', html);
fs.writeFileSync('index.html', html);   // cópia na raiz para o GitHub Pages
const kb = (fs.statSync('dist/index.html').size / 1024).toFixed(0);
console.log(`dist/index.html ${kb} KB (three ${(threeJs.length/1024).toFixed(0)} KB, worker ${(workerSrc.length/1024).toFixed(0)} KB, app ${(appJs.length/1024).toFixed(0)} KB) em ${Date.now()-t0} ms`);
