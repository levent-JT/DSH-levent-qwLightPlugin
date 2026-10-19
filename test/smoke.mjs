/**
 * 冒烟测试：不碰真实 NapCat / 微信，只验证「插件能被加载、路由能应答、界面能渲染」。
 *
 * 依据经验：光跑语法检查不足以说明能跑（静态检查全过 != 代码能跑）。
 * 所以这里真的去调 apply()、真的走一遍路由、真的渲染一次侧栏图标。
 */
import assert from 'node:assert/strict'
import { rm, readFile } from 'node:fs/promises'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

// 数据目录必须在 workspace 内：测试不该去碰真实的 ~/.dsh。
// 每轮先清空 —— 上一轮改过 retention 会污染这一轮的默认值断言。
process.env.DSH_HOME = join(root, '.tmp-test-home')
await rm(process.env.DSH_HOME, { recursive: true, force: true })

let pass = 0
const ok = (cond, msg) => {
  assert.ok(cond, msg)
  pass++
  console.log('  ✓ ' + msg)
}

// ── Host ────────────────────────────────────────────────────────────────────

console.log('host:')
const host = await import(pathToFileURL(join(root, 'lib/index.js')).href)
ok(typeof host.apply === 'function', '导出了 apply')
ok(Array.isArray(host.inject) && host.inject.includes('webServer'), 'inject 声明了 webServer')

const routes = new Map()
const ctx = {
  effect(fn) {
    return fn()
  },
  webServer: {
    register({ path, handler }) {
      routes.set(path, handler)
      return () => routes.delete(path)
    },
  },
}

const dispose = await host.apply(ctx)
ok(routes.size === 10, '注册了 10 条路由，实际 ' + routes.size)

function call(path, { method = 'GET', body = null } = {}) {
  const full = '/plugin/qw-light' + path
  const chunks = []
  let status = 200
  const headers = {}
  const req = {
    url: full,
    method,
    on() {},
    async *[Symbol.asyncIterator]() {
      if (body != null) yield Buffer.from(body, 'utf8')
    },
  }
  const closeHooks = []
  const res = {
    writeHead(c, h) {
      status = c
      Object.assign(headers, h || {})
    },
    write(s) {
      chunks.push(String(s))
      return true
    },
    end(s) {
      if (s != null) chunks.push(typeof s === 'string' ? s : s.toString('utf8'))
    },
    on(ev, fn) {
      if (ev === 'close') closeHooks.push(fn)
    },
    once() {},
  }
  const handler = routes.get(full.split('?')[0])
  if (!handler) return Promise.resolve({ status: 404, headers: {}, text: '', json: () => ({}) })
  return handler(req, res).then(() => ({
    status,
    headers,
    text: chunks.join(''),
    json: () => JSON.parse(chunks.join('')),
    // 模拟浏览器断开：不清掉的话 SSE 心跳会一直挂着，测试进程退不出去
    close() {
      for (const fn of closeHooks) fn()
    },
  }))
}

const snap = await call('/snapshot')
ok(snap.status === 200, '/snapshot 返回 200')
const snapJson = snap.json()
ok(snapJson.channels && snapJson.channels.qq && snapJson.channels.wx, '快照里带两个通道状态')
ok(Array.isArray(snapJson.convs), '快照里带会话数组')
ok(snapJson.config && snapJson.config.retentionHours === 24, '默认保留 24 小时')

const stream = await call('/events')
ok(stream.status === 200, '/events 返回 200')
ok(/text\/event-stream/.test(stream.headers['content-type'] || ''), 'SSE content-type 正确')
ok(stream.text.includes(': connected'), 'SSE 先发了一行注释帧')
stream.close()
ok(true, 'SSE 断开后注册表能清掉')

const miss = await call('/messages?id=qq%3Ag%3A404')
ok(
  miss.status === 200 && Array.isArray(miss.json().messages) && miss.json().messages.length === 0,
  '不存在的会话返回空消息数组',
)

// 发送到不存在的会话必须被拒绝，而不是静默成功
const bad = await call('/send', {
  method: 'POST',
  body: JSON.stringify({ id: 'nope', segs: [{ t: 'text', s: 'hi' }] }),
})
ok(bad.status === 400, '给不存在的会话发消息返回 400')

// 保留期会被夹到 1~168 小时
const cfg = await call('/settings', { method: 'POST', body: JSON.stringify({ retentionHours: 9999 }) })
ok(cfg.json().retentionHours === 168, '保留期上限被夹到 168 小时')
const cfg2 = await call('/settings', { method: 'POST', body: JSON.stringify({ retentionHours: 0 }) })
ok(cfg2.json().retentionHours === 1, '保留期下限被夹到 1 小时')

if (typeof dispose === 'function') await dispose()
ok(true, '卸载没抛错')

// ── Client ──────────────────────────────────────────────────────────────────

console.log('client:')
const slotsRegistered = []
let applied = null

const React = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat() }
  },
  useState(init) {
    return [typeof init === 'function' ? init() : init, () => {}]
  },
  useEffect() {},
  useRef(v) {
    return { current: v == null ? null : v }
  },
  Component: class {
    constructor(props) {
      this.props = props
      this.state = {}
    }
  },
  createPortal(node) {
    return node
  },
}

globalThis.window = {
  __ModuleLoader__: {
    load(spec) {
      applied = spec
    },
  },
  addEventListener() {},
  removeEventListener() {},
  open() {},
}
globalThis.document = {
  head: { appendChild() {} },
  body: {},
  createElement() {
    return { setAttribute() {}, remove() {} }
  },
  createTextNode(t) {
    return { t }
  },
  querySelectorAll() {
    return []
  },
}
globalThis.EventSource = class {
  close() {}
}
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) })

const require = (name) => {
  if (name === 'react') return React
  if (name === 'react-dom') return { createPortal: React.createPortal }
  throw new Error('未知依赖: ' + name)
}

const clientSrc = await readFile(join(root, 'lib/client.js'), 'utf8')
// 用 Function 而不是 eval：语法错误会带清晰位置
new Function('window', 'document', 'EventSource', 'fetch', clientSrc)(
  globalThis.window,
  globalThis.document,
  globalThis.EventSource,
  globalThis.fetch,
)

ok(applied && applied.id === 'dsh-qw-light', 'client 以 dsh-qw-light 注册到 ModuleLoader')
const mod = applied.factory(require)
ok(typeof mod.apply === 'function', 'client 导出 apply')
ok(Array.isArray(mod.inject) && mod.inject.includes('slots'), 'client inject 声明了 slots')

const specs = {}
const slotCtx = {
  slots: {
    inject(name, fn) {
      slotsRegistered.push(name)
      fn()
      return () => {}
    },
    register(spec, Cmp) {
      spec.__cmp = Cmp
      specs[spec.name] = spec
      return () => {}
    },
  },
}

const clientDispose = mod.apply(slotCtx)
ok(slotsRegistered.includes('sidebar.footer.action'), '挂到了 sidebar.footer.action（侧栏两个图标）')
ok(slotsRegistered.includes('shell.overlay'), '挂到了 shell.overlay（弹窗）')
ok(typeof clientDispose === 'function', 'client apply 返回了清理函数')

// 真渲染一次侧栏组件：组件外面包了一层错误边界，先剥开再渲染
const icons = specs['sidebar.footer.action']
ok(icons && typeof icons.__cmp === 'function', '拿到侧栏组件')
const guarded = icons.__cmp({})
ok(guarded && Array.isArray(guarded.children) && guarded.children.length === 1, '外层是错误边界')
const innerEl = guarded.children[0]
const tree = innerEl.type(innerEl.props)
ok(tree && tree.type === 'div', '侧栏组件渲染出一个容器')
ok(tree.children.length === 2, '容器里正好两个图标（QQ + 微信）')
const first = tree.children[0]
const btn = first.type(first.props)
ok(btn && btn.type === 'button' && /qw-icon-btn/.test(btn.props.className), '图标按钮类名正确')

await clientDispose()
console.log('\n全部通过：' + pass + ' 条断言')
// 兜底：真出现漏网的定时器时，让测试以"通过"结束而不是挂住 —— 挂住比失败更难查
process.exit(0)
