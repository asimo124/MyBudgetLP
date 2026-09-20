export const GANTT_MONTH_PX = 44
export const GANTT_COLORS = [
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#4f46e5',
  '#059669',
  '#ea580c',
]

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function buildPayoffGantt(barsInput) {
  const empty = { bars: [], months: [], years: [], timelineWidth: 0 }
  const source = Array.isArray(barsInput) ? barsInput.filter((bar) => bar?.start && bar?.end) : []
  if (!source.length) return empty

  const bars = source.map((bar, index) => ({
    ...bar,
    color: bar.color || GANTT_COLORS[index % GANTT_COLORS.length],
  }))

  const rangeStart = new Date(bars[0].start.getFullYear(), bars[0].start.getMonth(), 1)
  bars.forEach((bar) => {
    const start = new Date(bar.start.getFullYear(), bar.start.getMonth(), 1)
    if (start < rangeStart) rangeStart.setTime(start.getTime())
  })

  const lastEnd = bars.reduce((latest, bar) => (bar.end > latest ? bar.end : latest), bars[0].end)
  const rangeEnd = new Date(lastEnd.getFullYear(), lastEnd.getMonth() + 1, 1)
  const months = []
  const monthCursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
  while (monthCursor < rangeEnd) {
    months.push({
      year: monthCursor.getFullYear(),
      month: monthCursor.getMonth(),
      label: MONTH_LABELS[monthCursor.getMonth()],
      isYearStart: monthCursor.getMonth() === 0,
    })
    monthCursor.setMonth(monthCursor.getMonth() + 1)
  }

  const years = []
  months.forEach((month) => {
    const last = years[years.length - 1]
    if (last && last.year === month.year) last.span += 1
    else years.push({ year: month.year, span: 1 })
  })

  const rangeStartMs = rangeStart.getTime()
  const rangeMs = Math.max(rangeEnd.getTime() - rangeStartMs, 1)
  bars.forEach((bar) => {
    const startMs = Math.max(bar.start.getTime(), rangeStartMs)
    const endMs = Math.max(bar.end.getTime(), startMs + 1)
    bar.leftPct = ((startMs - rangeStartMs) / rangeMs) * 100
    bar.widthPct = Math.max(((endMs - startMs) / rangeMs) * 100, 1.5)
    bar.endLabel = `${MONTH_LABELS[bar.end.getMonth()]} ${bar.end.getFullYear()}`
  })

  return {
    bars,
    months,
    years,
    timelineWidth: months.length * GANTT_MONTH_PX,
  }
}
