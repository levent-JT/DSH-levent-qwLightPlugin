// vendor/qr.mjs — 纯 JS QR 编码器
// 来源: ncm-player (github.com/WolfGenerals/ncm-player) 的 index.mjs，MIT 许可。
// 许可原文见 vendor/LICENSE.ncm-player-WolfGenerals。
// 改动: 仅加导出与 SVG data URL 封装（原实现返回模块矩阵）。
// 用途: 生成网易云扫码登录用的 data:image/svg+xml，免外部服务、不受页面 CSP 限制。
const qrEncode = (function () {
  const EXP_TABLE = new Uint8Array(512);
  const LOG_TABLE = new Uint8Array(256);
  (function initGF () { let x = 1; for (let i = 0; i < 255; i++) { EXP_TABLE[i] = x; LOG_TABLE[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP_TABLE[i] = EXP_TABLE[i - 255]; })();
  const gfMul = (x, y) => (x === 0 || y === 0) ? 0 : EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
  function polyMul (p1, p2) { const coeff = new Uint8Array(p1.length + p2.length - 1); for (let i = 0; i < p1.length; i++) for (let j = 0; j < p2.length; j++) coeff[i + j] ^= gfMul(p1[i], p2[j]); return coeff; }
  function polyMod (dividend, divisor) { let result = new Uint8Array(dividend); while (result.length - divisor.length >= 0) { const coeff = result[0]; for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], coeff); let offset = 0; while (offset < result.length && result[offset] === 0) offset++; result = result.slice(offset); } return result; }
  function generateECPolynomial (degree) { let poly = new Uint8Array([1]); for (let i = 0; i < degree; i++) poly = polyMul(poly, new Uint8Array([1, EXP_TABLE[i]])); return poly; }
  function rsEncode (data, degree) { const genPoly = generateECPolynomial(degree); const paddedData = new Uint8Array(data.length + degree); paddedData.set(data); const remainder = polyMod(paddedData, genPoly); const start = degree - remainder.length; if (start > 0) { const buff = new Uint8Array(degree); buff.set(remainder, start); return buff; } return remainder; }
  const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
  const EC_CODEWORDS_L = [0, 7, 10, 15, 20, 26, 36, 40, 48, 60, 72];
  const EC_BLOCKS_L = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4];
  const getSymbolSize = (version) => version * 4 + 17;
  function getRowColCoords (version) { if (version === 1) return []; const posCount = Math.floor(version / 7) + 2; const size = getSymbolSize(version); const intervals = Math.ceil((size - 13) / (2 * posCount - 2)) * 2; const positions = [size - 7]; for (let i = 1; i < posCount - 1; i++) positions[i] = positions[i - 1] - intervals; positions.push(6); return positions.reverse(); }
  function getAlignmentPositions (version) { const coords = []; const pos = getRowColCoords(version); const len = pos.length; for (let i = 0; i < len; i++) { for (let j = 0; j < len; j++) { if ((i === 0 && j === 0) || (i === 0 && j === len - 1) || (i === len - 1 && j === 0)) continue; coords.push([pos[i], pos[j]]); } } return coords; }
  function getBCHDigit (data) { let digit = 0; while (data !== 0) { digit++; data >>>= 1; } return digit; }
  const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
  const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);
  const G15_BCH = getBCHDigit(G15);
  function getFormatInfoBits (mask) { const data = (1 << 3) | mask; let d = data << 10; while (getBCHDigit(d) - G15_BCH >= 0) d ^= (G15 << (getBCHDigit(d) - G15_BCH)); return ((data << 10) | d) ^ G15_MASK; }
  function BitMatrix (size) { this.size = size; this.data = new Uint8Array(size * size); this.reservedBit = new Uint8Array(size * size); }
  BitMatrix.prototype.set = function (row, col, value, reserved) { const index = row * this.size + col; this.data[index] = value ? 1 : 0; if (reserved) this.reservedBit[index] = 1; };
  BitMatrix.prototype.get = function (row, col) { return this.data[row * this.size + col]; };
  BitMatrix.prototype.xor = function (row, col, value) { this.data[row * this.size + col] ^= value ? 1 : 0; };
  BitMatrix.prototype.isReserved = function (row, col) { return this.reservedBit[row * this.size + col] === 1; };
  function setupFinderPattern (matrix) { const size = matrix.size; const positions = [[0, 0], [size - 7, 0], [0, size - 7]]; for (let p = 0; p < positions.length; p++) { const row = positions[p][0]; const col = positions[p][1]; for (let r = -1; r <= 7; r++) { if (row + r <= -1 || size <= row + r) continue; for (let c = -1; c <= 7; c++) { if (col + c <= -1 || size <= col + c) continue; if ((r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6)) || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) { matrix.set(row + r, col + c, true, true); } else { matrix.set(row + r, col + c, false, true); } } } } }
  function setupTimingPattern (matrix) { const size = matrix.size; for (let r = 8; r < size - 8; r++) { const value = r % 2 === 0; matrix.set(r, 6, value, true); matrix.set(6, r, value, true); } }
  function setupAlignmentPattern (matrix, version) { const pos = getAlignmentPositions(version); for (let i = 0; i < pos.length; i++) { const row = pos[i][0]; const col = pos[i][1]; for (let r = -2; r <= 2; r++) { for (let c = -2; c <= 2; c++) { if (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0)) { matrix.set(row + r, col + c, true, true); } else { matrix.set(row + r, col + c, false, true); } } } } }
  function setupFormatInfo (matrix, maskPattern) { const size = matrix.size; const bits = getFormatInfoBits(maskPattern); for (let i = 0; i < 15; i++) { const mod = ((bits >> i) & 1) === 1; if (i < 6) matrix.set(i, 8, mod, true); else if (i < 8) matrix.set(i + 1, 8, mod, true); else matrix.set(size - 15 + i, 8, mod, true); if (i < 8) matrix.set(8, size - i - 1, mod, true); else if (i < 9) matrix.set(8, 15 - i - 1 + 1, mod, true); else matrix.set(8, 15 - i - 1, mod, true); } matrix.set(size - 8, 8, 1, true); }
  function setupData (matrix, data) { const size = matrix.size; let inc = -1; let row = size - 1; let bitIndex = 7; let byteIndex = 0; for (let col = size - 1; col > 0; col -= 2) { if (col === 6) col--; while (true) { for (let c = 0; c < 2; c++) { if (!matrix.isReserved(row, col - c)) { let dark = false; if (byteIndex < data.length) dark = (((data[byteIndex] >>> bitIndex) & 1) === 1); matrix.set(row, col - c, dark); bitIndex--; if (bitIndex === -1) { byteIndex++; bitIndex = 7; } } } row += inc; if (row < 0 || size <= row) { row -= inc; inc = -inc; break; } } } }
  const PENALTY_N1 = 3; const PENALTY_N2 = 3; const PENALTY_N3 = 40; const PENALTY_N4 = 10;
  function maskAt (pattern, i, j) { switch (pattern) { case 0: return (i + j) % 2 === 0; case 1: return i % 2 === 0; case 2: return j % 3 === 0; case 3: return (i + j) % 3 === 0; case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0; case 5: return (i * j) % 2 + (i * j) % 3 === 0; case 6: return ((i * j) % 2 + (i * j) % 3) % 2 === 0; default: return ((i * j) % 3 + (i + j) % 2) % 2 === 0; } }
  function applyMask (pattern, matrix) { const size = matrix.size; for (let col = 0; col < size; col++) { for (let row = 0; row < size; row++) { if (matrix.isReserved(row, col)) continue; matrix.xor(row, col, maskAt(pattern, row, col)); } } }
  function getPenaltyN1 (matrix) { const size = matrix.size; let points = 0; for (let row = 0; row < size; row++) { let sameCountCol = 0; let sameCountRow = 0; let lastCol = null; let lastRow = null; for (let col = 0; col < size; col++) { let module = matrix.get(row, col); if (module === lastCol) sameCountCol++; else { if (sameCountCol >= 5) points += PENALTY_N1 + (sameCountCol - 5); lastCol = module; sameCountCol = 1; } module = matrix.get(col, row); if (module === lastRow) sameCountRow++; else { if (sameCountRow >= 5) points += PENALTY_N1 + (sameCountRow - 5); lastRow = module; sameCountRow = 1; } } if (sameCountCol >= 5) points += PENALTY_N1 + (sameCountCol - 5); if (sameCountRow >= 5) points += PENALTY_N1 + (sameCountRow - 5); } return points; }
  function getPenaltyN2 (matrix) { const size = matrix.size; let points = 0; for (let row = 0; row < size - 1; row++) { for (let col = 0; col < size - 1; col++) { const last = matrix.get(row, col) + matrix.get(row, col + 1) + matrix.get(row + 1, col) + matrix.get(row + 1, col + 1); if (last === 4 || last === 0) points++; } } return points * PENALTY_N2; }
  function getPenaltyN3 (matrix) { const size = matrix.size; let points = 0; for (let row = 0; row < size; row++) { let bitsCol = 0; let bitsRow = 0; for (let col = 0; col < size; col++) { bitsCol = ((bitsCol << 1) & 0x7ff) | matrix.get(row, col); if (col >= 10 && (bitsCol === 0x5d0 || bitsCol === 0x05d)) points++; bitsRow = ((bitsRow << 1) & 0x7ff) | matrix.get(col, row); if (col >= 10 && (bitsRow === 0x5d0 || bitsRow === 0x05d)) points++; } } return points * PENALTY_N3; }
  function getPenaltyN4 (matrix) { let darkCount = 0; const total = matrix.data.length; for (let i = 0; i < total; i++) darkCount += matrix.data[i]; const k = Math.abs(Math.ceil((darkCount * 100 / total) / 5) - 10); return k * PENALTY_N4; }
  function getBestMask (matrix) { let bestPattern = 0; let lowerPenalty = Infinity; for (let p = 0; p < 8; p++) { setupFormatInfo(matrix, p); applyMask(p, matrix); const penalty = getPenaltyN1(matrix) + getPenaltyN2(matrix) + getPenaltyN3(matrix) + getPenaltyN4(matrix); applyMask(p, matrix); if (penalty < lowerPenalty) { lowerPenalty = penalty; bestPattern = p; } } return bestPattern; }
  function BitBuffer () { this.buffer = []; this.length = 0; }
  BitBuffer.prototype.put = function (num, length) { for (let i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) === 1); };
  BitBuffer.prototype.putBit = function (bit) { const bufIndex = Math.floor(this.length / 8); if (this.buffer.length <= bufIndex) this.buffer.push(0); if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8)); this.length++; };
  function getByteCapacity (version) { const total = TOTAL_CODEWORDS[version]; const ecTotal = EC_CODEWORDS_L[version]; const usableBits = (total - ecTotal) * 8 - 12; return Math.floor(usableBits / 8); }
  function getBestVersion (byteLength) { for (let v = 1; v <= 10; v++) if (byteLength <= getByteCapacity(v)) return v; throw new Error('qr: data too long'); }
  function createData (version, textBytes) { const buffer = new BitBuffer(); buffer.put(4, 4); buffer.put(textBytes.length, 8); for (let i = 0; i < textBytes.length; i++) buffer.put(textBytes[i], 8); const totalCodewords = TOTAL_CODEWORDS[version]; const ecTotal = EC_CODEWORDS_L[version]; const dataTotalBits = (totalCodewords - ecTotal) * 8; if (buffer.length + 4 <= dataTotalBits) buffer.put(0, 4); while (buffer.length % 8 !== 0) buffer.putBit(0); const remainingByte = (dataTotalBits - buffer.length) / 8; for (let i = 0; i < remainingByte; i++) buffer.put(i % 2 ? 0x11 : 0xec, 8); return createCodewords(buffer, version); }
  function createCodewords (bitBuffer, version) { const totalCodewords = TOTAL_CODEWORDS[version]; const ecTotal = EC_CODEWORDS_L[version]; const dataTotalCodewords = totalCodewords - ecTotal; const ecTotalBlocks = EC_BLOCKS_L[version]; const blocksInGroup2 = totalCodewords % ecTotalBlocks; const blocksInGroup1 = ecTotalBlocks - blocksInGroup2; const totalCodewordsInGroup1 = Math.floor(totalCodewords / ecTotalBlocks); const dataCodewordsInGroup1 = Math.floor(dataTotalCodewords / ecTotalBlocks); const dataCodewordsInGroup2 = dataCodewordsInGroup1 + 1; const ecCount = totalCodewordsInGroup1 - dataCodewordsInGroup1; let offset = 0; const dcData = []; const ecData = []; let maxDataSize = 0; const buffer = new Uint8Array(bitBuffer.buffer); for (let b = 0; b < ecTotalBlocks; b++) { const dataSize = b < blocksInGroup1 ? dataCodewordsInGroup1 : dataCodewordsInGroup2; dcData[b] = buffer.slice(offset, offset + dataSize); ecData[b] = rsEncode(dcData[b], ecCount); offset += dataSize; maxDataSize = Math.max(maxDataSize, dataSize); } const data = new Uint8Array(totalCodewords); let index = 0; for (let i = 0; i < maxDataSize; i++) { for (let r = 0; r < ecTotalBlocks; r++) if (i < dcData[r].length) data[index++] = dcData[r][i]; } for (let i = 0; i < ecCount; i++) { for (let r = 0; r < ecTotalBlocks; r++) data[index++] = ecData[r][i]; } return data; }
  function qrEncodeFn (text) { const encoder = new TextEncoder(); const textBytes = encoder.encode(text); const version = getBestVersion(textBytes.length); const dataBits = createData(version, textBytes); const moduleCount = getSymbolSize(version); const matrix = new BitMatrix(moduleCount); setupFinderPattern(matrix); setupTimingPattern(matrix); setupAlignmentPattern(matrix, version); setupFormatInfo(matrix, 0); setupData(matrix, dataBits); const mask = getBestMask(matrix); applyMask(mask, matrix); setupFormatInfo(matrix, mask); const modules = []; for (let r = 0; r < moduleCount; r++) { const row = []; for (let c = 0; c < moduleCount; c++) row.push(matrix.get(r, c) === 1); modules.push(row); } return { size: moduleCount, version: version, mask: mask, modules: modules }; }
  return qrEncodeFn;
})();
/**
 * 把文本渲染成 SVG data URL，可直接作为 <img src>。
 * 用 SVG 而非 PNG：Node 端零依赖，且浏览器原生支持。
 */
export function qrToSvgDataUrl(text, { margin = 4, dark = "#000000", light = "#ffffff", scale = 8 } = {}) {
  const qr = qrEncode(text)
  const n = qr.size
  const dim = (n + margin * 2) * scale
  const cells = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules[r][c]) {
        cells.push(
          '<rect x="' + (c + margin) * scale + '" y="' + (r + margin) * scale +
          '" width="' + scale + '" height="' + scale + '"/>'
        )
      }
    }
  }
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + dim + '" height="' + dim +
    '" viewBox="0 0 ' + dim + ' ' + dim + '" shape-rendering="crispEdges">' +
    '<rect width="' + dim + '" height="' + dim + '" fill="' + light + '"/>' +
    '<g fill="' + dark + '">' + cells.join('') + '</g></svg>'
  return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64')
}

export { qrEncode }
