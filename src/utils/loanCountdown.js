export const LOAN_COUNTDOWN_STORAGE_KEY = 'loanCountdownForm'
export const ORIGINAL_DEBT_GOAL = 36000

export function debtFreeProgressPercent(remainingDebt, originalDebtGoal = ORIGINAL_DEBT_GOAL) {
  const remaining = Number(remainingDebt)
  const goal = Number(originalDebtGoal)
  if (!Number.isFinite(remaining) || !Number.isFinite(goal) || goal <= 0) return 0
  const paid = goal - Math.max(0, remaining)
  const pct = (paid / goal) * 100
  return Math.max(0, Math.min(100, Math.round(pct)))
}

export function towardOriginalBalancePercent(remaining, originalBalance) {
  const orig = Number(originalBalance)
  if (!Number.isFinite(orig) || orig <= 0) return null
  const rem = Number(remaining)
  if (!Number.isFinite(rem)) return null
  const paid = orig - Math.max(0, rem)
  return Math.max(0, Math.min(100, Math.round((paid / orig) * 100)))
}
export const LOAN_SLOT_COUNT = 5
export const LOAN_SLOT_FIELDS = [
  'name',
  'remaining_balance',
  'original_balance',
  'adjust_disposable_per_paycheck1',
  'adjust_disposable_per_paycheck15',
  'min_to_principal',
  'minimum_payment_percent',
  'day_of_month',
]

export function emptyLoanSlot() {
  return {
    name: '',
    remaining_balance: null,
    original_balance: null,
    adjust_disposable_per_paycheck1: null,
    adjust_disposable_per_paycheck15: null,
    min_to_principal: null,
    minimum_payment_percent: null,
    day_of_month: null,
  }
}

export function emptyLoanExtras() {
  return {
    adjust_disposable_per_paycheck1: null,
    adjust_disposable_per_paycheck15: null,
    minimum_payment_percent: null,
    day_of_month: null,
  }
}

export function defaultLoanFormState() {
  return {
    disposable_per_paycheck1: null,
    disposable_per_paycheck15: null,
    already_spent_on_first_paycheck: null,
    already_spent_on_second_paycheck: null,
    original_debt_goal: ORIGINAL_DEBT_GOAL,
    starting_month: '',
    push_to_next_paycheck: false,
  }
}

export function loanSlotHasData(slot) {
  if (!slot) return false
  if (slot.name != null && String(slot.name).trim() !== '') return true
  const numberFields = [
    'remaining_balance',
    'original_balance',
    'adjust_disposable_per_paycheck1',
    'adjust_disposable_per_paycheck15',
    'min_to_principal',
    'minimum_payment_percent',
    'day_of_month',
  ]
  return numberFields.some((field) => {
    const v = slot[field]
    return v !== null && v !== undefined && v !== ''
  })
}

export function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100
}

export function startOfLocalDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return startOfLocalDay(x)
}

export function parseStartYm(startYm) {
  const parts = String(startYm).split('-')
  const y = parseInt(parts[0], 10)
  const m0 = parseInt(parts[1], 10) - 1
  if (!Number.isFinite(y) || !Number.isFinite(m0)) return null
  return { y, m0 }
}

export function listPaycheckDatesFromPlanStart(startYm, maxEvents) {
  const parsed = parseStartYm(startYm)
  if (!parsed) return []
  let yy = parsed.y
  let mm = parsed.m0
  const out = []
  while (out.length < maxEvents) {
    out.push(startOfLocalDay(new Date(yy, mm, 1)))
    if (out.length >= maxEvents) break
    out.push(startOfLocalDay(new Date(yy, mm, 15)))
    if (out.length >= maxEvents) break
    mm += 1
    if (mm > 11) {
      mm = 0
      yy += 1
    }
  }
  return out
}

export function formatPaycheckDateLabel(d) {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function applyMinPrincipalAccrualsInWindow(bals, loansCfg, lastExclusive, endInclusive) {
  let d = addDays(startOfLocalDay(lastExclusive), 1)
  const end = startOfLocalDay(endInclusive)
  while (d.getTime() <= end.getTime()) {
    const yy = d.getFullYear()
    const mm = d.getMonth()
    const dim = new Date(yy, mm + 1, 0).getDate()
    const dayDom = d.getDate()
    for (let bi = 0; bi < bals.length; bi++) {
      if (bals[bi] <= 0) continue
      const cfg = loansCfg[bi]
      if (!cfg) continue
      const reqDom = cfg.dom
      if (!Number.isFinite(reqDom) || reqDom < 1 || reqDom > 31) continue
      const targetDom = Math.min(Math.floor(reqDom), dim)
      if (dayDom !== targetDom) continue
      const minP = cfg.minP
      if (!Number.isFinite(minP) || minP <= 0) continue
      const pay = roundMoney(Math.min(bals[bi], minP))
      bals[bi] = roundMoney(Math.max(0, bals[bi] - pay))
    }
    d = addDays(d, 1)
  }
}

/** Monthly min-payment dollars freed when principal drops (percent of balance). */
export function minPaymentFreedMonthly(principalPaid, minimumPaymentPercent) {
  const paid = Number(principalPaid)
  const pct = Number(minimumPaymentPercent)
  if (!Number.isFinite(paid) || paid <= 0 || !Number.isFinite(pct) || pct <= 0) {
    return 0
  }
  return roundMoney(paid * (pct / 100))
}

/** Split accumulated extra monthly disposable across the 1st and 15th paychecks. */
export function paycheckDisposableWithSnowball(basePool, extraMonthly) {
  const base = Number(basePool)
  const extra = Number(extraMonthly)
  const b = Number.isFinite(base) ? base : 0
  const e = Number.isFinite(extra) ? extra : 0
  return roundMoney(b + e / 2)
}

export function appliedPrincipalThisPaycheck(balance, pool, minPrincipal) {
  const b = roundMoney(balance)
  const p = roundMoney(pool)
  const m = Number(minPrincipal)
  if (!Number.isFinite(m) || m <= 0) {
    return roundMoney(Math.min(b, p))
  }
  return roundMoney(Math.min(p, Math.max(Math.min(b, p), Math.min(m, b))))
}

/**
 * Apply spill dollars to later loans starting at startIndex. Mutates bals.
 */
export function cascadeSpillFromIndex(bals, startIndex, spill) {
  let r = roundMoney(spill)
  const afterSpill = {}
  const leftovers = {}
  for (let i = startIndex; i < bals.length; i++) {
    const before = bals[i]
    if (before > 0 && r > 0) {
      const to = roundMoney(Math.min(before, r))
      bals[i] = Math.max(0, roundMoney(before - to))
      r = roundMoney(r - to)
      afterSpill[i] = bals[i]
    }
    if (before > 0 && bals[i] <= 0) {
      bals[i] = 0
      leftovers[i] = r
    }
  }
  return { leftover: r, afterSpill, leftovers }
}

export function formatMoney(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0.00'
  return n.toFixed(2)
}

export function fifteenthRunningTotalsText(schedule, minimumPaymentPercent) {
  if (!Array.isArray(schedule) || !schedule.length) return ''
  const pct = Number(minimumPaymentPercent)
  const showMinPmt = Number.isFinite(pct) && pct > 0
  const rows = schedule
    .filter((row) => Number(row.day) === 15)
    .map((row) => {
      const n = Number(row.runningTotal)
      const amount = Number.isFinite(n) ? String(Math.round(n)) : '0'
      const datePrefix = row.dateShort || 'Day 15'
      const bal = Number.isFinite(n) ? n : 0
      const minPmt = showMinPmt ? String(Math.round(bal * (pct / 100))) : ''
      const rawPct = Number(row.debtFreePercent)
      const allDebtText = Number.isFinite(rawPct) ? `${Math.round(rawPct)}%` : ''
      const rawLoanPct = Number(row.towardOriginalPercent)
      const loanText = Number.isFinite(rawLoanPct) ? `${Math.round(rawLoanPct)}%` : ''
      return { datePrefix, amount, minPmt, loanText, allDebtText }
    })
  if (!rows.length) return ''
  const dateWidth = Math.max(...rows.map((r) => r.datePrefix.length))
  const amountWidth = Math.max(...rows.map((r) => r.amount.length))
  const loanWidth = Math.max(0, ...rows.map((r) => r.loanText.length))
  const allDebtWidth = Math.max(0, ...rows.map((r) => r.allDebtText.length))
  const padEnd = (s, width) => s + ' '.repeat(Math.max(0, width - s.length))
  return rows
    .map((r) => {
      let line = `${padEnd(r.datePrefix, dateWidth)} | ${padEnd(r.amount, amountWidth)}`
      if (showMinPmt) line += ` | Min Pmt: ${r.minPmt}`
      line += ` | Loan: ${padEnd(r.loanText, loanWidth)}`
      if (r.allDebtText) line += ` | All Debt: ${padEnd(r.allDebtText, allDebtWidth)}`
      return line
    })
    .join('\n')
}

export function loanFilled(name, bal) {
  const nName = name != null ? String(name).trim() : ''
  if (!nName || bal === null || bal === '') return false
  const n = Number(bal)
  return Number.isFinite(n) && n >= 0
}

export function startingMonthOptions() {
  const out = []
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  for (let i = 0; i < 13; i++) {
    const y = d.getFullYear()
    const m = d.getMonth()
    const value = `${y}-${String(m + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    out.push({ value, label })
    d.setMonth(d.getMonth() + 1)
  }
  return out
}

export function loadSavedFormInto(form) {
  try {
    const raw = localStorage.getItem(LOAN_COUNTDOWN_STORAGE_KEY)
    if (!raw) return {}
    const saved = JSON.parse(raw)
    if (!saved || typeof saved !== 'object') return {}

    if (
      saved.disposable_per_month != null &&
      saved.disposable_per_month !== '' &&
      (saved.disposable_per_paycheck1 == null || saved.disposable_per_paycheck1 === '') &&
      (saved.disposable_per_paycheck15 == null || saved.disposable_per_paycheck15 === '')
    ) {
      const v = Number(saved.disposable_per_month)
      if (Number.isFinite(v)) {
        saved.disposable_per_paycheck1 = v
        saved.disposable_per_paycheck15 = v
      }
    }

    const defaults = defaultLoanFormState()
    const numberKeys = new Set([
      'disposable_per_paycheck1',
      'disposable_per_paycheck15',
      'already_spent_on_first_paycheck',
      'already_spent_on_second_paycheck',
      'original_debt_goal',
    ])

    Object.keys(defaults).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(saved, key)) return
      const v = saved[key]
      if (numberKeys.has(key)) {
        if (v === null || v === undefined || v === '') {
          form[key] = null
        } else {
          const n = Number(v)
          form[key] = Number.isNaN(n) ? null : n
        }
      } else if (typeof defaults[key] === 'string') {
        form[key] = v == null ? '' : String(v)
      } else if (typeof defaults[key] === 'boolean') {
        form[key] = !!v
      } else {
        form[key] = v
      }
    })

    const extras = {}
    if (saved.loan_extras && typeof saved.loan_extras === 'object') {
      Object.keys(saved.loan_extras).forEach((id) => {
        const src = saved.loan_extras[id] || {}
        const slot = emptyLoanExtras()
        Object.keys(slot).forEach((field) => {
          const v = src[field]
          if (v === null || v === undefined || v === '') {
            slot[field] = null
          } else {
            const n = Number(v)
            slot[field] = Number.isNaN(n) ? null : n
          }
        })
        extras[id] = slot
      })
    }
    return extras
  } catch (e) {
    console.warn('Could not load loan form from local storage', e)
    return {}
  }
}
