window.__ModuleLoader__.load({
  id: "dsh-qw-light",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");
    var ReactDOM = require("react-dom");
    var __BUILD__ = "bd5b09c85e";

/* ==== src/client/icons.js ==== */
// 图标与基础元素助手。
// 全部内联 SVG，不引外部字体/图片 —— 「轻量」的第一条就是别为了两个图标去加载一个图标库。

const el = React.createElement

/** QQ：简化的企鹅头（身体 + 两只眼 + 喙）。currentColor 上色，未登录时由外层染灰。 */
function QqIcon(props) {
  const s = props && props.size ? props.size : 18
  return el(
    'svg',
    { width: s, height: s, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': 'true' },
    el('path', {
      d: 'M12 2.4c-3.7 0-6.3 2.7-6.3 6.2 0 1.1.2 2 .5 2.8-.6 1-.9 2.1-.9 3.1 0 .8.2 1.4.6 1.8.4.4 1 .6 1.7.6h8.8c.7 0 1.3-.2 1.7-.6.4-.4.6-1 .6-1.8 0-1-.3-2.1-.9-3.1.3-.8.5-1.7.5-2.8 0-3.5-2.6-6.2-6.3-6.2z',
    }),
    el('circle', { cx: '9.3', cy: '9', r: '1.55', fill: '#fff' }),
    el('circle', { cx: '14.7', cy: '9', r: '1.55', fill: '#fff' }),
    el('circle', { cx: '9.55', cy: '9.1', r: '0.75', fill: '#111' }),
    el('circle', { cx: '14.45', cy: '9.1', r: '0.75', fill: '#111' }),
    el('ellipse', { cx: '12', cy: '12.1', rx: '2.05', ry: '1.35', fill: '#f6a623' }),
  )
}

/** 微信：两个叠起来的对话气泡（经典形态），各带三个点。 */
function WxIcon(props) {
  const s = props && props.size ? props.size : 18
  return el(
    'svg',
    { width: s, height: s, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': 'true' },
    el('path', {
      d: 'M9.2 3.6C5.2 3.6 2 6.3 2 9.6c0 1.9 1 3.5 2.6 4.6l-.6 2 2.2-1.1c.9.3 1.9.4 2.9.4h.4a5.6 5.6 0 0 1-.2-1.5c0-3.2 3-5.8 6.9-5.8h.5C16.1 5.4 13 3.6 9.2 3.6zm-2.6 3.2a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9zm5.2 0a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9z',
    }),
    el('path', {
      d: 'M16.3 8.9c-3.4 0-6.1 2.2-6.1 5 0 2.7 2.7 5 6.1 5 .8 0 1.5-.1 2.2-.4l1.9 1-.5-1.7c1.3-.9 2.1-2.3 2.1-3.9 0-2.8-2.7-5-5.7-5zm-2.1 2.6a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6zm4.2 0a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6z',
    }),
  )
}

/** 头像：图片失败时退化成首字母色块，避免列表里出现一堆裂图。 */
function Avatar(props) {
  const { src, name, size = 34 } = props
  const [broken, setBroken] = React.useState(false)
  const text = String(name || '?').trim().slice(0, 1) || '?'
  const bg = 'hsl(' + (hashHue(String(name || '')) % 360) + ' 42% 34%)'
  if (!src || broken) {
    return el(
      'div',
      {
        className: 'qw-avatar qw-avatar-fallback',
        style: { width: size, height: size, background: bg, fontSize: Math.round(size * 0.42) },
      },
      text,
    )
  }
  return el('img', {
    className: 'qw-avatar',
    src,
    width: size,
    height: size,
    loading: 'lazy',
    referrerPolicy: 'no-referrer',
    onError: () => setBroken(true),
    alt: '',
  })
}

function hashHue(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

/** QQ 内置表情：id → 静态 gif，实测可用（cdn 直出，浏览器会缓存）。 */
function FaceImg(props) {
  const id = String(props.id || '')
  const size = props.size || 20
  if (!/^\d+$/.test(id)) return el('span', { className: 'qw-face-fallback' }, '[表情]')
  return el('img', {
    className: 'qw-face',
    src: 'https://qzonestyle.gtimg.cn/qzone/em/e' + id + '.gif',
    width: size,
    height: size,
    loading: 'lazy',
    referrerPolicy: 'no-referrer',
    alt: '[表情]',
    onError: (e) => {
      e.currentTarget.style.display = 'none'
    },
  })
}


/* ==== src/client/store.js ==== */
// 客户端状态与数据同步。
//
// 轻量约束体现在这里：**一条 SSE 常连**，不用轮询；面板关闭时只更新未读计数，
// 不做任何渲染以外的额外工作。SSE 不通时才退化成 5 秒轮询（有明确判据）。

const API = '/plugin/qw-light'

const store = {
  mode: 'init', // init | sse | poll
  channels: { qq: { status: 'off' }, wx: { status: 'off' } },
  convs: [],
  msgs: new Map(), // id → Message[]
  active: null,
  tab: 'qq',
  open: false,
  draft: '',
  emoji: false,
  busy: false,
  error: '',
  cfg: null,
}

const subs = new Set()

function emit() {
  for (const fn of subs) {
    try {
      fn()
    } catch {
      /* 单个订阅出错不影响其它 */
    }
  }
}

function useTick() {
  const [, force] = React.useState(0)
  React.useEffect(() => {
    const fn = () => force((v) => (v + 1) | 0)
    subs.add(fn)
    return () => subs.delete(fn)
  }, [])
}

async function api(path, opts) {
  const res = await fetch(API + path, {
    headers: { 'content-type': 'application/json' },
    ...opts,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json && json.error) || 'HTTP ' + res.status)
  return json
}

function upsertConv(conv) {
  if (!conv) return
  const i = store.convs.findIndex((c) => c.id === conv.id)
  if (i >= 0) store.convs[i] = conv
  else store.convs.push(conv)
  store.convs.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0))
}

function absorb(msg, conv) {
  if (!conv) return
  upsertConv(conv)
  const list = store.msgs.get(conv.id)
  if (list) {
    if (!list.some((m) => m.id === msg.id)) {
      list.push(msg)
      if (list.length > 300) list.splice(0, list.length - 300)
    }
  }
}

function unreadOf(channel) {
  return store.convs.filter((c) => c.channel === channel).reduce((n, c) => n + (c.unread || 0), 0)
}

// ── SSE / 轮询 ──────────────────────────────────────────────────────────────

let es = null
let gotEvent = false
let fallbackTimer = null
let pollTimer = null

function stopSync() {
  if (es) {
    try {
      es.close()
    } catch {
      /* ignore */
    }
    es = null
  }
  if (fallbackTimer) clearTimeout(fallbackTimer)
  fallbackTimer = null
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

function startSync() {
  stopSync()
  gotEvent = false

  // EventSource 自带重连，不需要我们管；只在「迟迟没有任何事件」时才判定它不可用
  try {
    es = new EventSource(API + '/events')
    es.onmessage = (ev) => {
      gotEvent = true
      if (store.mode !== 'sse') {
        store.mode = 'sse'
        emit()
      }
      let p = null
      try {
        p = JSON.parse(ev.data)
      } catch {
        return
      }
      onPush(p)
    }
    es.onerror = () => {
      // 交给浏览器重连；如果一直没数据，下面的兜底会切轮询
    }
  } catch {
    startPolling()
    return
  }

  fallbackTimer = setTimeout(() => {
    if (gotEvent) return
    // 8 秒一条事件都没有：SSE 很可能被中间层挡住，改用轮询
    startPolling()
  }, 8000)
}

function startPolling() {
  if (pollTimer) return
  store.mode = 'poll'
  emit()
  const tick = async () => {
    try {
      const snap = await api('/snapshot')
      applySnapshot(snap)
    } catch {
      /* 下一轮再试 */
    }
  }
  void tick()
  pollTimer = setInterval(tick, 5000)
}

function onPush(p) {
  if (!p || !p.t) return
  if (p.t === 'channels') {
    store.channels = p.channels
    emit()
  } else if (p.t === 'convs') {
    store.convs = p.convs || []
    emit()
  } else if (p.t === 'msg') {
    absorb(p.msg, p.conv)
    emit()
  }
}

function applySnapshot(snap) {
  store.channels = snap.channels || store.channels
  store.convs = snap.convs || []
  store.cfg = snap.config || store.cfg
  emit()
}

// ── 动作 ────────────────────────────────────────────────────────────────────

const actions = {
  open(tab) {
    store.open = true
    if (tab) store.tab = tab
    if (!store.active) {
      const first = store.convs.find((c) => c.channel === store.tab)
      if (first) void actions.select(first.id)
    }
    emit()
  },

  close() {
    store.open = false
    emit()
  },

  setTab(tab) {
    store.tab = tab
    const first = store.convs.find((c) => c.channel === tab)
    if (first) void actions.select(first.id)
    else {
      store.active = null
      emit()
    }
  },

  async select(id) {
    store.active = id
    store.draft = ''
    store.emoji = false
    emit()
    try {
      const r = await api('/messages?id=' + encodeURIComponent(id))
      store.msgs.set(id, r.messages || [])
      if (r.conv) upsertConv(r.conv)
    } catch (err) {
      store.error = String(err.message || err)
    }
    emit()
  },

  setDraft(v) {
    store.draft = v
    emit()
  },

  toggleEmoji() {
    store.emoji = !store.emoji
    emit()
  },

  insertFace(id) {
    store.draft = store.draft + '[face:' + id + ']'
    emit()
  },

  async send() {
    const id = store.active
    if (!id || store.busy) return
    const segs = parseDraft(store.draft)
    if (!segs.length) return
    store.busy = true
    store.error = ''
    emit()
    try {
      await api('/send', { method: 'POST', body: JSON.stringify({ id, segs }) })
      store.draft = ''
      store.emoji = false
    } catch (err) {
      store.error = String(err.message || err)
    } finally {
      store.busy = false
      emit()
    }
  },

  async reconnectQQ() {
    try {
      await api('/qq/reconnect', { method: 'POST' })
    } catch (err) {
      store.error = String(err.message || err)
    }
  },

  async wxLogin() {
    try {
      await api('/wx/login', { method: 'POST' })
    } catch (err) {
      store.error = String(err.message || err)
    }
  },

  async wxLogout() {
    try {
      await api('/wx/logout', { method: 'POST' })
    } catch (err) {
      store.error = String(err.message || err)
    }
  },

  async setRetention(hours) {
    try {
      store.cfg = await api('/settings', { method: 'POST', body: JSON.stringify({ retentionHours: hours }) })
    } catch (err) {
      store.error = String(err.message || err)
    }
    emit()
  },
}

/** 把输入框里的 `[face:14]` 拆成消息段。纯文本就是一段 text。 */
function parseDraft(text) {
  const out = []
  const re = /\[face:(\d+)\]/g
  let last = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ t: 'text', s: text.slice(last, m.index) })
    out.push({ t: 'face', id: m[1] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ t: 'text', s: text.slice(last) })
  return out.filter((s) => (s.t === 'text' ? s.s.length > 0 : true))
}


/* ==== src/client/ui.js ==== */
// 界面：侧栏图标 + 居中弹窗（列表 / 消息流 / 输入框 / 表情）。

const QQ_COLOR = '#12b7f5'
const WX_COLOR = '#07c160'

function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return sameDay ? p(d.getHours()) + ':' + p(d.getMinutes()) : p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

// ── 侧栏卡片：一个框里放两个通道 ─────────────────────────────────────────────
// 尺寸与风格照抄网易云侧栏卡片（CDP 实测 256×66，padding 10/14，圆角 12）。

function FooterBar() {
  useTick()
  return el(
    'div',
    { className: 'qw-card' },
    el(ChannelTile, { channel: 'qq' }),
    el(ChannelTile, { channel: 'wx' }),
  )
}

function ChannelTile(props) {
  const channel = props.channel
  const st = store.channels[channel] || {}
  const online = st.status === 'online'
  const n = unreadOf(channel)
  const color = channel === 'qq' ? QQ_COLOR : WX_COLOR
  const name = channel === 'qq' ? 'QQ' : '微信'
  const label =
    channel === 'qq'
      ? 'QQ · ' + (online ? st.nick || st.selfId || '已登录' : statusText(st))
      : '微信 · ' + (online ? '已登录' : statusText(st))
  return el(
    'button',
    {
      className: 'qw-tile' + (online ? ' qw-tile-on' : ''),
      style: online ? { borderColor: color + '66', background: color + '14', color } : undefined,
      title: label,
      'aria-label': label,
      onClick: () => actions.open(channel),
    },
    el('span', { className: 'qw-tile-ico' }, channel === 'qq' ? el(QqIcon, { size: 16 }) : el(WxIcon, { size: 16 })),
    el('span', { className: 'qw-tile-name' }, name),
    n > 0
      ? el('span', { className: 'qw-num', style: { background: online ? color : '#e5484d' } }, n > 99 ? '99+' : String(n))
      : null,
  )
}

function statusText(st) {
  switch (st && st.status) {
    case 'connecting':
      return '连接中…'
    case 'login':
      return '待扫码'
    case 'error':
      return '异常'
    default:
      return '未登录'
  }
}

// ── 弹窗 ────────────────────────────────────────────────────────────────────

function Panel() {
  useTick()
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && store.open) actions.close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!store.open) return null
  const tab = store.tab
  const ch = store.channels[tab] || {}
  const list = store.convs.filter((c) => c.channel === tab)

  return ReactDOM.createPortal(
    el(
      'div',
      { className: 'qw-mask', onMouseDown: (e) => { if (e.target === e.currentTarget) actions.close() } },
      el(
        'div',
        { className: 'qw-panel' },
        el(
          'div',
          { className: 'qw-head' },
          el('div', { className: 'qw-tabs' },
            tabBtn('qq', 'QQ', QQ_COLOR),
            tabBtn('wx', '微信', WX_COLOR),
          ),
          el('div', { className: 'qw-head-right' },
            el(RetentionPicker, {}),
            el('button', { className: 'qw-close', onClick: () => actions.close(), title: '关闭' }, '×'),
          ),
        ),
        el(
          'div',
          { className: 'qw-body' },
          el(ConvList, { list, channel: tab }),
          ch.status === 'online' ? el(Chat, {}) : el(LoginView, { channel: tab }),
        ),
      ),
    ),
    document.body,
  )
}

function tabBtn(id, label, color) {
  const on = store.tab === id
  return el(
    'button',
    {
      className: 'qw-tab' + (on ? ' qw-tab-on' : ''),
      style: on ? { color } : undefined,
      onClick: () => actions.setTab(id),
    },
    label,
  )
}

/** 记录保留期：这是「不假设长期使用」的旋钮，放在显眼处。 */
function RetentionPicker() {
  const cur = (store.cfg && store.cfg.retentionHours) || 24
  const opts = [
    [1, '1 小时'],
    [6, '6 小时'],
    [24, '1 天'],
    [72, '3 天'],
    [168, '7 天'],
  ]
  return el(
    'label',
    { className: 'qw-ret' },
    '记录保留',
    el(
      'select',
      { value: String(cur), onChange: (e) => actions.setRetention(Number(e.target.value)) },
      opts.map(([v, t]) => el('option', { key: v, value: String(v) }, t)),
    ),
  )
}

// ── 会话列表 ────────────────────────────────────────────────────────────────

function ConvList(props) {
  const list = props.list || []
  if (!list.length) {
    return el('div', { className: 'qw-list' }, el('div', { className: 'qw-empty' }, '还没有会话'))
  }
  return el(
    'div',
    { className: 'qw-list' },
    list.map((c) =>
      el(
        'div',
        {
          key: c.id,
          className: 'qw-conv' + (store.active === c.id ? ' qw-conv-on' : ''),
          onClick: () => actions.select(c.id),
        },
        el(Avatar, { src: c.avatar, name: c.name, size: 34 }),
        el(
          'div',
          { className: 'qw-conv-main' },
          el('div', { className: 'qw-conv-top' },
            el('span', { className: 'qw-conv-name' }, c.name || c.peerId),
            el('span', { className: 'qw-conv-time' }, fmtTime(c.lastTs)),
          ),
          el('div', { className: 'qw-conv-bottom' },
            el('span', { className: 'qw-conv-last' }, c.lastText || ''),
            c.unread > 0 ? el('span', { className: 'qw-dot' }, c.unread > 99 ? '99+' : String(c.unread)) : null,
          ),
        ),
      ),
    ),
  )
}

// ── 聊天区 ──────────────────────────────────────────────────────────────────

function Chat() {
  const id = store.active
  const msgs = (id && store.msgs.get(id)) || []
  const boxRef = React.useRef(null)
  const conv = store.convs.find((c) => c.id === id)

  // 新消息到 → 贴着底；不做逐帧动画
  React.useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 120
    if (near || msgs.length <= 1) box.scrollTop = box.scrollHeight
  }, [msgs.length, id])

  if (!id) return el('div', { className: 'qw-chat' }, el('div', { className: 'qw-empty' }, '选一个会话'))

  return el(
    'div',
    { className: 'qw-chat' },
    el('div', { className: 'qw-chat-head' },
      el('span', { className: 'qw-chat-name' }, conv ? conv.name : ''),
      conv && conv.type === 'group' ? el('span', { className: 'qw-tag' }, '群') : null,
    ),
    el('div', { className: 'qw-msgs', ref: boxRef },
      msgs.map((m) => el(MessageRow, { key: m.id, m, convId: id })),
      msgs.length === 0 ? el('div', { className: 'qw-empty' }, '暂无消息') : null,
    ),
    store.error ? el('div', { className: 'qw-err' }, store.error) : null,
    el(Composer, {}),
  )
}

function MessageRow(props) {
  const { m, convId } = props
  return el(
    'div',
    { className: 'qw-msg' + (m.self ? ' qw-msg-self' : '') },
    el(Avatar, { src: '', name: m.name || (m.self ? '我' : '?'), size: 30 }),
    el(
      'div',
      { className: 'qw-bubble-wrap' },
      m.self ? null : el('div', { className: 'qw-msg-name' }, m.name || ''),
      el('div', { className: 'qw-bubble' },
        (m.segs || []).map((s, i) => el(Seg, { key: i, s, i, convId, msgId: m.id })),
      ),
      el('div', { className: 'qw-msg-time' }, fmtTime(m.ts)),
    ),
  )
}

function Seg(props) {
  const { s, i, convId, msgId } = props
  switch (s.t) {
    case 'text':
      return el('span', { className: 'qw-text' }, s.s)
    case 'face':
      return el(FaceImg, { id: s.id, size: 22 })
    case 'image': {
      const src = s.url || (s.wx ? API + '/media?id=' + encodeURIComponent(convId) + '&i=' + i : '')
      if (!src) return el('span', { className: 'qw-text' }, '[图片]')
      return el('img', {
        className: 'qw-img',
        src,
        loading: 'lazy',
        referrerPolicy: 'no-referrer',
        alt: s.alt || '[图片]',
        onClick: () => window.open(src, '_blank'),
        onError: (e) => {
          e.currentTarget.replaceWith(document.createTextNode('[图片加载失败]'))
        },
      })
    }
    case 'voice':
      return el('span', { className: 'qw-text qw-muted' }, s.text ? '🎙 ' + s.text : '🎙 [语音]')
    case 'file':
      return el('span', { className: 'qw-text qw-muted' }, '📎 ' + (s.name || '[文件]'))
    case 'video':
      return el('span', { className: 'qw-text qw-muted' }, '🎬 [视频]')
    case 'at':
      return el('span', { className: 'qw-at' }, '@' + (s.name || s.qq))
    default:
      return el('span', { className: 'qw-text qw-muted' }, '[' + (s.label || '消息') + ']')
  }
}

// ── 输入框 ──────────────────────────────────────────────────────────────────

const FACES = [
  [14, '微笑'], [1, '撇嘴'], [2, '色'], [3, '发呆'], [4, '得意'], [5, '流泪'],
  [6, '害羞'], [7, '闭嘴'], [8, '睡'], [9, '大哭'], [10, '尴尬'], [11, '发怒'],
  [12, '调皮'], [13, '呲牙'], [15, '难过'], [16, '酷'], [17, '冷汗'], [18, '抓狂'],
  [19, '吐'], [20, '偷笑'], [21, '可爱'], [22, '白眼'], [23, '傲慢'], [24, '饥饿'],
  [25, '困'], [26, '惊恐'], [27, '流汗'], [28, '憨笑'], [29, '大兵'], [30, '奋斗'],
  [31, '咒骂'], [32, '疑问'], [33, '嘘'], [34, '晕'], [35, '折磨'], [36, '衰'],
  [37, '骷髅'], [38, '敲打'], [39, '再见'], [40, '擦汗'], [41, '抠鼻'], [42, '鼓掌'],
  [43, '糗大了'], [44, '坏笑'], [49, '委屈'], [50, '快哭了'], [51, '阴险'], [52, '亲亲'],
  [63, '玫瑰'], [66, '爱心'], [67, '心碎'], [74, '便便'], [76, '太阳'], [78, '拥抱'],
  [79, '强'], [80, '弱'], [81, '握手'], [82, '胜利'], [83, '抱拳'], [88, 'NO'],
  [89, 'OK'], [96, '磕头'], [99, '挥手'], [100, '激动'],
]

function Composer() {
  const conv = store.convs.find((c) => c.id === store.active)
  const isWx = conv && conv.channel === 'wx'
  const ref = React.useRef(null)

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void actions.send()
    }
  }

  return el(
    'div',
    { className: 'qw-composer' },
    store.emoji
      ? el(
          'div',
          { className: 'qw-emoji' },
          isWx
            ? el('div', { className: 'qw-empty' }, '微信通道不支持表情，只能发文字')
            : FACES.map(([id, name]) =>
                el('button', {
                  key: id,
                  className: 'qw-emoji-item',
                  title: name,
                  onClick: () => actions.insertFace(id),
                }, el(FaceImg, { id, size: 22 })),
              ),
        )
      : null,
    el(
      'div',
      { className: 'qw-input-row' },
      el('button', {
        className: 'qw-tool' + (store.emoji ? ' qw-tool-on' : ''),
        title: '表情',
        onClick: () => actions.toggleEmoji(),
        disabled: isWx,
      }, '☺'),
      el('textarea', {
        ref,
        className: 'qw-input',
        rows: 1,
        value: store.draft,
        placeholder: isWx ? '发消息（微信通道仅文字）' : '发消息，Enter 发送，Shift+Enter 换行',
        onChange: (e) => actions.setDraft(e.target.value),
        onKeyDown,
      }),
      el('button', {
        className: 'qw-send',
        disabled: store.busy || !store.draft.trim(),
        onClick: () => void actions.send(),
      }, store.busy ? '…' : '发送'),
    ),
  )
}

// ── 登录 / 未连接 ───────────────────────────────────────────────────────────

function LoginView(props) {
  const channel = props.channel
  const st = store.channels[channel] || {}

  if (channel === 'qq') {
    return el(
      'div',
      { className: 'qw-login' },
      el('div', { className: 'qw-login-title' }, 'QQ 需要 NapCat 才能登录'),
      el('div', { className: 'qw-login-hint' },
        '本插件没有直接登录 QQ 的能力 —— 它只是把「已经登录的 QQ」接过来显示。' +
        '登录这一步由 NapCat 完成，所以二维码在 NapCat 那边扫，不在这里。'),
      el('ol', { className: 'qw-steps' },
        el('li', {}, '下载并解压 NapCat（选 Shell 版，Windows 免安装）'),
        el('li', {}, '运行它，用手机 QQ 扫码登录 —— 二维码在 NapCat 自己的窗口里'),
        el('li', {}, 'NapCat 里新建「WebSocket 服务器」，端口 3001，然后就绪'),
        el('li', {}, '回到这里点「重试连接」，图标变蓝即可用'),
      ),
      el('div', { className: 'qw-kv' }, '当前地址：', el('code', {}, st.url || '—')),
      st.error ? el('div', { className: 'qw-err' }, st.error) : null,
      el('div', { className: 'qw-login-actions' },
        el('button', { className: 'qw-btn', onClick: () => actions.reconnectQQ() }, '重试连接'),
        el('button', {
          className: 'qw-btn qw-btn-ghost',
          onClick: () => window.open('https://github.com/NapNeko/NapCatQQ/releases', '_blank'),
        }, '下载 NapCat'),
        el('button', {
          className: 'qw-btn qw-btn-ghost',
          onClick: () => window.open('http://127.0.0.1:6099/webui', '_blank'),
        }, 'NapCat WebUI'),
      ),
    )
  }

  if (st.status === 'login' && st.qr && st.qr.dataUrl) {
    return el(
      'div',
      { className: 'qw-login' },
      el('div', { className: 'qw-login-title' }, '用手机微信扫码'),
      el('img', { className: 'qw-qr', src: st.qr.dataUrl, width: 240, height: 240, alt: '微信登录二维码' }),
      el('div', { className: 'qw-login-hint' }, '状态：' + (st.qr.status || 'wait') + '（二维码过期会自动换一张）'),
    )
  }

  return el(
    'div',
    { className: 'qw-login' },
    el('div', { className: 'qw-login-title' }, '微信未登录'),
    el('div', { className: 'qw-login-hint' },
      '走腾讯官方 iLink 通道（openclaw-weixin 协议），扫码即可，不需要申请 AppID。' +
      '注意：微信这条线只支持一对一聊天，没有群聊。'),
    st.error ? el('div', { className: 'qw-err' }, st.error) : null,
    el('div', { className: 'qw-login-actions' },
      el('button', { className: 'qw-btn', onClick: () => actions.wxLogin() }, '扫码登录'),
      store.channels.wx && store.channels.wx.status !== 'off'
        ? el('button', { className: 'qw-btn qw-btn-ghost', onClick: () => actions.wxLogout() }, '退出登录')
        : null,
    ),
  )
}


/* ==== src/client/main.js ==== */
// 客户端入口：注入样式、注册两个槽位、拉起数据同步。

const CSS = `
.qw-card{position:relative;width:100%;min-width:0;box-sizing:border-box;min-height:66px;
  display:flex;align-items:stretch;gap:0;padding:10px 8px;border-radius:12px;
  background:rgba(255,255,255,.045);
  border:1px solid rgba(255,255,255,.14);
  backdrop-filter:blur(14px) saturate(1.2);-webkit-backdrop-filter:blur(14px) saturate(1.2);
  box-shadow:0 1px 2px #0000000a;
  transition:border-color .16s cubic-bezier(.2,.8,.2,1),box-shadow .16s cubic-bezier(.2,.8,.2,1)}
.qw-card:hover{border-color:rgba(255,255,255,.22)}
.qw-tile{position:relative;flex:1 1 0;min-width:0;min-height:44px;box-sizing:border-box;
  display:flex;align-items:center;justify-content:center;gap:6px;padding:0 8px;
  border:none;background:transparent;border-radius:8px;cursor:pointer;
  color:#8b95a6;font:inherit;font-size:12px;font-weight:500;
  transition:background .16s,color .16s}
.qw-tile:hover{background:rgba(255,255,255,.07)}
/* 一个框两个分段：中间一条发丝分隔线，而不是各画一个边框 */
.qw-tile + .qw-tile::before{content:'';position:absolute;left:0;top:6px;bottom:6px;width:1px;
  background:rgba(255,255,255,.12);pointer-events:none}
.qw-tile-ico{display:flex;align-items:center;justify-content:center;flex:none}
.qw-tile-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qw-num{flex:none;min-width:16px;height:16px;padding:0 4px;border-radius:8px;color:#0b0f16;
  font-size:10px;line-height:16px;text-align:center;font-weight:700}

.qw-mask{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.45);
  display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)}
.qw-panel{width:880px;max-width:calc(100vw - 48px);height:600px;max-height:calc(100vh - 80px);
  display:flex;flex-direction:column;background:#151a24;border:1px solid rgba(255,255,255,.12);
  border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.55);overflow:hidden;color:#e6e9ef;
  font-size:13px;font-family:inherit}
.qw-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;
  border-bottom:1px solid rgba(255,255,255,.08);flex:none}
.qw-tabs{display:flex;gap:4px}
.qw-tab{border:none;background:transparent;color:#7c8698;font-size:13px;padding:5px 12px;border-radius:8px;cursor:pointer}
.qw-tab:hover{background:rgba(255,255,255,.06)}
.qw-tab-on{background:rgba(255,255,255,.09);font-weight:600}
.qw-head-right{display:flex;align-items:center;gap:10px}
.qw-ret{display:flex;align-items:center;gap:6px;color:#7c8698;font-size:12px}
.qw-ret select{background:#1e2530;color:#e6e9ef;border:1px solid rgba(255,255,255,.12);
  border-radius:6px;padding:2px 6px;font-size:12px}
.qw-close{border:none;background:transparent;color:#7c8698;font-size:20px;line-height:1;cursor:pointer;
  width:26px;height:26px;border-radius:7px}
.qw-close:hover{background:rgba(255,255,255,.08);color:#e6e9ef}
.qw-body{display:flex;flex:1;min-height:0}
.qw-list{width:258px;flex:none;border-right:1px solid rgba(255,255,255,.08);overflow-y:auto}
.qw-conv{display:flex;gap:10px;padding:9px 12px;cursor:pointer;align-items:center}
.qw-conv:hover{background:rgba(255,255,255,.05)}
.qw-conv-on{background:rgba(255,255,255,.09)}
.qw-conv-main{flex:1;min-width:0}
.qw-conv-top{display:flex;justify-content:space-between;gap:8px}
.qw-conv-name{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qw-conv-time{font-size:11px;color:#6b7280;flex:none}
.qw-conv-bottom{display:flex;justify-content:space-between;gap:8px;align-items:center}
.qw-conv-last{font-size:11.5px;color:#7c8698;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.qw-dot{background:#e5484d;color:#fff;border-radius:8px;font-size:10px;line-height:15px;padding:0 5px;flex:none}
.qw-avatar{border-radius:50%;object-fit:cover;flex:none;display:block}
.qw-avatar-fallback{display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600}

.qw-chat{flex:1;display:flex;flex-direction:column;min-width:0}
.qw-chat-head{display:flex;align-items:center;gap:8px;padding:9px 14px;
  border-bottom:1px solid rgba(255,255,255,.06);font-size:13px;flex:none}
.qw-chat-name{font-weight:600}
.qw-tag{font-size:10px;padding:1px 6px;border-radius:6px;background:rgba(255,255,255,.1);color:#9aa4b2}
.qw-msgs{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:12px}
.qw-msg{display:flex;gap:9px;align-items:flex-start}
.qw-msg-self{flex-direction:row-reverse}
.qw-bubble-wrap{max-width:66%;display:flex;flex-direction:column;gap:3px}
.qw-msg-self .qw-bubble-wrap{align-items:flex-end}
.qw-msg-name{font-size:11px;color:#7c8698}
.qw-bubble{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:10px;
  padding:7px 11px;line-height:1.5;word-break:break-word;white-space:pre-wrap}
.qw-msg-self .qw-bubble{background:rgba(18,183,245,.16);border-color:rgba(18,183,245,.28)}
.qw-msg-time{font-size:10.5px;color:#5b6472}
.qw-text{white-space:pre-wrap}
.qw-muted{color:#9aa4b2}
.qw-at{color:#4ea1ff}
.qw-face{vertical-align:-5px;margin:0 1px}
.qw-img{max-width:220px;max-height:220px;border-radius:8px;cursor:zoom-in;display:block;margin:2px 0}

.qw-composer{flex:none;border-top:1px solid rgba(255,255,255,.08);padding:8px 12px 10px}
.qw-input-row{display:flex;gap:8px;align-items:flex-end}
.qw-tool{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#9aa4b2;
  width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px;line-height:1;flex:none}
.qw-tool-on{background:rgba(255,255,255,.12);color:#e6e9ef}
.qw-tool:disabled{opacity:.35;cursor:not-allowed}
.qw-input{flex:1;resize:none;max-height:96px;background:rgba(255,255,255,.04);color:#e6e9ef;
  border:1px solid rgba(255,255,255,.1);border-radius:9px;padding:7px 10px;font:inherit;font-size:13px;
  outline:none;min-height:32px}
.qw-input:focus{border-color:rgba(255,255,255,.22)}
.qw-send{border:none;background:#12b7f5;color:#04121a;font-weight:600;border-radius:9px;
  padding:0 14px;height:30px;cursor:pointer;flex:none;font-size:12.5px}
.qw-send:disabled{opacity:.4;cursor:not-allowed}
.qw-emoji{display:grid;grid-template-columns:repeat(16,1fr);gap:2px;max-height:150px;overflow-y:auto;
  padding:6px;margin-bottom:6px;background:rgba(255,255,255,.03);border-radius:8px}
.qw-emoji-item{border:none;background:transparent;cursor:pointer;padding:3px;border-radius:5px;display:flex;
  align-items:center;justify-content:center}
.qw-emoji-item:hover{background:rgba(255,255,255,.1)}
.qw-face-fallback{color:#9aa4b2;font-size:12px}

.qw-login{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:12px;padding:24px;text-align:center}
.qw-login-title{font-size:15px;font-weight:600}
.qw-login-hint{color:#9aa4b2;font-size:12.5px;max-width:420px;line-height:1.7}
.qw-login-actions{display:flex;gap:8px;margin-top:6px}
.qw-btn{border:none;background:#12b7f5;color:#04121a;font-weight:600;border-radius:8px;padding:7px 14px;
  cursor:pointer;font-size:12.5px}
.qw-btn-ghost{background:rgba(255,255,255,.08);color:#e6e9ef}
.qw-qr{background:#fff;padding:8px;border-radius:10px}
.qw-kv{font-size:12px;color:#9aa4b2}
.qw-kv code{color:#e6e9ef}
.qw-steps{text-align:left;color:#9aa4b2;font-size:12.5px;line-height:1.85;margin:0;padding-left:22px;max-width:440px}
.qw-empty{color:#6b7280;font-size:12.5px;padding:16px;text-align:center}
.qw-err{color:#ff8a8a;font-size:12px;padding:6px 12px}
`

let cssEl = null

/** 幂等注入：热重载时先摘掉自己上一份，避免越积越多。 */
function injectCss() {
  removeCss()
  const style = document.createElement('style')
  style.setAttribute('data-plugin', 'dsh-qw-light')
  style.textContent = CSS
  document.head.appendChild(style)
  cssEl = style
  return () => {
    if (cssEl === style) {
      removeCss()
      cssEl = null
    }
  }
}

function removeCss() {
  for (const el of document.querySelectorAll('style[data-plugin="dsh-qw-light"]')) {
    try {
      el.remove()
    } catch {
      /* ignore */
    }
  }
}

/** 边界：组件抛错只该"这一块不显示"，不该把整个界面卸掉。 */
class Boundary extends React.Component {
  constructor(p) {
    super(p)
    this.state = { err: null }
  }
  static getDerivedStateFromError(err) {
    return { err }
  }
  componentDidCatch(err) {
    console.error('[qw-light] 界面出错:', err)
  }
  render() {
    if (this.state.err) {
      return el('div', { className: 'qw-err' }, '轻聊组件出错：' + String(this.state.err && this.state.err.message))
    }
    return this.props.children
  }
}

function guard(Cmp) {
  return function Guarded(props) {
    return el(Boundary, null, el(Cmp, props || {}))
  }
}

// apply / dispose 之间的竞态：bootstrap 是异步的，如果插件在它 await 期间就被卸载，
// 它醒来后还会建 SSE 连接和轮询定时器 —— 那就变成热重载后的一堆僵尸连接。
let disposed = false

async function bootstrap() {
  // 宿主可能还没就绪：重试几次，拿不到就让轮询兜底
  for (let i = 0; i < 5; i++) {
    if (disposed) return
    try {
      const snap = await api('/snapshot')
      if (disposed) return
      applySnapshot(snap)
      break
    } catch {
      await new Promise((r) => setTimeout(r, 800))
    }
  }
  if (disposed) return
  startSync()
}

const inject = ['slots']

function apply(ctx) {
  try {
    return applyInner(ctx)
  } catch (err) {
    console.error('[qw-light] apply 失败:', err)
    throw err
  }
}

function applyInner(ctx) {
  disposed = false
  const cssDispose = injectCss()
  void bootstrap()

  const slots = ctx.slots
  // 侧栏底部：QQ + 微信两个图标，和「今日消耗金额」「网易云」同一排
  slots.inject('sidebar.footer.action', () =>
    slots.register({ name: 'sidebar.footer.action', id: 'qw-light-icons', order: -5 }, guard(FooterBar)),
  )
  // 弹窗挂在 overlay 层，自己再 portal 到 body 保证定位不被容器样式影响
  slots.inject('shell.overlay', () =>
    slots.register({ name: 'shell.overlay', id: 'qw-light-panel', order: 900 }, guard(Panel)),
  )

  return () => {
    disposed = true
    stopSync()
    subs.clear()
    cssDispose()
  }
}

exports.apply = apply
exports.inject = inject


    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
