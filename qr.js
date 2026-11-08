// qr.js: makes a QR code right inside the browser. It needs no internet and no outside website.
// It follows the QR Code standard (ISO 18004): text is stored as bytes, with error correction
// level M (or L for very long links), versions 1 to 10. That fits links up to about 210 letters.
//
// How to use:  qrSvg("https://example.com", "QR code for example")  gives back an <svg> picture
// that you can put inside innerHTML.

// For each version (1 to 10): how many error correction bytes per block, and how many blocks.
// Index 0 is not used.
const ECC_BYTES = {
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18]
};
const BLOCKS = {
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4]
};
const LEVEL_BITS = { M: 0, L: 1 }; // the 2 bits written in the format information

// ---------- Sizes ----------
function sizeOf(version) {
  return version * 4 + 17;
}

// How many little squares (modules) can hold data, after the fixed patterns are taken out.
function rawModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) {
      result -= 36;
    }
  }
  return result;
}

function dataBytesFor(version, level) {
  return Math.floor(rawModules(version) / 8) - ECC_BYTES[level][version] * BLOCKS[level][version];
}

// ---------- Error correction math (Reed-Solomon over GF(256)) ----------
function gfMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11D);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree) {
  const result = [];
  for (let i = 0; i < degree - 1; i++) {
    result.push(0);
  }
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) {
        result[j] ^= result[j + 1];
      }
    }
    root = gfMultiply(root, 2);
  }
  return result;
}

function rsRemainder(data, divisor) {
  const result = [];
  for (let i = 0; i < divisor.length; i++) {
    result.push(0);
  }
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ result.shift();
    result.push(0);
    for (let j = 0; j < divisor.length; j++) {
      result[j] ^= gfMultiply(divisor[j], factor);
    }
  }
  return result;
}

// ---------- Turn the text into data bytes ----------
function addBits(bits, value, count) {
  for (let i = count - 1; i >= 0; i--) {
    bits.push((value >>> i) & 1);
  }
}

function textToBytes(text) {
  const encoded = new TextEncoder().encode(text);
  const bytes = [];
  for (let i = 0; i < encoded.length; i++) {
    bytes.push(encoded[i]);
  }
  return bytes;
}

function countBits(version) {
  if (version < 10) {
    return 8;
  }
  return 16;
}

function makeDataBytes(bytes, version, level) {
  const capacityBits = dataBytesFor(version, level) * 8;
  const bits = [];
  addBits(bits, 4, 4); // 0100 = byte mode
  addBits(bits, bytes.length, countBits(version));
  for (let i = 0; i < bytes.length; i++) {
    addBits(bits, bytes[i], 8);
  }
  addBits(bits, 0, Math.min(4, capacityBits - bits.length)); // end marker
  addBits(bits, 0, (8 - (bits.length % 8)) % 8);
  let pad = 0xEC;
  while (bits.length < capacityBits) {
    addBits(bits, pad, 8);
    if (pad === 0xEC) {
      pad = 0x11;
    } else {
      pad = 0xEC;
    }
  }
  const result = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j++) {
      value = (value << 1) | bits[i + j];
    }
    result.push(value);
  }
  return result;
}

// Cut the data into blocks, add error correction bytes to each block, then weave the blocks together.
function addEccAndInterleave(data, version, level) {
  const numBlocks = BLOCKS[level][version];
  const eccLen = ECC_BYTES[level][version];
  const rawBytes = Math.floor(rawModules(version) / 8);
  const numShort = numBlocks - (rawBytes % numBlocks);
  const shortLen = Math.floor(rawBytes / numBlocks);

  const blocks = [];
  const divisor = rsDivisor(eccLen);
  let k = 0;
  for (let i = 0; i < numBlocks; i++) {
    let len = shortLen - eccLen;
    if (i >= numShort) {
      len = len + 1;
    }
    const part = data.slice(k, k + len);
    k += len;
    const ecc = rsRemainder(part, divisor);
    if (i < numShort) {
      part.push(0); // placeholder so every block is the same length (skipped below)
    }
    blocks.push(part.concat(ecc));
  }

  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < blocks.length; j++) {
      if (i !== shortLen - eccLen || j >= numShort) {
        result.push(blocks[j][i]);
      }
    }
  }
  return result;
}

// ---------- Draw the picture ----------
function alignPositions(version) {
  if (version === 1) {
    return [];
  }
  const numAlign = Math.floor(version / 7) + 2;
  const size = sizeOf(version);
  let step = Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  if (version === 32) {
    step = 26;
  }
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

function getBit(value, i) {
  return ((value >>> i) & 1) !== 0;
}

function emptyGrid(size, fill) {
  const grid = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      row.push(fill);
    }
    grid.push(row);
  }
  return grid;
}

// Write the 15 format bits (error level + mask number) in both places.
function drawFormat(modules, isFunction, size, level, mask) {
  const data = (LEVEL_BITS[level] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  const bits = ((data << 10) | rem) ^ 0x5412;

  function set(x, y, dark) {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  }

  for (let i = 0; i <= 5; i++) {
    set(8, i, getBit(bits, i));
  }
  set(8, 7, getBit(bits, 6));
  set(8, 8, getBit(bits, 7));
  set(7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i++) {
    set(14 - i, 8, getBit(bits, i));
  }
  for (let i = 0; i < 8; i++) {
    set(size - 1 - i, 8, getBit(bits, i));
  }
  for (let i = 8; i < 15; i++) {
    set(8, size - 15 + i, getBit(bits, i));
  }
  set(8, size - 8, true); // this square is always dark
}

// Finder squares, timing lines, alignment squares and version info: the fixed patterns.
function drawFixedPatterns(modules, isFunction, size, version) {
  function set(x, y, dark) {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  }

  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  function finder(cx, cy) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) {
          set(x, y, dist !== 2 && dist !== 4);
        }
      }
    }
  }
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);

  const pos = alignPositions(version);
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      const corner = (i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0);
      if (!corner) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      }
    }
  }

  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) {
      rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    }
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = getBit(bits, i);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }

  drawFormat(modules, isFunction, size, "M", 0); // only reserves the squares, it is redrawn later
}

// Place the data bytes in the zig-zag order the standard asks for.
function drawCodewords(modules, isFunction, size, data) {
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5;
    }
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        let y = vert;
        if (upward) {
          y = size - 1 - vert;
        }
        if (!isFunction[y][x] && i < data.length * 8) {
          modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }
}

// Flip the squares with one of the 8 mask patterns (it also undoes itself if you run it twice).
function applyMask(modules, isFunction, size, mask) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let flip = false;
      if (mask === 0) {
        flip = (x + y) % 2 === 0;
      } else if (mask === 1) {
        flip = y % 2 === 0;
      } else if (mask === 2) {
        flip = x % 3 === 0;
      } else if (mask === 3) {
        flip = (x + y) % 3 === 0;
      } else if (mask === 4) {
        flip = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      } else if (mask === 5) {
        flip = ((x * y) % 2) + ((x * y) % 3) === 0;
      } else if (mask === 6) {
        flip = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      } else {
        flip = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
      }
      if (!isFunction[y][x] && flip) {
        modules[y][x] = !modules[y][x];
      }
    }
  }
}

// ---------- Pick the mask that makes the code easiest to scan ----------
const FINDER_A = [true, false, true, true, true, false, true, false, false, false, false];
const FINDER_B = [false, false, false, false, true, false, true, true, true, false, true];

function sameAt(line, start, pattern) {
  for (let i = 0; i < pattern.length; i++) {
    if (line[start + i] !== pattern[i]) {
      return false;
    }
  }
  return true;
}

function linePenalty(line) {
  let score = 0;
  let run = 1;
  for (let i = 1; i < line.length; i++) {
    if (line[i] === line[i - 1]) {
      run++;
    } else {
      if (run >= 5) {
        score += run - 2;
      }
      run = 1;
    }
  }
  if (run >= 5) {
    score += run - 2;
  }
  for (let i = 0; i + 11 <= line.length; i++) {
    if (sameAt(line, i, FINDER_A)) {
      score += 40;
    }
    if (sameAt(line, i, FINDER_B)) {
      score += 40;
    }
  }
  return score;
}

function penalty(modules, size) {
  let score = 0;
  let dark = 0;
  for (let a = 0; a < size; a++) {
    const row = [];
    const col = [];
    for (let b = 0; b < size; b++) {
      row.push(modules[a][b]);
      col.push(modules[b][a]);
      if (modules[a][b]) {
        dark++;
      }
    }
    score += linePenalty(row) + linePenalty(col);
  }
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
        score += 3;
      }
    }
  }
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  return score + k * 10;
}

// ---------- Put it all together ----------
// Returns { size, modules } where modules[y][x] is true for a dark square.
function makeQr(text) {
  const bytes = textToBytes(text);
  const levels = ["M", "L"];
  let version = 0;
  let level = "";
  for (let l = 0; l < levels.length && version === 0; l++) {
    for (let v = 1; v <= 10 && version === 0; v++) {
      const needed = 4 + countBits(v) + bytes.length * 8;
      if (needed <= dataBytesFor(v, levels[l]) * 8) {
        version = v;
        level = levels[l];
      }
    }
  }
  if (version === 0) {
    throw new Error("The link is too long for this QR code maker.");
  }

  const size = sizeOf(version);
  const modules = emptyGrid(size, false);
  const isFunction = emptyGrid(size, false);
  drawFixedPatterns(modules, isFunction, size, version);
  const data = addEccAndInterleave(makeDataBytes(bytes, version, level), version, level);
  drawCodewords(modules, isFunction, size, data);

  let bestMask = 0;
  let bestScore = 999999;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(modules, isFunction, size, mask);
    drawFormat(modules, isFunction, size, level, mask);
    const score = penalty(modules, size);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
    }
    applyMask(modules, isFunction, size, mask); // undo
  }
  applyMask(modules, isFunction, size, bestMask);
  drawFormat(modules, isFunction, size, level, bestMask);

  return { size: size, modules: modules, version: version, level: level };
}

// The QR code as an SVG picture (black on white, with the 4-square quiet border scanners need).
export function qrSvg(text, label) {
  const qr = makeQr(text);
  const quiet = 4;
  const total = qr.size + quiet * 2;
  let path = "";
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) {
        path += "M" + (x + quiet) + " " + (y + quiet) + "h1v1h-1z";
      }
    }
  }
  return '<svg class="qrsvg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + " " + total +
    '" role="img" aria-label="' + label + '" shape-rendering="crispEdges">' +
    '<rect width="' + total + '" height="' + total + '" fill="#fff"/>' +
    '<path d="' + path + '" fill="#000"/></svg>';
}
