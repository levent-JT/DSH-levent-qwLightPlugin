/**
 * 构建宿主产物 lib/index.js。
 *
 * 为什么要把 QR 编码器内联进去：DSH 加载插件时用的是包入口（lib/index.js），
 * 相对 import 能不能解析到兄弟文件，取决于宿主 loader 的实现 —— 那是我没有证据的。
 * 内联零风险，代价只是单文件大 14KB。
 */
import { readFile, writeFile, rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

const qr = (await readFile(join(root, 'vendor/qr.mjs'), 'utf8'))
  .replace(/^\/\/ vendor\/qr\.mjs[^\n]*\n/, '')
  .replace(/^export function qrToSvgDataUrl/m, 'function qrToSvgDataUrl')
  .replace(/\nexport\s*\{\s*qrEncode\s*\}\s*$/, '\n')

let main = await readFile(join(root, 'src/host/main.js'), 'utf8')
if (!main.includes('/*__QR__*/')) throw new Error('src/host/main.js 缺少 /*__QR__*/ 占位符')
main = main.replace('/*__QR__*/', qr.trim())

const header = `/* dsh-qw-light · 生成产物，请勿直接编辑 —— 源码在 src/host/main.js + vendor/qr.mjs */\n`
const out = header + main

// 产物自检：缺任何一段都宁可构建失败，别写半成品
for (const marker of ['export const inject', 'export async function apply', 'function qrToSvgDataUrl']) {
  if (!out.includes(marker)) throw new Error('产物缺少 ' + marker)
}

const target = join(root, 'lib/index.js')
await writeFile(target + '.tmp', out, 'utf8')
await rename(target + '.tmp', target)
console.log('built lib/index.js  bytes=' + Buffer.byteLength(out))
