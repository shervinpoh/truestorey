/** Encode the approved master files; sharp is already supplied by Next. */
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(root, '../../public/editorial');
await fs.mkdir(out, { recursive: true });
for (const file of (await fs.readdir(path.join(root, 'masters'))).filter(f => /^subject-.*\.png$/.test(f))) {
  for (const format of ['avif', 'webp']) {
    let quality = format === 'avif' ? 48 : 72;
    let data;
    do {
      data = await sharp(path.join(root, 'masters', file)).resize(1600, 900, { fit: 'cover' })
        .toFormat(format, { quality, effort: format === 'avif' ? 6 : 5 }).toBuffer();
      if (data.length <= 120000) break;
      quality -= 5;
    } while (quality >= 20);
    if (data.length > 120000) throw new Error(`${file}: cannot meet 120 KB budget`);
    const name = file.replace('.png', '.' + format);
    await fs.writeFile(path.join(out, name), data);
    console.log(`${name}: ${data.length} bytes, quality ${quality}`);
  }
}
