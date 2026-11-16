/**
 * Parse text copied from the MySynchrony pending-activity list.
 *
 * Each transaction looks roughly like:
 *   Purchase
 *   Nov 16, 2026
 *   Pending
 *   $16.23
 *   SQ *PHO SURE San Antonio TX
 *
 * Only lines that are entirely a dollar amount are treated as amounts, so
 * numbers inside merchant names are ignored. Negative amounts (payments /
 * credits) may appear as -$5.00, $-5.00, −$5.00 (unicode minus) or ($5.00).
 */

const AMOUNT_LINE =
  /^\(?\s*([-−–]?)\s*\$\s*([-−–]?)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*\)?$/
const DATE_LINE = /^[A-Z][a-z]{2,8}\.? \d{1,2}, \d{4}$/
const SKIP_LINES = new Set(['pending', 'posted'])

function toCents(value) {
  return Math.round(value * 100)
}

export function parseSynchronyPending(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/ /g, ' ').trim())
    .filter(Boolean)

  const transactions = []
  let lastType = ''
  let lastDate = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (DATE_LINE.test(line)) {
      lastDate = line
      continue
    }

    const match = line.match(AMOUNT_LINE)
    if (match) {
      const negative =
        Boolean(match[1] || match[2]) || (line.startsWith('(') && line.endsWith(')'))
      const amount = Number(match[3].replace(/,/g, '')) * (negative ? -1 : 1)

      let description = ''
      const next = lines[i + 1]
      if (next && !AMOUNT_LINE.test(next) && !DATE_LINE.test(next)) {
        description = next
        i++
      }

      transactions.push({ type: lastType, date: lastDate, amount, description })
      lastType = ''
      lastDate = ''
      continue
    }

    if (!SKIP_LINES.has(line.toLowerCase())) {
      lastType = line
    }
  }

  let chargesCents = 0
  let paymentsCents = 0
  for (const t of transactions) {
    if (t.amount < 0) paymentsCents += toCents(t.amount)
    else chargesCents += toCents(t.amount)
  }

  return {
    transactions,
    charges: chargesCents / 100,
    payments: paymentsCents / 100,
    net: (chargesCents + paymentsCents) / 100,
    chargeCount: transactions.filter((t) => t.amount >= 0).length,
    paymentCount: transactions.filter((t) => t.amount < 0).length,
  }
}

export function formatMoney(value) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
