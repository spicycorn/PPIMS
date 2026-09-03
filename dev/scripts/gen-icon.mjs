// 生成 PPIMS 应用图标：线条画风格 · 可爱小人整理文件夹（纯 Node，零依赖，手写 PNG 编码）
// 风格：白底 + 深靛墨水描边（圆头圆角）+ 极少暖色点缀，干净通透，小尺寸下依旧清晰
// 用法：node scripts/gen-icon.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SIZE = 512; // 输出像素
const SS = 4; // 超采样倍数（渲染 2048 再降到 512，线条更顺滑）
const W = SIZE * SS;

// RGBA 浮点缓冲（0..255），alpha 合成
const buf = new Float64Array(W * W * 4);

function setPx(x, y, c, cov) {
  if (x < 0 || y < 0 || x >= W || y >= W) return;
  const i = (y * W + x) * 4;
  const a = c.a / 255;
  const ca = a * cov;
  const inv = 1 - ca;
  buf[i] = c.r * ca + buf[i] * inv;
  buf[i + 1] = c.g * ca + buf[i + 1] * inv;
  buf[i + 2] = c.b * ca + buf[i + 2] * inv;
  buf[i + 3] = Math.min(255, c.a * cov + buf[i + 3] * inv);
}
const hex = (h) => {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 255 };
};
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
// 几何用 512 坐标系，绘制时统一乘 SS 映射到高分辨率缓冲
const S = (v) => v * SS;

// ---------------- 基础 SDF 覆盖 ----------------
function circCov(x, y, cx, cy, r) {
  const d = Math.hypot(x - cx, y - cy);
  return clamp01(r - d + 0.5);
}
function rrectCov(x, y, x0, y0, x1, y1, rad) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const hw = (x1 - x0) / 2 - rad, hh = (y1 - y0) / 2 - rad;
  const dx = Math.abs(x - cx) - hw, dy = Math.abs(y - cy) - hh;
  const d = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - rad;
  return clamp01(-d + 0.5);
}
function bboxOfCircle(cx, cy, r) {
  return {
    X0: Math.max(0, Math.floor(cx - r - 2)), X1: Math.min(W - 1, Math.ceil(cx + r + 2)),
    Y0: Math.max(0, Math.floor(cy - r - 2)), Y1: Math.min(W - 1, Math.ceil(cy + r + 2)),
  };
}
function bboxOfRect(x0, y0, x1, y1, pad) {
  return {
    X0: Math.max(0, Math.floor(x0 - pad)), X1: Math.min(W - 1, Math.ceil(x1 + pad)),
    Y0: Math.max(0, Math.floor(y0 - pad)), Y1: Math.min(W - 1, Math.ceil(y1 + pad)),
  };
}
function eachIn(bbox, fn) {
  for (let y = bbox.Y0; y <= bbox.Y1; y++) for (let x = bbox.X0; x <= bbox.X1; x++) fn(x, y);
}

// 实心圆
function drawCircle(cx, cy, r, color) {
  const bb = bboxOfCircle(cx, cy, r);
  eachIn(bb, (x, y) => { const cov = circCov(x, y, cx, cy, r); if (cov > 0) setPx(x, y, color, cov); });
}
// 圆环（描边）
function drawRing(cx, cy, r, width, color) {
  const bb = bboxOfCircle(cx, cy, r + width / 2 + 1);
  eachIn(bb, (x, y) => {
    const d = Math.abs(Math.hypot(x - cx, y - cy) - r);
    const cov = clamp01(width / 2 - d + 0.5);
    if (cov > 0) setPx(x, y, color, cov);
  });
}
// 实心圆角矩形
function drawRRect(x0, y0, x1, y1, rad, color) {
  const bb = bboxOfRect(x0, y0, x1, y1, 2);
  eachIn(bb, (x, y) => { const cov = rrectCov(x, y, x0, y0, x1, y1, rad); if (cov > 0) setPx(x, y, color, cov); });
}
// 圆角矩形描边
function drawRRing(x0, y0, x1, y1, rad, width, color) {
  const bb = bboxOfRect(x0, y0, x1, y1, width / 2 + 1);
  eachIn(bb, (x, y) => {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const hw = (x1 - x0) / 2 - rad, hh = (y1 - y0) / 2 - rad;
    const dx = Math.abs(x - cx) - hw, dy = Math.abs(y - cy) - hh;
    const d = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - rad;
    const cov = clamp01(width / 2 - Math.abs(d) + 0.5);
    if (cov > 0) setPx(x, y, color, cov);
  });
}
// 圆弧（角度制 0=右 90=下，a0..a1 逆时针扫描）
function drawArc(cx, cy, r, a0, a1, width, color) {
  const bb = bboxOfCircle(cx, cy, r + width / 2 + 1);
  const rad2deg = 180 / Math.PI;
  eachIn(bb, (x, y) => {
    const dist = Math.hypot(x - cx, y - cy);
    let ang = Math.atan2(y - cy, x - cx) * rad2deg;
    if (ang < 0) ang += 360;
    let rel = ang - a0;
    if (rel < 0) rel += 360;
    const span = ((a1 - a0) % 360 + 360) % 360;
    if (rel <= span) {
      const cov = clamp01(width / 2 - Math.abs(dist - r) + 0.5);
      if (cov > 0) setPx(x, y, color, cov);
    }
  });
}
// 线段（圆头）
function drawLine(x0, y0, x1, y1, width, color) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1e-6) { drawCircle(x0, y0, width / 2, color); return; }
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const dx = (x1 - x0) / len, dy = (y1 - y0) / len;
  const bb = bboxOfRect(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), width / 2 + 1);
  eachIn(bb, (x, y) => {
    const ax = x - mx, ay = y - my;
    const t = Math.max(0, Math.min(len, ax * dx + ay * dy));
    const d = Math.hypot(ax - t * dx, ay - t * dy);
    const cov = clamp01(width / 2 - d + 0.5);
    if (cov > 0) setPx(x, y, color, cov);
  });
}

// ---------------- 调色板（线条画：白底 + 深靛墨水 + 极少暖色） ----------------
const C = {
  bg: hex('#FFFFFF'),          // 纯白底（深色任务栏上最醒目）
  ink: hex('#2E2E48'),         // 深靛墨水（描边/五官）
  inkSoft: hex('#4A4A6B'),     // 略浅墨水（次级细节）
  cheek: hex('#FFAFA0'),       // 软腮红
  folderFill: hex('#FFE3BF'),  // 文件夹淡橙填色（唯一主点缀）
  folderTab: hex('#FFCF9E'),   // 文件夹标签略深
  pom: hex('#FFCF9E'),         // 帽顶绒球（与文件夹同系，统一点缀色）
  hand: hex('#FFFFFF'),        // 手（白，叠在墨线上断开线条，留出"握着"的缝隙）
};

const INK_W = S(15); // 主描边粗细（小尺寸下足够醒目）
const INK_W2 = S(11); // 次级描边

// ---------------- 背景：白色圆角方 ----------------
const WIN = { x0: S(18), y0: S(18), x1: S(494), y1: S(494), rad: S(104) };
{
  const bb = bboxOfRect(WIN.x0, WIN.y0, WIN.x1, WIN.y1, 2);
  eachIn(bb, (x, y) => { const cov = rrectCov(x, y, WIN.x0, WIN.y0, WIN.x1, WIN.y1, WIN.rad); if (cov > 0) setPx(x, y, C.bg, cov); });
}

// ---------------- 角色几何（512 坐标系） ----------------
const H = { cx: S(256), cy: S(176), r: S(96) };        // 头
const BEANIE_TOP = S(70);                              // 帽顶
const BODY = { x0: S(150), y0: S(262), x1: S(362), y1: S(438), rad: S(84) }; // 身体

// 1) 身体：白色填 + 墨描边
drawRRect(BODY.x0, BODY.y0, BODY.x1, BODY.y1, BODY.rad, C.bg);
drawRRing(BODY.x0, BODY.y0, BODY.x1, BODY.y1, BODY.rad, INK_W, C.ink);

// 2) 头：白色填 + 墨描边（头叠在身体上方，接缝被头盖住）
drawCircle(H.cx, H.cy, H.r, C.bg);
drawRing(H.cx, H.cy, H.r, INK_W, C.ink);

// 3) 针织帽（贝雷/毛线帽）：半圆帽身 + 帽檐 + 绒球
// 帽身（覆盖头顶的半圆，白色填 + 墨描边）
{
  const bb = bboxOfCircle(H.cx, S(170), S(104), 2);
  eachIn(bb, (x, y) => {
    if (y > S(170) + S(2)) return; // 只保留上半部分
    const cov = circCov(x, y, H.cx, S(170), S(104));
    if (cov > 0) setPx(x, y, C.bg, cov);
  });
}
// 帽檐（横向圆角条，略宽于头，墨描边 + 淡橙填）
const BAND = { x0: S(150), y0: S(156), x1: S(362), y1: S(182), rad: S(13) };
drawRRect(BAND.x0, BAND.y0, BAND.x1, BAND.y1, BAND.rad, C.folderTab);
drawRRing(BAND.x0, BAND.y0, BAND.x1, BAND.y1, BAND.rad, INK_W, C.ink);
// 绒球（帽顶）
drawCircle(S(256), S(64), S(22), C.pom);
drawRing(S(256), S(64), S(22), INK_W2, C.ink);

// 4) 眼睛：两个墨点（圆头）
drawCircle(S(222), S(196), S(11), C.ink);
drawCircle(S(290), S(196), S(11), C.ink);
// 眼睛高光（小白点，增加"活"的感觉）
drawCircle(S(219), S(192), S(3.5), C.bg);
drawCircle(S(287), S(192), S(3.5), C.bg);

// 5) 腮红：两个软粉点
drawCircle(S(186), S(214), S(12), C.cheek);
drawCircle(S(326), S(214), S(12), C.cheek);

// 6) 嘴：小弧形笑（墨线，开口向上 = 微笑）
drawArc(S(256), S(222), S(16), 30, 150, INK_W2, C.ink);

// 7) 文件夹：小人正在整理的一个文件夹（淡橙填 + 墨描边）
// 文件夹主体
const FOL = { x0: S(186), y0: S(300), x1: S(326), y1: S(392), rad: S(10) };
// 标签（左上凸起）
const TAB = { x0: S(186), y0: S(286), x1: S(256), y1: S(308), rad: S(8) };
drawRRect(TAB.x0, TAB.y0, TAB.x1, TAB.y1, TAB.rad, C.folderTab);
drawRRect(FOL.x0, FOL.y0, FOL.x1, FOL.y1, FOL.rad, C.folderFill);
// 描边：先画标签描边（被主体填色盖住下半），再画主体描边（最上）
drawRRing(TAB.x0, TAB.y0, TAB.x1, TAB.y1, TAB.rad, INK_W, C.ink);
drawRRing(FOL.x0, FOL.y0, FOL.x1, FOL.y1, FOL.rad, INK_W, C.ink);
// 文件夹内"文件"暗示：两条横线（墨线，次级）
drawLine(S(206), S(330), S(306), S(330), INK_W2, C.inkSoft);
drawLine(S(206), S(352), S(276), S(352), INK_W2, C.inkSoft);

// 8) 手臂：两条墨线从身体伸向文件夹（圆头）
drawLine(S(166), S(320), S(206), S(330), INK_W, C.ink); // 左
drawLine(S(346), S(320), S(306), S(330), INK_W, C.ink); // 右
// 手（白点叠在墨线上，断开线条，营造"握着"的缝隙）
drawCircle(S(206), S(330), S(13), C.hand);
drawCircle(S(306), S(330), S(13), C.hand);
drawRing(S(206), S(330), S(13), INK_W2, C.ink);
drawRing(S(306), S(330), S(13), INK_W2, C.ink);

// 9) 点缀：两个小"整理完成"的星点（淡橙，与文件夹同系）
function sparkle(cx, cy, r) {
  drawLine(cx - r, cy, cx + r, cy, r * 0.5, C.folderTab);
  drawLine(cx, cy - r, cx, cy + r, r * 0.5, C.folderTab);
}
sparkle(S(420), S(250), S(13));
sparkle(S(96), S(270), S(10));
drawCircle(S(432), S(310), S(5), C.pom);
drawCircle(S(84), S(320), S(4), C.pom);

// ---------------- 降到 512（SS x SS 平均） ----------------
const out = new Uint8Array(SIZE * SIZE * 4);
for (let oy = 0; oy < SIZE; oy++) {
  for (let ox = 0; ox < SIZE; ox++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const i = ((oy * SS + sy) * W + (ox * SS + sx)) * 4;
        r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; a += buf[i + 3];
      }
    }
    const n = SS * SS;
    const o = (oy * SIZE + ox) * 4;
    out[o] = Math.round(r / n);
    out[o + 1] = Math.round(g / n);
    out[o + 2] = Math.round(b / n);
    out[o + 3] = Math.round(a / n);
  }
}

// ---------------- PNG 编码（无依赖） ----------------
function crc32(data) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < data.length; i++) crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const png = encodePNG(SIZE, SIZE, Buffer.from(out.buffer));
const pub = join(ROOT, 'public');
mkdirSync(pub, { recursive: true });
const outFile = join(pub, 'icon.png');
writeFileSync(outFile, png);
console.log(`✓ 图标已生成：${outFile}（${SIZE}x${SIZE}，PNG，${png.length} 字节，线条画风格）`);
