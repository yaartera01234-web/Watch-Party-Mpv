const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function createPng(width, height) {
  // Simple uncompressed or deflate PNG generator
  function crc32(buf) {
    let table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c;
    }
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const toCrc = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(toCrc), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: 2 (RGB)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw pixels: each scanline starts with filter byte 0, then width * 3 bytes (RGB)
  const raw = Buffer.alloc(height * (1 + width * 3));
  let offset = 0;

  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.44;

  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // filter none
    const ny = y / height;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Play button triangle logic: x from cx - r*0.3 to cx + r*0.4, y bounded
      const triLeft = cx - width * 0.15;
      const triRight = cx + width * 0.22;
      const triHalfH = width * 0.22;
      let inTri = false;
      if (x >= triLeft && x <= triRight) {
        const span = (x - triLeft) / (triRight - triLeft);
        const maxH = (1 - span) * triHalfH;
        if (Math.abs(y - cy) <= maxH) {
          inTri = true;
        }
      }

      if (inTri) {
        // Pure White play button
        raw[offset++] = 255;
        raw[offset++] = 255;
        raw[offset++] = 255;
      } else if (dist <= radius) {
        // Inner circle dark slate
        raw[offset++] = 15;
        raw[offset++] = 12;
        raw[offset++] = 28;
      } else {
        // Gradient violet-pink-indigo border
        const r = Math.floor(124 * (1 - nx) + 236 * nx);
        const g = Math.floor(58 * (1 - ny) + 72 * ny);
        const b = Math.floor(237 * (1 - nx * ny) + 246 * (nx * ny));
        raw[offset++] = Math.min(255, Math.max(0, r));
        raw[offset++] = Math.min(255, Math.max(0, g));
        raw[offset++] = Math.min(255, Math.max(0, b));
      }
    }
  }

  const compressed = zlib.deflateSync(raw);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

const pub = path.join(__dirname, '..', 'public');
fs.writeFileSync(path.join(pub, 'pwa-192x192.png'), createPng(192, 192));
fs.writeFileSync(path.join(pub, 'pwa-512x512.png'), createPng(512, 512));
fs.writeFileSync(path.join(pub, 'pwa-maskable-512x512.png'), createPng(512, 512));
fs.writeFileSync(path.join(pub, 'apple-touch-icon.png'), createPng(180, 180));
console.log('PNG icons generated successfully!');
