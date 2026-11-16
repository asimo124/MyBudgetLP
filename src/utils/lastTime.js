export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Days the "Earlier" button moves the calendar back each press. */
export const DAYS_BACK_STEP = 90

/** Local date as YYYY-MM-DD (not UTC, so late-evening clicks keep the right day). */
export function todayYmd(now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** "Mon, Nov 16, 2026" */
export function formatLongDate(ymd) {
  if (!ymd) return ''
  return parseYmd(ymd).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Whole days from ymd to today (positive = in the past). */
export function daysAgo(ymd, today = todayYmd()) {
  const ms = parseYmd(today) - parseYmd(ymd)
  return Math.round(ms / 86400000)
}

export function relativeDays(ymd, today = todayYmd()) {
  const n = daysAgo(ymd, today)
  if (n === 0) return 'today'
  if (n === 1) return 'yesterday'
  if (n === -1) return 'tomorrow'
  return n > 0 ? `${n} days ago` : `in ${-n} days`
}

/** Black or white text, whichever reads better on a hex background. */
export function textColorOn(hex) {
  let h = String(hex || '').trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) return '#fff'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#000' : '#fff'
}

export function badgeStyle(color) {
  const bg = String(color || '').trim() || '#9e9e9e'
  return { backgroundColor: bg, color: textColorOn(bg) }
}
