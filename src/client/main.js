// 客户端入口：注入样式、注册两个槽位、拉起数据同步。

const CSS = `
.qw-foot{display:flex;gap:6px;align-items:center;padding:2px 0}
.qw-icon-btn{position:relative;width:30px;height:30px;display:flex;align-items:center;justify-content:center;
  border:1px solid rgba(255,255,255,.10);border-radius:9px;background:rgba(255,255,255,.04);
  color:#7c8698;cursor:pointer;padding:0;transition:color .15s,background .15s,border-color .15s}
.qw-icon-btn:hover{background:rgba(255,255,255,.09);border-color:rgba(255,255,255,.18)}
.qw-icon-btn.qw-on{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.2)}
.qw-badge{position:absolute;top:-5px;right:-5px;min-width:15px;height:15px;padding:0 4px;border-radius:8px;
  background:#e5484d;color:#fff;font-size:10px;line-height:15px;text-align:center;font-weight:600;
  box-shadow:0 0 0 2px rgba(18,22,30,.9)}

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
