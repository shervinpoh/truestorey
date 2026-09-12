/** A portable contact sheet: the exact delivered assets on both page grounds. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const subjects = [
  ['sun', 'Light & orientation', 'GPT Image'],
  ['lease', 'Time & tenure', 'Blender'],
  ['land', 'Land & supply', 'Blender'],
];
let cards = '';
for (const [id, title, maker] of subjects) {
  const file = await fs.readFile(path.resolve(root, `../../public/editorial/subject-${id}-a.webp`));
  const src = `data:image/webp;base64,${file.toString('base64')}`;
  const sample = `<div class="large"><img src="${src}" alt="${title}: conceptual editorial illustration" width="1600" height="900"></div><div class="crops"><span>120 px crops</span><img class="square" src="${src}" alt="Square crop" width="120" height="120"><img class="four" src="${src}" alt="Four by three crop" width="120" height="90"></div>`;
  cards += `<section><header><h2>${title}</h2><p>${maker} · ${Math.round(file.length/1000)} KB WebP · 1600 × 900</p></header><div class="pair"><article class="light"><p>Light · #F6F5F2</p>${sample}</article><article class="dark"><p>Dark · #0B0D0F</p>${sample}</article></div></section>`;
}
await fs.writeFile(path.join(root,'proof.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Truestorey — editorial image proofs</title><style>*{box-sizing:border-box}body{margin:0;background:#dddeda;font:16px/1.5 system-ui,sans-serif;color:#111414}main{max-width:1744px;margin:auto;padding:36px}h1{font-size:clamp(28px,4vw,48px);letter-spacing:-.04em;line-height:1.05;margin:0 0 12px}h2{font-size:24px;letter-spacing:-.03em;margin:0}header p{margin:4px 0 16px;font:12px/1.5 monospace}section{margin-top:36px}.pair{display:grid;grid-template-columns:1fr 1fr}.pair article{padding:24px}.pair article>p{font:12px monospace;margin:0 0 18px}.light{background:#F6F5F2}.dark{background:#0B0D0F;color:#ECEEF0}.large img{width:100%;height:auto;display:block}.crops{display:flex;align-items:center;gap:14px;margin-top:20px}.crops span{font:12px monospace;margin-right:auto}.crops img{object-fit:cover;display:block}.square{width:120px;height:120px}.four{width:120px;height:90px}@media(max-width:760px){main{padding:20px}.pair{grid-template-columns:1fr}.pair article{padding:20px}.crops{gap:10px}.crops span{max-width:6ch}}</style><main><h1>Material evidence.</h1><p>Truestorey’s first editorial image family. The same files on both themes, with centre crops.<br>Conceptual illustrations; none depicts an actual property or site.</p>${cards}</main></html>`);
console.log('Wrote design/assets/proof.html');
