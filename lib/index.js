/* dsh-qw-light · 生成产物，请勿直接编辑 —— 源码在 src/host/main.js + vendor/qr.mjs */
/**
 * dsh-qw-light · Host 半部
 *
 * 设计约束（用户定的，改动前先看）：
 *   1. 轻量。空闲时零轮询：QQ 用一条 WS 长连接，微信用官方长轮询（服务端 hold 35s），
 *      浏览器侧一条 SSE 常连。没有 tick、没有秒级 setInterval 刷界面。
 *   2. 聊天记录默认只留一天，可配 1 小时 ~ 7 天，绝不假设长期使用：
 *      内存 ring buffer 有上限，磁盘按天切文件、过期整文件删、总量封顶。
 *
 * 两条通道的协议依据：
 *   QQ   —— NapCat / OneBot 11（正向 WS）。事件与动作走同一条连接，不需要再配 HTTP。
 *   微信 —— 腾讯官方 @tencent-weixin/openclaw-weixin 的 iLink 协议（扫码 + 长轮询）。
 */

import { createDecipheriv, createHash } from 'node:crypto'
import { appendFile, mkdir, readdir, readFile, stat, unlink, writeFile, rename } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ROUTE = '/plugin/qw-light'
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const DATA_DIR = join(DSH_HOME, 'qw-light')
const CONFIG_FILE = join(DATA_DIR, 'config.json')
const STORE_DIR = join(DATA_DIR, 'store')

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
function qrToSvgDataUrl(text, { margin = 4, dark = "#000000", light = "#ffffff", scale = 8 } = {}) {
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

// ── 配置 ────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  qq: { enabled: true, wsUrl: 'ws://127.0.0.1:3001', token: '' },
  wx: { enabled: true, token: '', base: 'https://ilinkai.weixin.qq.com' },
  retentionHours: 24,
  persist: true,
}

const LIMITS = {
  // 内存上限：这些是"轻量"的具体数字，改大之前先想清楚
  messagesPerConversation: 300,
  conversations: 100,
  // 磁盘上限
  maxStoreBytes: 50 * 1024 * 1024,
  // 解密后的微信图片缓存
  mediaCacheEntries: 24,
}

let cfg = { ...DEFAULT_CONFIG }

function clampRetention(hours) {
  const n = Number(hours)
  if (!Number.isFinite(n)) return DEFAULT_CONFIG.retentionHours
  return Math.min(168, Math.max(1, Math.round(n)))
}

async function loadConfig() {
  let raw = null
  try {
    raw = JSON.parse(await readFile(CONFIG_FILE, 'utf8'))
  } catch {
    raw = null
  }
  const c = raw && typeof raw === 'object' ? raw : {}
  cfg = {
    ...DEFAULT_CONFIG,
    ...c,
    qq: { ...DEFAULT_CONFIG.qq, ...(c.qq || {}) },
    wx: { ...DEFAULT_CONFIG.wx, ...(c.wx || {}) },
    retentionHours: clampRetention(c.retentionHours ?? DEFAULT_CONFIG.retentionHours),
    persist: c.persist !== false,
  }
  return cfg
}

/** 原子写：先 .tmp 再 rename —— 被别人读的产物不能出现半截。 */
async function saveConfig(next) {
  cfg = {
    ...cfg,
    ...next,
    qq: { ...cfg.qq, ...(next.qq || {}) },
    wx: { ...cfg.wx, ...(next.wx || {}) },
  }
  if (next.retentionHours !== undefined) cfg.retentionHours = clampRetention(next.retentionHours)
  await mkdir(DATA_DIR, { recursive: true })
  const tmp = CONFIG_FILE + '.tmp'
  await writeFile(tmp, JSON.stringify(cfg, null, 2), 'utf8')
  await rename(tmp, CONFIG_FILE)
  return cfg
}

/** 对外的配置视图：token 不回显，只告诉"有没有"。 */
function configView() {
  return {
    qq: { enabled: cfg.qq.enabled, wsUrl: cfg.qq.wsUrl, hasToken: !!cfg.qq.token },
    wx: { enabled: cfg.wx.enabled, hasToken: !!cfg.wx.token },
    retentionHours: cfg.retentionHours,
    persist: cfg.persist,
  }
}

// ── 会话与消息 ───────────────────────────────────────────────────────────────

/** key → { key, channel, type, peerId, name, avatar, lastText, lastTs, unread, messages, contextToken, touched } */
const convs = new Map()
let convSeq = 0

function touch(conv) {
  conv.touched = ++convSeq
}

function getConv(key, init) {
  let c = convs.get(key)
  if (c) return c
  c = {
    key,
    channel: init.channel,
    type: init.type,
    peerId: String(init.peerId),
    name: init.name || String(init.peerId),
    avatar: init.avatar || '',
    lastText: '',
    lastTs: 0,
    unread: 0,
    messages: [],
    contextToken: '',
    touched: ++convSeq,
  }
  convs.set(key, c)
  evictConvs()
  return c
}

/** 会话数封顶：丢最久没活动的（不丢正在看的那个）。 */
function evictConvs() {
  if (convs.size <= LIMITS.conversations) return
  const sorted = [...convs.values()].sort((a, b) => a.touched - b.touched)
  const drop = sorted.slice(0, convs.size - LIMITS.conversations)
  for (const c of drop) if (c.key !== activeConv) convs.delete(c.key)
}

function convView(c) {
  return {
    id: c.key,
    channel: c.channel,
    type: c.type,
    peerId: c.peerId,
    name: c.name,
    avatar: c.avatar,
    lastText: c.lastText,
    lastTs: c.lastTs,
    unread: c.unread,
  }
}

function convList() {
  return [...convs.values()]
    .sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0))
    .map(convView)
}

// 当前客户端正在看的会话 —— 它不进后台未读、也不被淘汰
let activeConv = null

/** 一条消息：{ id, ts, self, name, text, segs } */
function pushMessage(conv, msg) {
  conv.messages.push(msg)
  if (conv.messages.length > LIMITS.messagesPerConversation) {
    conv.messages.splice(0, conv.messages.length - LIMITS.messagesPerConversation)
  }
  conv.lastTs = msg.ts
  conv.lastText = summaryOf(msg)
  touch(conv)
  if (!msg.self && conv.key !== activeConv) conv.unread += 1
  persist(channelOf(conv), conv.key, msg)
  broadcast({ t: 'msg', id: conv.key, msg, conv: convView(conv) })
}

function channelOf(conv) {
  return conv.channel
}

function summaryOf(msg) {
  const s = msg.text || ''
  return s.length > 60 ? s.slice(0, 60) + '…' : s
}

/** 把 segs 收敛成一句纯文本（列表预览、通知都用它）。 */
function segsToText(segs) {
  return (segs || [])
    .map((s) => {
      switch (s.t) {
        case 'text':
          return s.s
        case 'face':
          return '[表情]'
        case 'image':
          return '[图片]'
        case 'voice':
          return s.text ? `[语音] ${s.text}` : '[语音]'
        case 'file':
          return `[文件] ${s.name || ''}`
        case 'video':
          return '[视频]'
        case 'at':
          return `@${s.name || s.qq}`
        case 'quote':
          return ''
        default:
          return ''
      }
    })
    .join('')
    .trim()
}

// ── 持久化（按天切文件，过期整文件删） ────────────────────────────────────────

let pendingLines = []
let flushing = null

function dayKey(ts = Date.now()) {
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function persist(channel, convKey, msg) {
  if (!cfg.persist) return
  pendingLines.push(
    JSON.stringify({ c: convKey, t: msg.ts, s: msg.self ? 1 : 0, n: msg.name || '', x: msg.text || '', g: msg.segs }),
  )
  if (pendingLines.length >= 50) void flush()
}

/** 攒起来一起写，避免每来一条消息就碰一次磁盘。 */
async function flush() {
  if (flushing || pendingLines.length === 0) return flushing
  const lines = pendingLines
  pendingLines = []
  flushing = (async () => {
    try {
      const byFile = new Map()
      for (const line of lines) {
        let day
        try {
          day = dayKey(JSON.parse(line).t)
        } catch {
          continue
        }
        if (!byFile.has(day)) byFile.set(day, [])
        byFile.get(day).push(line)
      }
      for (const [day, ls] of byFile) {
        const dir = join(STORE_DIR, day)
        await mkdir(dir, { recursive: true })
        await appendFile(join(dir, 'messages.ndjson'), ls.join('\n') + '\n', 'utf8')
      }
    } catch (err) {
      // 落盘失败不能让聊天停摆 —— 内存里还在，只是重启后少一段
      console.error('[qw-light] 落盘失败:', String(err && err.message))
    } finally {
      flushing = null
      if (pendingLines.length >= 50) void flush()
    }
  })()
  return flushing
}

/** 启动时把保留期内的记录读回来。读的时候就有上限，不整目录吞。 */
async function restore() {
  let days = []
  try {
    days = (await readdir(STORE_DIR)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  } catch {
    return
  }
  const cutoff = Date.now() - cfg.retentionHours * 3600 * 1000
  const keep = days.filter((d) => new Date(d + 'T23:59:59').getTime() >= cutoff)
  let budget = 8000 // 最多读 8000 行，防止一天特别吵的群把启动拖住
  for (const day of keep) {
    if (budget <= 0) break
    let text = ''
    try {
      text = await readFile(join(STORE_DIR, day, 'messages.ndjson'), 'utf8')
    } catch {
      continue
    }
    const lines = text.split('\n').filter(Boolean).slice(-budget)
    budget -= lines.length
    for (const line of lines) {
      let r
      try {
        r = JSON.parse(line)
      } catch {
        continue
      }
      if (!r || !r.c || r.t < cutoff) continue
      const [channel, type, peerId] = String(r.c).split(':')
      const c = getConv(r.c, {
        channel,
        type: type === 'g' ? 'group' : 'private',
        peerId,
        name: '',
        avatar: '',
      })
      c.messages.push({ id: `${r.t}-${c.messages.length}`, ts: r.t, self: !!r.s, name: r.n, text: r.x, segs: r.g || [] })
    }
  }
  // 恢复完再补名字/头像，避免逐条查表
  for (const c of convs.values()) {
    applyIdentity(c)
    const last = c.messages[c.messages.length - 1]
    if (last) {
      c.lastTs = last.ts
      c.lastText = summaryOf(last)
    }
    c.messages = c.messages.slice(-LIMITS.messagesPerConversation)
  }
}

/** 删过期文件；再按总量封顶从旧到新删。 */
async function prune() {
  let days = []
  try {
    days = (await readdir(STORE_DIR)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  } catch {
    return
  }
  const cutoff = Date.now() - cfg.retentionHours * 3600 * 1000
  for (const day of days) {
    if (new Date(day + 'T23:59:59').getTime() < cutoff) {
      await rmDir(join(STORE_DIR, day))
    }
  }
  // 总量封顶
  let total = 0
  const sizes = []
  for (const day of days) {
    const p = join(STORE_DIR, day, 'messages.ndjson')
    try {
      const s = await stat(p)
      sizes.push([day, s.size])
      total += s.size
    } catch {
      /* 文件已被上一步删掉 */
    }
  }
  for (const [day] of sizes) {
    if (total <= LIMITS.maxStoreBytes) break
    const p = join(STORE_DIR, day, 'messages.ndjson')
    try {
      const s = await stat(p)
      total -= s.size
    } catch {
      /* ignore */
    }
    await rmDir(join(STORE_DIR, day))
  }
}

async function rmDir(dir) {
  try {
    for (const f of await readdir(dir)) await unlink(join(dir, f))
    await rmEmpty(dir)
  } catch {
    /* ignore */
  }
}

async function rmEmpty(dir) {
  try {
    await (await import('node:fs/promises')).rmdir(dir)
  } catch {
    /* ignore */
  }
}

// ── SSE 广播 ────────────────────────────────────────────────────────────────

const sseClients = new Set()

function broadcast(obj) {
  if (sseClients.size === 0) return
  const payload = `data: ${JSON.stringify(obj)}\n\n`
  for (const res of sseClients) {
    try {
      res.write(payload)
    } catch {
      sseClients.delete(res)
    }
  }
}

// ── 通道状态 ────────────────────────────────────────────────────────────────

const qq = {
  ws: null,
  status: 'off', // off | connecting | online | error
  error: '',
  selfId: 0,
  nickname: '',
  friends: new Map(),
  groups: new Map(),
  echo: 0,
  pending: new Map(),
  retry: 1000,
  timer: null,
  stopped: false,
}

const wx = {
  status: 'off', // off | login | online | error
  error: '',
  selfId: '',
  token: '',
  base: 'https://ilinkai.weixin.qq.com',
  buf: '',
  qr: null, // { qrcode, content, dataUrl, status }
  loginLoop: null,
  pollLoop: null,
  stopped: false,
  failures: 0,
}

function channelsView() {
  return {
    qq: {
      status: qq.status,
      error: qq.error,
      selfId: qq.selfId || null,
      nick: qq.nickname || '',
      url: cfg.qq.wsUrl,
    },
    wx: {
      status: wx.status,
      error: wx.error,
      selfId: wx.selfId || null,
      qr: wx.qr ? { dataUrl: wx.qr.dataUrl, status: wx.qr.status } : null,
    },
  }
}

function pushChannels() {
  broadcast({ t: 'channels', channels: channelsView() })
}

// ── QQ：OneBot 11 over WebSocket ────────────────────────────────────────────

function qqUrl() {
  const base = cfg.qq.wsUrl
  if (!cfg.qq.token) return base
  return base + (base.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(cfg.qq.token)
}

function qqConnect() {
  if (qq.stopped || !cfg.qq.enabled || !cfg.qq.wsUrl) return
  qqCleanupSocket()
  qq.status = 'connecting'
  qq.error = ''
  pushChannels()

  let ws
  try {
    ws = new WebSocket(qqUrl())
  } catch (err) {
    qq.status = 'error'
    qq.error = String(err && err.message)
    pushChannels()
    scheduleQQReconnect()
    return
  }
  qq.ws = ws

  ws.addEventListener('open', () => {
    qq.status = 'online'
    qq.error = ''
    qq.retry = 1000
    pushChannels()
    // 首屏需要的信息：自己是谁、好友表、群表
    void qqAction('get_login_info').then((d) => {
      qq.selfId = Number(d && d.user_id) || 0
      qq.nickname = (d && d.nickname) || ''
      applyAllIdentities()
      pushChannels()
    }).catch(() => {})
    void qqAction('get_friend_list').then((list) => {
      for (const f of list || []) qq.friends.set(String(f.user_id), f)
      applyAllIdentities()
      broadcast({ t: 'convs', convs: convList() })
    }).catch(() => {})
    void qqAction('get_group_list').then((list) => {
      for (const g of list || []) qq.groups.set(String(g.group_id), g)
      applyAllIdentities()
      broadcast({ t: 'convs', convs: convList() })
    }).catch(() => {})
  })

  ws.addEventListener('message', (ev) => {
    let payload
    try {
      payload = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data))
    } catch {
      return
    }
    if (payload && payload.echo !== undefined && qq.pending.has(String(payload.echo))) {
      const p = qq.pending.get(String(payload.echo))
      qq.pending.delete(String(payload.echo))
      clearTimeout(p.timer)
      if (payload.status === 'ok' || payload.retcode === 0) p.resolve(payload.data)
      else p.reject(new Error(payload.message || payload.wording || 'NapCat 返回失败'))
      return
    }
    onQQEvent(payload)
  })

  ws.addEventListener('close', () => {
    qq.ws = null
    if (qq.status === 'online') {
      qq.status = 'connecting'
      pushChannels()
    }
    if (!qq.stopped) scheduleQQReconnect()
  })

  ws.addEventListener('error', () => {
    // close 一定会跟着来，这里只记一句，不重复调度
    qq.error = '连接 NapCat 失败'
  })
}

function scheduleQQReconnect() {
  if (qq.stopped || !cfg.qq.enabled) return
  if (qq.timer) return
  const delay = qq.retry
  qq.retry = Math.min(30000, qq.retry * 2)
  qq.timer = setTimeout(() => {
    qq.timer = null
    qqConnect()
  }, delay)
}

function qqCleanupSocket() {
  if (!qq.ws) return
  try {
    qq.ws.close()
  } catch {
    /* ignore */
  }
  qq.ws = null
}

function qqAction(action, params) {
  const ws = qq.ws
  if (!ws || ws.readyState !== 1) return Promise.reject(new Error('NapCat 未连接'))
  const echo = String(++qq.echo)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      qq.pending.delete(echo)
      reject(new Error(`${action} 超时`))
    }, 15000)
    qq.pending.set(echo, { resolve, reject, timer })
    try {
      ws.send(JSON.stringify({ action, params: params || {}, echo }))
    } catch (err) {
      clearTimeout(timer)
      qq.pending.delete(echo)
      reject(err)
    }
  })
}

function onQQEvent(ev) {
  if (!ev || typeof ev !== 'object') return
  if (ev.post_type === 'message' || ev.post_type === 'message_sent') {
    onQQMessage(ev)
  } else if (ev.post_type === 'meta_event' && ev.meta_event_type === 'lifecycle') {
    if (ev.sub_type === 'connect') pushChannels()
  }
}

function onQQMessage(ev) {
  const self = Number(ev.self_id) || qq.selfId
  const sent = ev.post_type === 'message_sent'
  const isGroup = ev.message_type === 'group'
  const isSelf = sent || Number(ev.user_id) === self
  const peerId = isGroup ? String(ev.group_id) : String(sent ? ev.target_id : ev.user_id)
  if (!peerId || peerId === 'undefined') return

  const key = `qq:${isGroup ? 'g' : 'u'}:${peerId}`
  const conv = getConv(key, {
    channel: 'qq',
    type: isGroup ? 'group' : 'private',
    peerId,
    name: '',
    avatar: '',
  })
  applyIdentity(conv)

  const segs = qqSegs(ev.message)
  pushMessage(conv, {
    id: String(ev.message_id || `${ev.time}-${Math.random()}`),
    ts: (Number(ev.time) || Math.floor(Date.now() / 1000)) * 1000,
    self: isSelf,
    name: isSelf ? '我' : senderName(ev),
    text: segsToText(segs),
    segs,
  })
}

function senderName(ev) {
  const s = ev.sender || {}
  return s.card || s.nickname || String(ev.user_id || '')
}

function qqSegs(message) {
  const arr = Array.isArray(message)
    ? message
    : [{ type: 'text', data: { text: String(message == null ? '' : message) } }]
  const out = []
  for (const s of arr) {
    const d = (s && s.data) || {}
    switch (s && s.type) {
      case 'text':
        if (d.text) out.push({ t: 'text', s: String(d.text) })
        break
      case 'face':
        out.push({ t: 'face', id: String(d.id || '') })
        break
      case 'mface':
        out.push({ t: 'face', id: String(d.emoji_id || ''), mface: true })
        break
      case 'image':
        out.push({ t: 'image', url: String(d.url || ''), alt: String(d.summary || '') })
        break
      case 'at':
        out.push({ t: 'at', qq: String(d.qq || ''), name: String(d.name || '') })
        break
      case 'reply':
        out.push({ t: 'quote', id: String(d.id || '') })
        break
      case 'file':
        out.push({ t: 'file', name: String(d.file || d.name || '') })
        break
      case 'record':
        out.push({ t: 'voice', text: '', dur: 0 })
        break
      case 'video':
        out.push({ t: 'video' })
        break
      default:
        out.push({ t: 'unsupported', label: String((s && s.type) || '?') })
    }
  }
  return out.length ? out : [{ t: 'text', s: '' }]
}

function applyIdentity(conv) {
  if (conv.channel !== 'qq') return
  if (conv.type === 'group') {
    const g = qq.groups.get(conv.peerId)
    conv.name = (g && g.group_name) || conv.name || `群 ${conv.peerId}`
    conv.avatar = `https://p.qlogo.cn/gh/${conv.peerId}/${conv.peerId}/100`
  } else {
    const f = qq.friends.get(conv.peerId)
    conv.name = (f && (f.remark || f.nickname)) || conv.name || `QQ ${conv.peerId}`
    conv.avatar = `https://q1.qlogo.cn/g?b=qq&nk=${conv.peerId}&s=100`
  }
}

function applyAllIdentities() {
  for (const c of convs.values()) applyIdentity(c)
}

// ── 微信：iLink（腾讯官方 openclaw-weixin 协议） ─────────────────────────────

const WX_DEFAULT_BASE = 'https://ilinkai.weixin.qq.com'
const WX_CDN = 'https://novac2c.cdn.weixin.qq.com/c2c'
const WX_APP_ID = 'bot'
const WX_CLIENT_VERSION = '0x0002040a' // 2.4.10

function wxUin() {
  return Buffer.from(String(Math.floor(Math.random() * 0xffffffff)), 'utf8').toString('base64')
}

/** 扫码阶段用：要 AuthorizationType / X-WECHAT-UIN，但不要 Authorization。 */
function wxQrHeaders() {
  return {
    'content-type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    'X-WECHAT-UIN': wxUin(),
    'iLink-App-Id': WX_APP_ID,
    'iLink-App-ClientVersion': WX_CLIENT_VERSION,
  }
}

/** 轮询扫码状态用：带上 App 头，但不带 Authorization 系列。 */
function wxStatusHeaders() {
  return {
    'content-type': 'application/json',
    'iLink-App-Id': WX_APP_ID,
    'iLink-App-ClientVersion': WX_CLIENT_VERSION,
  }
}

/** 业务接口用：全量头 + Bearer。 */
function wxHeaders(token) {
  return {
    'content-type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    'X-WECHAT-UIN': wxUin(),
    'iLink-App-Id': WX_APP_ID,
    'iLink-App-ClientVersion': WX_CLIENT_VERSION,
    authorization: `Bearer ${token || wx.token}`,
  }
}

function wxBaseInfo() {
  return { channel_version: '2.4.10', bot_agent: 'dsh-qw-light/0.1.0' }
}

async function wxPost(path, body, { token, headers, timeout = 45000 } = {}) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeout)
  try {
    const res = await fetch((wx.base || WX_DEFAULT_BASE) + path, {
      method: 'POST',
      headers: headers || wxHeaders(token),
      body: JSON.stringify(body),
      signal: ac.signal,
    })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    return { ok: res.ok, status: res.status, json, text }
  } finally {
    clearTimeout(timer)
  }
}

function wxBusinessError(r) {
  if (!r.ok) return `http-${r.status}`
  const b = r.json
  if (!b || typeof b !== 'object') return null
  for (const field of ['ret', 'errcode', 'code']) {
    const v = b[field]
    if (typeof v === 'number' && v !== 0) return `${field}=${v}`
    if (typeof v === 'string' && v !== '' && v !== '0') return `${field}=${v}`
  }
  return null
}

async function wxStartLogin() {
  wx.status = 'login'
  wx.error = ''
  wx.qr = { status: 'wait', dataUrl: '', qrcode: '', content: '' }
  pushChannels()
  try {
    const r = await wxPost('/ilink/bot/get_bot_qrcode?bot_type=3', { local_token_list: [] }, {
      headers: wxQrHeaders(),
      timeout: 20000,
    })
    const d = r.json || {}
    if (!d.qrcode) throw new Error('拿二维码失败：' + String(r.text).slice(0, 120))
    const content = d.qrcode_img_content || d.qrcode
    wx.qr = {
      qrcode: String(d.qrcode),
      content: String(content),
      dataUrl: qrToSvgDataUrl(String(content), { size: 240 }),
      status: 'wait',
    }
    pushChannels()
    if (!wx.loginLoop) wx.loginLoop = wxLoginLoop()
  } catch (err) {
    wx.status = 'error'
    wx.error = String(err && err.message)
    pushChannels()
  }
}

async function wxLoginLoop() {
  while (!wx.stopped && wx.qr && wx.status === 'login') {
    let d = null
    try {
      const res = await fetch(
        `${wx.base || WX_DEFAULT_BASE}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(wx.qr.qrcode)}`,
        { headers: wxStatusHeaders(), signal: AbortSignal.timeout(40000) },
      )
      d = await res.json()
    } catch {
      d = null // 长轮询超时是正常的，继续等
    }
    if (wx.stopped) break
    const st = (d && d.status) || 'wait'
    if (wx.qr) wx.qr.status = st
    if (st === 'confirmed' && d && d.bot_token) {
      wx.token = String(d.bot_token)
      wx.selfId = String(d.ilink_bot_id || '')
      if (d.baseurl) wx.base = String(d.baseurl).replace(/\/$/, '')
      wx.status = 'online'
      wx.qr = null
      wx.buf = ''
      wx.failures = 0
      await saveConfig({ wx: { token: wx.token, base: wx.base } }).catch(() => {})
      pushChannels()
      if (!wx.pollLoop) wx.pollLoop = wxPollLoop()
      return
    }
    if (st === 'expired' || st === 'verify_code_blocked') {
      // 过期就换一张，让人能继续扫
      wx.status = 'login'
      await wxStartLogin()
      return
    }
    pushChannels()
  }
}

async function wxPollLoop() {
  while (!wx.stopped && wx.status === 'online') {
    let r
    try {
      r = await wxPost(
        '/ilink/bot/getupdates',
        { get_updates_buf: wx.buf || '', base_info: wxBaseInfo() },
        { timeout: 45000 },
      )
    } catch {
      wx.failures += 1
      await sleep(Math.min(30000, 2000 * wx.failures))
      continue
    }
    if (wx.stopped) break
    const bad = wxBusinessError(r)
    if (bad) {
      wx.failures += 1
      wx.error = `收消息失败 ${bad}`
      pushChannels()
      await sleep(Math.min(30000, 2000 * wx.failures))
      continue
    }
    wx.failures = 0
    const d = r.json || {}
    if (typeof d.get_updates_buf === 'string' && d.get_updates_buf) wx.buf = d.get_updates_buf
    for (const m of Array.isArray(d.msgs) ? d.msgs : []) {
      if (m && m.message_type === 1) onWxMessage(m)
    }
  }
}

function onWxMessage(m) {
  const peer = String(m.from_user_id || '')
  if (!peer) return
  const key = `wx:u:${peer}`
  const conv = getConv(key, {
    channel: 'wx',
    type: 'private',
    peerId: peer,
    name: `微信 ${peer.slice(-6)}`,
    avatar: '',
  })
  // 回复必须原样带 context_token，所以按会话存最近一条
  if (m.context_token) conv.contextToken = String(m.context_token)

  const segs = []
  for (const it of Array.isArray(m.item_list) ? m.item_list : []) {
    const t = it && it.type
    if (t === 1) {
      const s = it.text_item && it.text_item.text
      if (s) segs.push({ t: 'text', s: String(s) })
    } else if (t === 2) {
      segs.push({
        t: 'image',
        url: '',
        wx: {
          full: String((it.image_item && it.image_item.media && it.image_item.media.full_url) || ''),
          q: String((it.image_item && it.image_item.media && it.image_item.media.encrypt_query_param) || ''),
          aes: String((it.image_item && it.image_item.aeskey) || (it.image_item && it.image_item.media && it.image_item.media.aes_key) || ''),
        },
      })
    } else if (t === 3) {
      segs.push({
        t: 'voice',
        text: String((it.voice_item && it.voice_item.text) || ''),
        dur: Number((it.voice_item && it.voice_item.playtime) || 0),
      })
    } else if (t === 4) {
      segs.push({ t: 'file', name: String((it.file_item && it.file_item.file_name) || '') })
    } else if (t === 5) {
      segs.push({ t: 'video' })
    } else {
      segs.push({ t: 'unsupported', label: 'item' + t })
    }
  }
  if (!segs.length) return

  pushMessage(conv, {
    id: String(m.message_id || `${m.create_time_ms}-${Math.random()}`),
    ts: Number(m.create_time_ms) || Date.now(),
    self: false,
    name: conv.name,
    text: segsToText(segs),
    segs,
  })
}

async function wxSend(conv, segs) {
  if (wx.status !== 'online') throw new Error('微信未登录')
  const text = (segs || [])
    .filter((s) => s.t === 'text')
    .map((s) => s.s)
    .join('')
  if (!text.trim()) throw new Error('微信只支持发送文字和图片')
  const body = {
    msg: {
      from_user_id: '',
      to_user_id: conv.peerId,
      // 每条出站必须唯一：复用同一个 client_id 会让客户端当成同一条消息的更新而不显示
      client_id: `qwlight:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      message_type: 2,
      message_state: 2,
      context_token: conv.contextToken || '',
      item_list: [{ type: 1, text_item: { text } }],
    },
    base_info: wxBaseInfo(),
  }
  const r = await wxPost('/ilink/bot/sendmessage', body, { timeout: 20000 })
  const bad = wxBusinessError(r)
  if (bad) throw new Error('发送被拒：' + bad)
}

// ── 微信图片：按需下载 + AES-128-ECB 解密 ────────────────────────────────────

const mediaCache = new Map() // key → { buf, type, ts }

function mediaKey(id, idx) {
  return `${id}#${idx}`
}

function cacheGet(key) {
  const v = mediaCache.get(key)
  if (!v) return null
  mediaCache.delete(key)
  mediaCache.set(key, v)
  return v
}

function cachePut(key, val) {
  mediaCache.set(key, val)
  while (mediaCache.size > LIMITS.mediaCacheEntries) {
    const first = mediaCache.keys().next().value
    mediaCache.delete(first)
  }
}

function aesDecrypt(buf, aeskey) {
  const raw = String(aeskey || '')
  let key
  if (/^[0-9a-fA-F]{32}$/.test(raw)) key = Buffer.from(raw, 'hex')
  else {
    try {
      key = Buffer.from(raw, 'base64')
    } catch {
      key = null
    }
  }
  if (!key || key.length !== 16) return buf // 没有可用密钥就当明文
  try {
    const d = createDecipheriv('aes-128-ecb', key, null)
    d.setAutoPadding(true)
    return Buffer.concat([d.update(buf), d.final()])
  } catch {
    return buf
  }
}

async function fetchWxImage(seg) {
  const info = seg.wx || {}
  const url = info.full || (info.q ? `${WX_CDN}/download?encrypted_query_param=${encodeURIComponent(info.q)}` : '')
  if (!url) throw new Error('这条消息没带图片地址')
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error('下载图片失败 http-' + res.status)
  const buf = Buffer.from(await res.arrayBuffer())
  return aesDecrypt(buf, info.aes)
}

// ── 对外动作 ────────────────────────────────────────────────────────────────

async function sendTo(convKey, segs) {
  const conv = convs.get(String(convKey))
  if (!conv) throw new Error('会话不存在')
  if (conv.channel === 'qq') {
    const message = (segs || []).map((s) => {
      if (s.t === 'text') return { type: 'text', data: { text: s.s } }
      if (s.t === 'face') return { type: 'face', data: { id: String(s.id) } }
      return null
    }).filter(Boolean)
    if (!message.length) throw new Error('没有可发送的内容')
    if (conv.type === 'group') await qqAction('send_group_msg', { group_id: Number(conv.peerId), message })
    else await qqAction('send_private_msg', { user_id: Number(conv.peerId), message })
  } else {
    await wxSend(conv, segs)
  }
  // 自己发的也进本地记录，界面立刻能看见（NapCat 若开了 reportSelfMessage 会再来一条，
  // 用 message_id 去重不够稳，所以这里按「文本 + 3 秒内」做一次轻量去重）
  const text = segsToText(segs)
  const dup = conv.messages.some(
    (m) => m.self && m.text === text && Math.abs(Date.now() - m.ts) < 3000,
  )
  if (!dup) {
    pushMessage(conv, {
      id: `local-${Date.now()}`,
      ts: Date.now(),
      self: true,
      name: '我',
      text,
      segs,
    })
  }
  return true
}

// ── HTTP 路由 ───────────────────────────────────────────────────────────────

function sendJson(res, obj, code = 200) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

async function readBody(req, limit = 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > limit) throw new Error('请求过大')
    chunks.push(c)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function sseHandler(req, res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })
  res.write(': connected\n\n')
  res.write(`data: ${JSON.stringify({ t: 'channels', channels: channelsView() })}\n\n`)
  sseClients.add(res)
  req.on('close', () => sseClients.delete(res))
  // 心跳：25 秒一行注释，防止中间层掐断空闲连接
  const ping = setInterval(() => {
    try {
      res.write(': p\n\n')
    } catch {
      clearInterval(ping)
      sseClients.delete(res)
    }
  }, 25000)
  res.on('close', () => clearInterval(ping))
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1')
  const sub = url.pathname.slice(ROUTE.length) || '/'
  const method = req.method || 'GET'

  if (sub === '/events' && method === 'GET') return sseHandler(req, res)

  if (sub === '/snapshot' && method === 'GET') {
    return sendJson(res, {
      channels: channelsView(),
      convs: convList(),
      config: configView(),
      active: activeConv,
    })
  }

  if (sub === '/messages' && method === 'GET') {
    const id = url.searchParams.get('id') || ''
    const conv = convs.get(id)
    if (!conv) return sendJson(res, { messages: [] })
    activeConv = id
    conv.unread = 0
    return sendJson(res, { messages: conv.messages, conv: convView(conv) })
  }

  if (sub === '/read' && method === 'POST') {
    const body = JSON.parse((await readBody(req)) || '{}')
    const conv = convs.get(String(body.id || ''))
    if (conv) conv.unread = 0
    activeConv = body.id && body.id !== null ? String(body.id) : null
    return sendJson(res, { ok: true })
  }

  if (sub === '/send' && method === 'POST') {
    const body = JSON.parse((await readBody(req)) || '{}')
    try {
      await sendTo(body.id, Array.isArray(body.segs) ? body.segs : [])
      return sendJson(res, { ok: true })
    } catch (err) {
      return sendJson(res, { ok: false, error: String(err && err.message) }, 400)
    }
  }

  if (sub === '/qq/reconnect' && method === 'POST') {
    qq.retry = 1000
    qqConnect()
    return sendJson(res, { ok: true })
  }

  if (sub === '/wx/login' && method === 'POST') {
    wx.stopped = false
    wx.status = 'off'
    wx.qr = null
    void wxStartLogin()
    return sendJson(res, { ok: true })
  }

  if (sub === '/wx/logout' && method === 'POST') {
    wx.status = 'off'
    wx.token = ''
    wx.qr = null
    wx.buf = ''
    pushChannels()
    await saveConfig({ wx: { token: '' } }).catch(() => {})
    return sendJson(res, { ok: true })
  }

  if (sub === '/settings') {
    if (method === 'GET') return sendJson(res, configView())
    const body = JSON.parse((await readBody(req)) || '{}')
    const next = {}
    if (body.retentionHours !== undefined) next.retentionHours = body.retentionHours
    if (body.persist !== undefined) next.persist = !!body.persist
    if (body.qq) next.qq = { enabled: !!body.qq.enabled, wsUrl: body.qq.wsUrl, token: body.qq.token }
    await saveConfig(next)
    // 配置变了：按需重连重扫
    if (body.qq) {
      qqCleanupSocket()
      qq.stopped = false
      qq.retry = 1000
      qqConnect()
    }
    void prune()
    return sendJson(res, configView())
  }

  if (sub === '/media' && method === 'GET') {
    const id = url.searchParams.get('id') || ''
    const idx = Number(url.searchParams.get('i') || 0)
    const conv = convs.get(id)
    const msg = conv && conv.messages.find((m) => m.segs && m.segs[idx] && m.segs[idx].t === 'image')
    const seg = msg && msg.segs[idx]
    if (!seg) return sendJson(res, { error: 'not found' }, 404)
    const mk = mediaKey(msg.id, idx)
    const hit = cacheGet(mk)
    if (hit) {
      res.writeHead(200, { 'content-type': hit.type, 'cache-control': 'private, max-age=600' })
      return res.end(hit.buf)
    }
    try {
      const buf = await fetchWxImage(seg)
      cachePut(mk, { buf, type: sniffType(buf), ts: Date.now() })
      res.writeHead(200, { 'content-type': sniffType(buf), 'cache-control': 'private, max-age=600' })
      return res.end(buf)
    } catch (err) {
      return sendJson(res, { error: String(err && err.message) }, 502)
    }
  }

  return sendJson(res, { error: 'not found: ' + sub }, 404)
}

function sniffType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf.length > 12 && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (buf.length > 4 && buf.toString('ascii', 0, 3) === 'GIF') return 'image/gif'
  return 'application/octet-stream'
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 插件入口 ────────────────────────────────────────────────────────────────

const ROUTES = ['/events', '/snapshot', '/messages', '/read', '/send', '/qq/reconnect', '/wx/login', '/wx/logout', '/settings', '/media']

export const inject = ['webServer']

export async function apply(ctx) {
  await loadConfig()
  wx.token = cfg.wx.token || ''
  wx.base = cfg.wx.base || WX_DEFAULT_BASE

  await ensureDirs()
  await restore()
  await prune()

  // 攒批落盘：30 秒一次，且只在真有待写数据时才动作
  const flushTimer = setInterval(() => void flush(), 30000)
  // 定时清理：一小时一次，成本可忽略
  const pruneTimer = setInterval(() => void prune(), 3600 * 1000)

  ctx.effect(() => {
    const disposers = ROUTES.map((p) =>
      ctx.webServer.register({
        kind: 'exact',
        path: ROUTE + p,
        handler: async (req, res) => {
          try {
            await handle(req, res)
          } catch (err) {
            try {
              sendJson(res, { error: String((err && err.message) || err) }, 500)
            } catch {
              /* 响应已发 */
            }
          }
        },
      }),
    )
    return () => {
      for (const d of disposers) {
        try {
          if (typeof d === 'function') d()
        } catch {
          /* 清理失败不影响卸载 */
        }
      }
    }
  })

  qq.stopped = false
  qqConnect()
  if (wx.token) {
    wx.status = 'online'
    wx.pollLoop = wxPollLoop()
  }

  return async () => {
    // 卸载必须清干净：连接、定时器、SSE —— 热重载一次就多一份的话，「轻量」就是假的
    clearInterval(flushTimer)
    clearInterval(pruneTimer)
    qq.stopped = true
    if (qq.timer) clearTimeout(qq.timer)
    qq.timer = null
    qqCleanupSocket()
    for (const [, p] of qq.pending) clearTimeout(p.timer)
    qq.pending.clear()
    wx.stopped = true
    wx.loginLoop = null
    wx.pollLoop = null
    for (const res of sseClients) {
      try {
        res.end()
      } catch {
        /* ignore */
      }
    }
    sseClients.clear()
    await flush()
  }
}

async function ensureDirs() {
  await mkdir(STORE_DIR, { recursive: true })
}
