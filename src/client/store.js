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
