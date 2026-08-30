// 从 512 icon.png 派生多尺寸 PNG + ICO（16/32/48/256）
// 缩放用双线性插值（对已抗锯齿的 512 足够清晰）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(ROOT, 'public', 'icon.png');
const png = readFileSync(src);

// ---- 解码 512 ----
function parseChunks(buf) {
  const out = []; let o = 8;
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    out.push({ type, body: buf.slice(o + 8, o + 8 + len) });
    o += 8 + len + 4;
  }
  return out;
}
function decodeRGBA(buf) {
  const chunks = parseChunks(buf);
  const ihdr = chunks.find((c) => c.type === 'IHDR').body;
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
  const bpp = 4, stride = width * bpp;
  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.body));
  const raw = inflateSync(idat);
  const img = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const ft = raw[y * (stride + 1)], rs = y * (stride + 1) + 1, ds = y * stride;
    for (let x = 0; x < stride; x++) {
      const cur = raw[rs + x];
      const a = x >= bpp ? img[ds + x - bpp] : 0;
      const b = y > 0 ? img[ds - stride + x] : 0;
      const c = x >= bpp && y > 0 ? img[ds - stride + x - bpp] : 0;
      let v;
      if (ft === 0) v = cur; else if (ft === 1) v = cur + a; else if (ft === 2) v = cur + b;
      else if (ft === 3) v = cur + ((a + b) >> 1);
      else { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; v = cur + pr; }
      img[ds + x] = v & 0xff;
    }
  }
  return { width, height, img };
}
// 双线性缩放到 size
function resize(srcImg, size) {
  const { width, height, img } = srcImg;
  const scale = size / width;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.min(width - 1, Math.max(0, (x + 0.5) / scale - 0.5));
      const sy = Math.min(height - 1, Math.max(0, (y + 0.5) / scale - 0.5));
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
      const fx = sx - x0, fy = sy - y0;
      const at = (xx, yy) => { const i = (yy * width + xx) * 4; return [img[i], img[i + 1], img[i + 2], img[i + 3]]; };
      for (let ch = 0; ch < 4; ch++) {
        const top = at(x0, y0)[ch] * (1 - fx) + at(x1, y0)[ch] * fx;
        const bot = at(x0, y1)[ch] * (1 - fx) + at(x1, y1)[ch] * fx;
        out[(y * size + x) * 4 + ch] = Math.round(top * (1 - fy) + bot * fy);
      }
    }
  }
  return out;
}

// ---- PNG 编码 ----
function crc32(data) {
  let t = crc32.t;
  if (!t) { t = crc32.t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } }
  let crc = -1;
  for (let i = 0; i < data.length; i++) crc = (crc >>> 8) ^ t[(crc ^ data[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const srcImg = decodeRGBA(png);
console.log(`源图 ${srcImg.width}x${srcImg.height}`);

const pub = join(ROOT, 'public');
mkdirSync(pub, { recursive: true });

// 多尺寸 PNG
for (const size of [32, 64, 128, 256]) {
  const rgba = resize(srcImg, size);
  const out = join(pub, `icon-${size}.png`);
  writeFileSync(out, encodePNG(size, rgba));
  console.log(`✓ ${out}`);
}

// ICO（多尺寸：16/32/48/256，全部用 PNG 压缩）
const icoSizes = [16, 32, 48, 256];
const images = icoSizes.map((size) => encodePNG(size, resize(srcImg, size)));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);       // reserved
header.writeUInt16LE(1, 2);       // type = icon
header.writeUInt16LE(images.length, 4); // count
const dirEntries = Buffer.alloc(16 * images.length);
let offset = 6 + 16 * images.length;
images.forEach((img, i) => {
  dirEntries[i * 16 + 0] = icoSizes[i] === 256 ? 0 : icoSizes[i]; // width (0 = 256)
  dirEntries[i * 16 + 1] = icoSizes[i] === 256 ? 0 : icoSizes[i]; // height
  dirEntries[i * 16 + 2] = 0;   // colors
  dirEntries[i * 16 + 3] = 0;   // reserved
  dirEntries.writeUInt16LE(1, i * 16 + 4);   // planes
  dirEntries.writeUInt16LE(32, i * 16 + 6);  // bpp
  dirEntries.writeUInt32LE(img.length, i * 16 + 8);  // size
  dirEntries.writeUInt32LE(offset, i * 16 + 12); // offset
  offset += img.length;
});
const icoBuf = Buffer.concat([header, dirEntries, ...images]);
const icoOut = join(pub, 'icon.ico');
writeFileSync(icoOut, icoBuf);
console.log(`✓ ${icoOut}（${icoSizes.join('/')}，${icoBuf.length} 字节）`);
