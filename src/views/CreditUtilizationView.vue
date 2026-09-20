<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api/client'
import { scrollToElement, waitForLayout } from '@/utils/scrollToElement'

const FILTER_STORAGE_KEY = 'credit_utilization_filters'
const SORT_OPTIONS = ['sort_order', 'debt_owed', 'title', 'milestone_order']

function loadStoredFilters() {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const mainMsg = ref('')
const mainError = ref('')
const loans = ref([])
const milestones = ref([])
const chartHeaders = ref([])
const chartValues = ref([])
const creditUtilizationOrig = ref(0)
const deleteId = ref(null)
const showDeleteModal = ref(false)

const stored = loadStoredFilters()

function toCutoffInteger(value) {
  const parsed = Math.round(Number(String(value ?? '').replace(/[^0-9.]/g, '')))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const filters = reactive({
  sort: stored && SORT_OPTIONS.includes(stored.sort) ? stored.sort : 'sort_order',
  sort_dir: stored && (stored.sort_dir === 'ASC' || stored.sort_dir === 'DESC') ? stored.sort_dir : 'ASC',
  paid_by_cutoff: stored ? toCutoffInteger(stored.paid_by_cutoff) : 0,
})

watch(
  filters,
  (value) => {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(value))
    } catch {
      /* ignore */
    }
  },
  { deep: true },
)

const summary = reactive({
  total_debt_owed: 0,
  total_credit_limit: 0,
  credit_utilization: 0,
  total_min_payment: 0,
  paid_by_cutoff: 0,
  paid_off_by_cutoff: [],
})

const increaseCreditLimitBy = ref(0)

const remainingLoansText = computed(() => {
  const rows = loans.value
    .map((loan) => {
      const name = String(loan.title || '').trim()
      const n = Number(loan.debt_owed)
      if (!name || !Number.isFinite(n) || n <= 0) return null
      return { name, amount: String(Math.round(n)) }
    })
    .filter(Boolean)
  if (!rows.length) return ''
  const nameWidth = Math.max(...rows.map((row) => row.name.length))
  const amountWidth = Math.max(...rows.map((row) => row.amount.length))
  const padEnd = (value, width) => value + ' '.repeat(Math.max(0, width - value.length))
  return rows
    .map((row) => `${padEnd(row.name, nameWidth)} | ${padEnd(row.amount, amountWidth)}`)
    .join('\n')
})

// Same default disposable as the Credit Utilization list API.
const DEFAULT_MONTHLY_DISPOSABLE = 3000 + 400 * 2 - 180 * 2
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const GANTT_MONTH_PX = 44
const GANTT_COLORS = [
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

function startOfCurrentMonth() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function addMonthsFractional(date, months) {
  const n = Number(months)
  if (!Number.isFinite(n) || n <= 0) return new Date(date.getTime())
  const whole = Math.floor(n)
  const frac = n - whole
  const result = new Date(date.getFullYear(), date.getMonth() + whole, date.getDate())
  result.setDate(result.getDate() + Math.round(frac * 30))
  return result
}

function compareByMilestone(a, b) {
  const aOrder = Number(a.milestone_order) > 0 ? Number(a.milestone_order) : 9999
  const bOrder = Number(b.milestone_order) > 0 ? Number(b.milestone_order) : 9999
  if (aOrder !== bOrder) return aOrder - bOrder
  return Number(a.id) - Number(b.id)
}

const payoffGantt = computed(() => {
  const ordered = loans.value.filter((loan) => Number(loan.debt_owed) > 0).slice().sort(compareByMilestone)
  if (!ordered.length) {
    return { bars: [], months: [], years: [], timelineWidth: 0 }
  }

  let minPaymentAccum = 0
  let adjustAccum = 0
  let cursor = startOfCurrentMonth()
  const bars = []

  ordered.forEach((loan, index) => {
    const debt = Number(loan.debt_owed) || 0
    const principal = Number(loan.amount_to_principal) || 0
    const minPayment = Number(loan.min_payment) || 0
    const adjust = Number(loan.adjust_disposable_amount) || 0
    adjustAccum += adjust
    const monthlyPay = DEFAULT_MONTHLY_DISPOSABLE + minPaymentAccum + principal + adjustAccum
    const monthsLeft = monthlyPay > 0 ? debt / monthlyPay : 0
    const start = new Date(cursor.getTime())
    const end = addMonthsFractional(start, monthsLeft)
    bars.push({
      id: loan.id,
      title: loan.title,
      start,
      end,
      monthsLeft: Math.round(monthsLeft * 10) / 10,
      color: GANTT_COLORS[index % GANTT_COLORS.length],
    })
    minPaymentAccum += minPayment
    cursor = new Date(end.getTime())
    cursor.setDate(cursor.getDate() + 1)
  })

  const rangeStart = startOfCurrentMonth()
  const lastEnd = bars[bars.length - 1].end
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
})

function money(value) {
  const n = Number(value)
  if (Number.isNaN(n)) return '$0.00'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function pct(value) {
  const n = Number(value)
  if (Number.isNaN(n)) return '0.00%'
  return `${n.toFixed(2)}%`
}

function headerStyle(header) {
  if (creditUtilizationOrig.value === header) return 'color: red'
  if (header === 0.29) return 'color: green'
  return ''
}

function milestoneStyle(value) {
  return Number(value) < 30 ? 'color: green' : 'color: red'
}

async function loadLoans() {
  loading.value = true
  mainError.value = ''
  try {
    const { data } = await api.get('/api/credit_utilization/list.php', {
      params: {
        sort: filters.sort,
        sort_dir: filters.sort_dir,
        increase_credit_limit_by: increaseCreditLimitBy.value || 0,
        paid_by_cutoff: filters.paid_by_cutoff || 0,
      },
    })
    loans.value = data.loans || []
    milestones.value = data.milestones || []
    chartHeaders.value = data.chart?.headers || []
    chartValues.value = data.chart?.values || []
    creditUtilizationOrig.value = data.chart?.credit_utilization_orig || 0
    Object.assign(summary, data.summary || {})
  } catch (err) {
    mainError.value = err.response?.data?.message || 'Failed to load credit utilization.'
  } finally {
    loading.value = false
  }
}

async function applyFilters() {
  filters.paid_by_cutoff = toCutoffInteger(filters.paid_by_cutoff)
  mainMsg.value = ''
  await loadLoans()
}

async function applyIncreaseCreditLimit() {
  mainMsg.value = ''
  await loadLoans()
}

async function clearPaidByCutoff() {
  filters.paid_by_cutoff = 0
  await applyFilters()
}

function scrollToLoansList() {
  const candidates = [
    document.getElementById('credit-loans-desktop'),
    document.getElementById('credit-loans-mobile'),
  ]
  const el = candidates.find((node) => node && node.offsetParent !== null)
  scrollToElement(el)
}

function openDelete(id) {
  deleteId.value = id
  showDeleteModal.value = true
}

function closeDelete() {
  deleteId.value = null
  showDeleteModal.value = false
}

async function confirmDelete() {
  if (!deleteId.value) return
  mainError.value = ''
  try {
    const { data } = await api.post('/api/credit_utilization/delete.php', { id: deleteId.value })
    mainMsg.value = data.message || 'Loan/Card deleted.'
    closeDelete()
    await loadLoans()
  } catch (err) {
    mainError.value = err.response?.data?.message || 'Failed to delete loan/card.'
  }
}

onMounted(async () => {
  if (route.query.Message) {
    mainMsg.value = String(route.query.Message)
  }
  // Arriving from Budget Progress with a disposable total to project against.
  const fromBudgetProgress = route.query.paid_by_cutoff !== undefined
  if (fromBudgetProgress) {
    filters.paid_by_cutoff = toCutoffInteger(route.query.paid_by_cutoff)
    const query = { ...route.query }
    delete query.paid_by_cutoff
    await router.replace({ query })
  }
  await loadLoans()
  if (fromBudgetProgress) {
    await nextTick()
    await waitForLayout()
    scrollToLoansList()
  }
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Credit Utilization</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Track debt, credit limits, and payoff milestones.
        </p>
      </div>
      <button
        type="button"
        class="btn bg-primary-500 text-white hover:bg-primary-600"
        @click="router.push({ name: 'credit-utilization-create' })"
      >
        Create Loan/Card
      </button>
    </div>

    <div
      v-if="mainMsg"
      class="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300"
    >
      {{ mainMsg }}
    </div>
    <div
      v-if="mainError"
      class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
    >
      {{ mainError }}
    </div>

    <div class="card">
      <div class="card-body">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Sort by</label>
            <select v-model="filters.sort" class="form-input w-full">
              <option value="sort_order">Sort Order</option>
              <option value="debt_owed">Debt Owed</option>
              <option value="title">Name</option>
              <option value="milestone_order">Milestone Order</option>
            </select>
          </div>
          <div>
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Direction</label>
            <select v-model="filters.sort_dir" class="form-input w-full">
              <option value="ASC">ASC</option>
              <option value="DESC">DESC</option>
            </select>
          </div>
          <div>
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Paid By Cutoff</label>
            <div class="relative">
              <input
                v-model="filters.paid_by_cutoff"
                type="text"
                inputmode="numeric"
                class="form-input w-full pr-9"
                placeholder="0"
                @change="applyFilters"
                @keyup.enter="applyFilters"
              />
              <button
                v-if="Number(filters.paid_by_cutoff) > 0"
                type="button"
                class="absolute inset-y-0 right-0 flex items-center px-3 text-lg leading-none text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                title="Clear"
                aria-label="Clear Paid By Cutoff"
                @click="clearPaidByCutoff"
              >
                &times;
              </button>
            </div>
          </div>
          <div class="flex items-end">
            <button
              type="button"
              class="btn w-full bg-primary-500 text-white hover:bg-primary-600 sm:w-auto"
              @click="applyFilters"
            >
              Search
            </button>
          </div>
        </div>
        <p v-if="summary.paid_by_cutoff > 0" class="mt-3 text-sm text-gray-600 dark:text-gray-400">
          Paying {{ money(summary.paid_by_cutoff) }} in milestone order clears
          <span class="font-medium text-gray-900 dark:text-white">
            {{ summary.paid_off_by_cutoff?.length || 0 }}
          </span>
          loan/card<span v-if="(summary.paid_off_by_cutoff?.length || 0) !== 1">s</span><span
            v-if="summary.paid_off_by_cutoff?.length"
          >
            ({{ summary.paid_off_by_cutoff.join(', ') }})</span
          >. Those are hidden below; what is left is what you would still owe.
        </p>
      </div>
    </div>

    <div class="card">
      <div class="card-body">
        <h2 class="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Credit Utilization Summary</h2>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Total Debt Owed</th>
                <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Total Credit Limit</th>
                <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Credit Utilization (%)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="px-3 py-3 text-sm font-medium">{{ money(summary.total_debt_owed) }}</td>
                <td class="px-3 py-3 text-sm font-medium">{{ money(summary.total_credit_limit) }}</td>
                <td class="px-3 py-3 text-sm font-medium">{{ pct(summary.credit_utilization) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Desktop table -->
    <div id="credit-loans-desktop" class="card hidden scroll-mt-24 md:block">
      <div class="card-body overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Loan/Card</th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Debt Owed</th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Credit Limit</th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Credit Utilization</th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Min Payment</th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Adjust Disposable</th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Disposable</th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Milestone</th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-if="!loans.length">
              <td colspan="9" class="px-3 py-6 text-center text-sm italic text-gray-500">No loans/cards found</td>
            </tr>
            <tr v-for="loan in loans" :key="loan.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td class="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white">{{ loan.title }}</td>
              <td class="px-3 py-2 text-sm">{{ money(loan.debt_owed) }}</td>
              <td class="px-3 py-2 text-sm">{{ money(loan.credit_limit) }}</td>
              <td class="px-3 py-2 text-sm">{{ pct(loan.credit_utilization) }}</td>
              <td class="px-3 py-2 text-sm">{{ money(loan.min_payment_accum) }}</td>
              <td class="px-3 py-2 text-sm">{{ money(loan.adjust_disposable_amount_accum) }}</td>
              <td class="px-3 py-2 text-sm">{{ money(loan.min_payment_adjust_disposable) }}</td>
              <td class="px-3 py-2 text-sm">{{ loan.milestone_order }}</td>
              <td class="px-3 py-2 text-sm">
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="btn bg-primary-500 px-3 py-1 text-xs text-white hover:bg-primary-600"
                    @click="router.push({ name: 'credit-utilization-edit', params: { id: loan.id } })"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="btn bg-red-500 px-3 py-1 text-xs text-white hover:bg-red-600"
                    @click="openDelete(loan.id)"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
          <tfoot v-if="loans.length" class="border-t-2 border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800">
            <tr class="text-sm font-semibold text-gray-900 dark:text-white">
              <td class="px-3 py-2">Totals</td>
              <td class="px-3 py-2">{{ money(summary.total_debt_owed) }}</td>
              <td class="px-3 py-2">{{ money(summary.total_credit_limit) }}</td>
              <td class="px-3 py-2">{{ pct(summary.credit_utilization) }}</td>
              <td class="px-3 py-2">{{ money(summary.total_min_payment) }}</td>
              <td class="px-3 py-2"></td>
              <td class="px-3 py-2"></td>
              <td class="px-3 py-2"></td>
              <td class="px-3 py-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- Mobile cards -->
    <div id="credit-loans-mobile" class="scroll-mt-24 space-y-3 md:hidden">
      <div v-if="!loans.length" class="card">
        <div class="card-body text-center text-sm italic text-gray-500">No loans/cards found</div>
      </div>
      <div v-for="loan in loans" :key="'m-' + loan.id" class="card">
        <div class="card-body space-y-2">
          <div class="flex items-start justify-between gap-2">
            <h3 class="font-semibold text-gray-900 dark:text-white">{{ loan.title }}</h3>
            <span class="text-sm text-gray-500">M{{ loan.milestone_order }}</span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div class="text-xs text-gray-500">Debt Owed</div>
              <div>{{ money(loan.debt_owed) }}</div>
            </div>
            <div>
              <div class="text-xs text-gray-500">Credit Limit</div>
              <div>{{ money(loan.credit_limit) }}</div>
            </div>
            <div>
              <div class="text-xs text-gray-500">Utilization</div>
              <div>{{ pct(loan.credit_utilization) }}</div>
            </div>
            <div>
              <div class="text-xs text-gray-500">Disposable</div>
              <div>{{ money(loan.min_payment_adjust_disposable) }}</div>
            </div>
          </div>
          <div class="flex gap-2 pt-1">
            <button
              type="button"
              class="btn flex-1 bg-primary-500 text-white hover:bg-primary-600"
              @click="router.push({ name: 'credit-utilization-edit', params: { id: loan.id } })"
            >
              Edit
            </button>
            <button
              type="button"
              class="btn flex-1 bg-red-500 text-white hover:bg-red-600"
              @click="openDelete(loan.id)"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <pre
      v-if="remainingLoansText"
      class="overflow-x-auto rounded bg-gray-50 p-3 text-xs dark:bg-gray-900"
    >{{ remainingLoansText }}</pre>

    <p class="text-sm font-medium text-gray-800 dark:text-gray-200">
      Total Paying Monthly: {{ money(summary.total_min_payment) }}
    </p>

    <div class="card">
      <div class="card-body">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div class="flex-1">
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">
              Increase Credit Limit By Amount
            </label>
            <input
              v-model.number="increaseCreditLimitBy"
              type="number"
              step="any"
              class="form-input w-full max-w-xs"
              placeholder="Increase Credit Limit By Amount"
            />
          </div>
          <button
            type="button"
            class="btn bg-primary-500 text-white hover:bg-primary-600"
            @click="applyIncreaseCreditLimit"
          >
            Increase Credit Limit
          </button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-body">
        <h2 class="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
          Credit Utilization Chart Out of {{ money(summary.total_credit_limit) }}
        </h2>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th
                  v-for="(header, idx) in chartHeaders"
                  :key="'h-' + idx"
                  class="px-3 py-2 text-left text-xs font-medium uppercase"
                  :style="headerStyle(header)"
                >
                  {{ (header * 100).toFixed(2) }}% of Credit Used
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td v-for="(value, idx) in chartValues" :key="'v-' + idx" class="px-3 py-3 text-sm">
                  {{ money(value) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-body">
        <h2 class="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
          Credit Milestones Chart Out of {{ money(summary.total_credit_limit) }}
        </h2>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">When Milestone Paid</th>
                <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Credit Utilization (%)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr v-if="!milestones.length">
                <td colspan="2" class="px-3 py-6 text-center text-sm italic text-gray-500">No milestones</td>
              </tr>
              <tr v-for="(milestone, idx) in milestones" :key="'ms-' + idx">
                <td class="px-3 py-2 text-sm font-semibold" :style="milestoneStyle(milestone.value)">
                  {{ milestone.title }}
                </td>
                <td class="px-3 py-2 text-sm font-semibold" :style="milestoneStyle(milestone.value)">
                  {{ pct(milestone.value) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="payoffGantt.bars.length" class="card">
      <div class="card-body space-y-3">
        <div>
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Loan Payoff Timeline</h2>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Snowball in milestone order. Each bar is how long that loan takes after the previous one is paid.
          </p>
        </div>
        <div class="overflow-x-auto">
          <div class="min-w-max">
            <div class="flex">
              <div class="w-36 shrink-0"></div>
              <div
                v-for="(year, yearIndex) in payoffGantt.years"
                :key="'gantt-year-' + year.year"
                class="border-b border-gray-200 text-center text-xs font-semibold text-gray-900 dark:border-gray-700 dark:text-white"
                :class="yearIndex % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-900'"
                :style="{ width: year.span * GANTT_MONTH_PX + 'px' }"
              >
                {{ year.year }}
              </div>
            </div>
            <div class="flex">
              <div class="w-36 shrink-0"></div>
              <div
                v-for="(month, monthIndex) in payoffGantt.months"
                :key="'gantt-month-' + monthIndex"
                class="border-b border-gray-100 py-1 text-center text-[10px] text-gray-500 dark:border-gray-800 dark:text-gray-400"
                :class="month.isYearStart ? 'border-l border-gray-300 dark:border-gray-600' : ''"
                :style="{ width: GANTT_MONTH_PX + 'px' }"
              >
                {{ month.label }}
              </div>
            </div>
            <div
              v-for="bar in payoffGantt.bars"
              :key="'gantt-bar-' + bar.id"
              class="flex items-center"
            >
              <div
                class="w-36 shrink-0 truncate pr-2 text-sm font-medium text-gray-900 dark:text-white"
                :title="bar.title"
              >
                {{ bar.title }}
              </div>
              <div class="relative h-8" :style="{ width: payoffGantt.timelineWidth + 'px' }">
                <div
                  v-for="(month, monthIndex) in payoffGantt.months"
                  :key="'gantt-grid-' + bar.id + '-' + monthIndex"
                  class="absolute inset-y-0 border-r border-gray-100 dark:border-gray-800"
                  :class="month.isYearStart ? 'border-l border-gray-300 dark:border-gray-600' : ''"
                  :style="{ left: monthIndex * GANTT_MONTH_PX + 'px', width: GANTT_MONTH_PX + 'px' }"
                ></div>
                <div
                  class="absolute top-1 flex h-6 items-center overflow-hidden rounded px-1.5 text-[10px] font-medium text-white"
                  :style="{
                    left: bar.leftPct + '%',
                    width: bar.widthPct + '%',
                    backgroundColor: bar.color,
                  }"
                  :title="`${bar.title}: ${bar.monthsLeft} months, paid off ${bar.endLabel}`"
                >
                  <span class="truncate">{{ bar.monthsLeft }} mo · {{ bar.endLabel }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="loading" class="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div class="rounded-lg bg-white px-6 py-4 shadow-lg dark:bg-gray-800">Loading…</div>
    </div>

    <div
      v-if="showDeleteModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="closeDelete"
    >
      <div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Delete Loan/Card</h3>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Are you sure you wish to delete this Loan/Card?
        </p>
        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="btn bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
            @click="closeDelete"
          >
            Close
          </button>
          <button type="button" class="btn bg-red-500 text-white hover:bg-red-600" @click="confirmDelete">
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
