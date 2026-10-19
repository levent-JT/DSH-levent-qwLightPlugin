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
