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
