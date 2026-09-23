import fs from "node:fs";
import path from "node:path";

// A clean 48x48 RGBA PNG buffer generator
function createIconPNG(size) {
  // Simple PNG header and chunk builder
  const width = size;
  const height = size;
  const rowSize = width * 4 + 1;
  const rawData = Buffer.alloc(height * rowSize, 0);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type: None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      // Gradient background with rounded square
      const dx = x - width / 2;
      const dy = y - height / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < width * 0.45) {
        rawData[pxOffset] = 79;     // R (Indigo)
        rawData[pxOffset + 1] = 70;  // G
        rawData[pxOffset + 2] = 229; // B
        rawData[pxOffset + 3] = 255; // A
        // Lightning bolt pattern in center
        if (Math.abs(dx * 0.8 + dy * 0.6) < size * 0.15 && Math.abs(dx - dy * 0.5) < size * 0.35) {
          rawData[pxOffset] = 255;
          rawData[pxOffset + 1] = 255;
          rawData[pxOffset + 2] = 255;
          rawData[pxOffset + 3] = 255;
        }
      }
    }
  }

  // Use zlib to deflate raw data
  import("node:zlib").then((zlib) => {
    const deflated = zlib.deflateSync(rawData);

    function crc32(buf) {
      let c = ~0;
      for (let i = 0; i < buf.length; i++) {
        c ^= buf[i];
        for (let j = 0; j < 8; j++) {
          c = (c >>> 1) ^ (-(c & 1) & 0xedb88320);
        }
      }
      return ~c >>> 0;
    }

    function makeChunk(type, data) {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length, 0);
      const typeBuf = Buffer.from(type, "ascii");
      const crcBuf = Buffer.alloc(4);
      crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
      return Buffer.concat([len, typeBuf, data, crcBuf]);
    }

    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // Bit depth
    ihdr[9] = 6; // Color type RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const png = Buffer.concat([
      signature,
      makeChunk("IHDR", ihdr),
      makeChunk("IDAT", deflated),
      makeChunk("IEND", Buffer.alloc(0)),
    ]);

    fs.writeFileSync(path.resolve(`extension/icon${size}.png`), png);
  });
}

createIconPNG(16);
createIconPNG(48);
createIconPNG(128);
