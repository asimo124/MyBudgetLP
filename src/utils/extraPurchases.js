/** Grouping and chart math for the Extra Purchases page. */

export const VIEW_MODES = ['both', 'lists', 'charts']

export const DEFAULT_SELECTED_PERIOD_COUNT = 2

export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function currency(value) {
  return `$${(Number(value) || 0).toFixed(2)}`
}

/**
 * Dates stay strings throughout: `new Date('2026-10-20')` parses as UTC and
 * shifts the day backwards in a negative-offset timezone.
 */
export function parseYmd(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? { year: match[1], month: match[2], day: match[3] } : null
}

export function formatDate(value) {
  const parts = parseYmd(value)
  return parts ? `${parts.month}/${parts.day}/${parts.year}` : value || '—'
}

export function shortDate(value) {
  const parts = parseYmd(value)
  return parts ? `${Number(parts.month)}/${Number(parts.day)}` : value || '—'
}

export function todayYmd(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function sumAmount(items) {
  return round2(items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0))
}

/** @returns {Map<number, object[]>} purchases per pay period, oldest first. */
export function groupByPayPeriod(items) {
  const map = new Map()
  for (const item of items) {
    if (!map.has(item.pay_period_id)) map.set(item.pay_period_id, [])
    map.get(item.pay_period_id).push(item)
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.purchase_date.localeCompare(b.purchase_date) || a.id - b.id)
  }
  return map
}

/**
 * The day axis is the pay period's own days plus any purchase dates filed
 * under it that fall outside that range, so a chart's total always matches
 * its list subtotal.
 */
export function chartDaysFor(period, periodItems) {
  const days = new Set(period.days || [])
  for (const item of periodItems) days.add(item.purchase_date)
  return [...days].sort()
}

export function purchasesForDay(periodItems, dayIso) {
  return periodItems.filter((item) => item.purchase_date === dayIso)
}

export function totalForDay(periodItems, dayIso) {
  return sumAmount(purchasesForDay(periodItems, dayIso))
}

export function payPeriodIdForDate(payPeriods, dateIso) {
  const period = payPeriods.find((p) => dateIso >= p.start_date && dateIso <= p.end_date)
  return period ? period.id : 0
}

/**
 * Pay periods offered in the paycheck filter: those that have already
 * started, plus any holding purchases. Newest first. Future pay periods are
 * excluded because `ip_pay_period` is generated a year ahead.
 */
export function selectablePayPeriods(payPeriods, itemsByPeriodId, today = todayYmd()) {
  return payPeriods
    .filter(
      (period) =>
        period.start_date <= today || (itemsByPeriodId.get(period.id) || []).length > 0
    )
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
}

/** Start dates of the N most recent selectable pay periods. */
export function defaultSelectedStartDates(selectable, count = DEFAULT_SELECTED_PERIOD_COUNT) {
  return selectable.slice(0, count).map((period) => period.start_date)
}

/**
 * The filter persists pay period start dates rather than ids: the legacy
 * IpPayPeriod::updatePayPeriods() routine deletes and reinserts rows, so ids
 * are not stable between runs and a saved id can later point at a different
 * paycheck. Returns null when nothing stored still applies, so the caller can
 * fall back to the default selection.
 */
export function resolveStoredSelection(stored, selectable) {
  if (!Array.isArray(stored)) return null
  const available = new Set(selectable.map((period) => period.start_date))
  const kept = stored.filter((startDate) => available.has(startDate))
  if (kept.length) return kept
  // An explicit empty selection is valid; vanished dates are not.
  return stored.length === 0 ? [] : null
}

/** Pay period ids whose start dates are in the current filter. */
export function selectedPeriodIds(payPeriods, selectedStartDates) {
  const selected = new Set(selectedStartDates)
  return payPeriods.filter((period) => selected.has(period.start_date)).map((period) => period.id)
}

/** Pay periods that have at least one purchase, oldest first. */
export function activePeriodsAscending(payPeriods, itemsByPeriodId) {
  return payPeriods
    .filter((period) => (itemsByPeriodId.get(period.id) || []).length > 0)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
}

/**
 * One pay period's list rows plus its chart, either the per-day totals or,
 * when `drillDay` is set, that day broken down by purchase.
 */
export function buildPeriodSection(period, periodItems, drillDay = null) {
  const days = chartDaysFor(period, periodItems)
  const section = {
    period,
    items: periodItems,
    subtotal: sumAmount(periodItems),
    days,
    drillDay,
  }

  if (drillDay) {
    const dayItems = purchasesForDay(periodItems, drillDay)
    section.chartTitle = `Purchases on ${formatDate(drillDay)}`
    section.categories = dayItems.map((item) => item.title)
    section.series = [{ name: 'Spent', data: dayItems.map((item) => round2(item.amount)) }]
    section.drillable = false
  } else {
    section.chartTitle = 'Spent per day'
    section.categories = days.map(shortDate)
    section.series = [{ name: 'Spent', data: days.map((day) => totalForDay(periodItems, day)) }]
    section.drillable = true
  }

  return section
}

/**
 * Stacked overview: one bar per pay period, segmented by day within it.
 * Pay periods cover different dates, so segments align by day index and are
 * named "Day N"; `labels[seriesIndex][pointIndex]` carries the real date for
 * the tooltip. All-empty day slots are dropped to keep the legend readable.
 */
export function buildOverviewChart(periods, itemsByPeriodId) {
  const periodDays = periods.map((period) =>
    chartDaysFor(period, itemsByPeriodId.get(period.id) || [])
  )
  const maxDays = periodDays.reduce((max, days) => Math.max(max, days.length), 0)

  const series = []
  const labels = []

  for (let dayIndex = 0; dayIndex < maxDays; dayIndex++) {
    const data = []
    const rowLabels = []
    for (let i = 0; i < periods.length; i++) {
      const dayIso = periodDays[i][dayIndex]
      const periodItems = itemsByPeriodId.get(periods[i].id) || []
      data.push(dayIso ? totalForDay(periodItems, dayIso) : 0)
      rowLabels.push(dayIso ? shortDate(dayIso) : '')
    }
    if (data.some((value) => value > 0)) {
      series.push({ name: `Day ${dayIndex + 1}`, data })
      labels.push(rowLabels)
    }
  }

  return {
    periods,
    categories: periods.map((period) => formatDate(period.start_date)),
    series,
    labels,
  }
}
