/**
 * 构建客户端产物 lib/client.js。
 *
 * DSH 只能加载一个自包含的 client 文件，所以这里把 src/client/*.js 按 PARTS 顺序
 * 拼进同一个 factory 作用域。**后面的分片能用前面的普通声明，反过来不行。**
 *
 * 产物必须原子写：DSH 会监听这个文件热重载，读到半截 JS 会直接「插件加载失败」。
 */
import { readFile, writeFile, rename } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

const PARTS = ['icons.js', 'store.js', 'ui.js', 'main.js']

const HEADER = `window.__ModuleLoader__.load({
  id: "dsh-qw-light",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");
    var ReactDOM = require("react-dom");
`

const FOOTER = `
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
`

let body = ''
for (const part of PARTS) {
  body += `\n/* ==== src/client/${part} ==== */\n`
  body += await readFile(join(root, 'src/client', part), 'utf8')
  body += '\n'
}

const build = createHash('sha256').update(body).digest('hex').slice(0, 10)
const out = HEADER + `    var __BUILD__ = "${build}";\n` + body + FOOTER

for (const marker of ['exports.apply', 'function apply', 'window.__ModuleLoader__']) {
  if (!out.includes(marker)) throw new Error('产物缺少 ' + marker)
}

const target = join(root, 'lib/client.js')
await writeFile(target + '.tmp', out, 'utf8')
await rename(target + '.tmp', target)
console.log('built lib/client.js  build=' + build + '  bytes=' + Buffer.byteLength(out))
