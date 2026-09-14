import sharp from 'sharp';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const masters = fileURLToPath(new URL('./construction-masters/', import.meta.url));
const out = fileURLToPath(new URL('../../public/construction/', import.meta.url));
await fs.mkdir(out, { recursive: true });
const selected = process.argv.slice(2);
for (const index of selected.length ? selected.map(Number) : [...Array(9).keys()]) {
  if (!Number.isInteger(index) || index < 0 || index > 8) throw new Error('Expected a stage index from 0 to 8');
  for (const format of ['avif', 'webp']) {
    const buffer = await sharp(`${masters}stage-${index}.png`).resize(1200,1100)
      .toFormat(format, { quality: format === 'avif' ? 55 : 78, effort: 5 }).toBuffer();
    if (buffer.length > 160000) throw new Error(`Stage ${index} ${format} exceeds 160 KB budget`);
    await fs.writeFile(`${out}stage-${index}.${format}`, buffer);
    console.log(`stage-${index}.${format}: ${buffer.length} bytes`);
  }
}
