<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import api from '@/api/client'
import DrilldownBarChart from '@/components/DrilldownBarChart.vue'
import {
  VIEW_MODES,
  activePeriodsAscending,
  buildOverviewChart,
  buildPeriodSection,
  chartDaysFor,
  currency,
  defaultSelectedStartDates,
  formatDate,
  groupByPayPeriod,
  payPeriodIdForDate as resolvePayPeriodId,
  purchasesForDay,
  resolveStoredSelection,
  round2,
  selectablePayPeriods,
  selectedPeriodIds,
  shortDate,
  sumAmount,
  todayYmd,
  totalForDay,
} from '@/utils/extraPurchases'

const API = {
  list: '/api/extra_purchases/list.php',
  create: '/api/extra_purchases/create.php',
  update: '/api/extra_purchases/update.php',
  delete: '/api/extra_purchases/delete.php',
}

const VIEW_MODE_KEY = 'extra_purchases_view_mode'
const PAY_PERIOD_FILTER_KEY = 'extra_purchases_pay_periods'

const items = ref([])
const payPeriods = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')

/* ---------- view mode ---------- */

function loadViewMode() {
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY)
    return VIEW_MODES.includes(stored) ? stored : 'both'
  } catch {
    return 'both'
  }
}

const viewMode = ref(loadViewMode())

watch(viewMode, (value) => {
  try {
    localStorage.setItem(VIEW_MODE_KEY, value)
  } catch {
    /* ignore */
  }
})

const showLists = computed(() => viewMode.value !== 'charts')
const showCharts = computed(() => viewMode.value !== 'lists')

/* ---------- pay period filter ---------- */

const selectedStartDates = ref([])
const filterOpen = ref(false)
const filterEl = ref(null)
let filterInitialized = false

function loadStoredSelection() {
  try {
    const raw = localStorage.getItem(PAY_PERIOD_FILTER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function persistSelection(dates) {
  try {
    localStorage.setItem(PAY_PERIOD_FILTER_KEY, JSON.stringify(dates))
  } catch {
    /* ignore */
  }
}

function applyResolvedSelection(options) {
  const resolved =
    resolveStoredSelection(
      filterInitialized ? selectedStartDates.value : loadStoredSelection(),
      options
    ) || defaultSelectedStartDates(options)
  selectedStartDates.value = resolved
  persistSelection(resolved)
}

function isPeriodSelected(startDate) {
  return selectedStartDates.value.includes(startDate)
}

function togglePeriod(startDate) {
  const next = isPeriodSelected(startDate)
    ? selectedStartDates.value.filter((date) => date !== startDate)
    : [...selectedStartDates.value, startDate]
  selectedStartDates.value = next
  persistSelection(next)
}

function selectLastTwo() {
  const next = defaultSelectedStartDates(filterOptions.value)
  selectedStartDates.value = next
  persistSelection(next)
}

function selectAllPeriods() {
  const next = filterOptions.value.map((period) => period.start_date)
  selectedStartDates.value = next
  persistSelection(next)
}

function includePeriodInFilter(periodId) {
  const period = payPeriods.value.find((p) => p.id === periodId)
  if (!period || isPeriodSelected(period.start_date)) return
  const next = [...selectedStartDates.value, period.start_date]
  selectedStartDates.value = next
  persistSelection(next)
}

const filterSummary = computed(() => {
  const count = selectedStartDates.value.length
  if (!count) return 'None selected'
  if (count === filterOptions.value.length) return 'All pay periods'
  const labels = filterOptions.value
    .filter((period) => isPeriodSelected(period.start_date))
    .map((period) => period.label)
  if (labels.length <= 2) return labels.join(', ')
  return `${labels.length} pay periods`
})

function onDocumentClick(event) {
  if (!filterOpen.value) return
  if (filterEl.value && !filterEl.value.contains(event.target)) {
    filterOpen.value = false
  }
}

/* ---------- loading ---------- */

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    const { data } = await api.get(API.list)
    items.value = (data?.items || []).map((item) => ({
      ...item,
      id: Number(item.id),
      pay_period_id: Number(item.pay_period_id),
      amount: round2(item.amount),
    }))
    payPeriods.value = (data?.pay_periods || []).map((period) => ({
      ...period,
      id: Number(period.id),
      days: period.days || [],
    }))
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to load extra purchases.'
    items.value = []
    payPeriods.value = []
  } finally {
    loading.value = false
  }
}

/* ---------- grouping ---------- */

const itemsByPeriodId = computed(() => groupByPayPeriod(items.value))

const filterOptions = computed(() =>
  selectablePayPeriods(payPeriods.value, itemsByPeriodId.value)
)

watch(filterOptions, (options) => {
  if (!options.length) {
    selectedStartDates.value = []
    return
  }
  applyResolvedSelection(options)
  filterInitialized = true
})

const visiblePeriodIds = computed(
  () => new Set(selectedPeriodIds(payPeriods.value, selectedStartDates.value))
)

const visibleItems = computed(() =>
  items.value.filter((item) => visiblePeriodIds.value.has(item.pay_period_id))
)

const visibleItemsByPeriodId = computed(() => groupByPayPeriod(visibleItems.value))

const allPurchasesDesc = computed(() =>
  [...visibleItems.value].sort(
    (a, b) => b.purchase_date.localeCompare(a.purchase_date) || b.id - a.id
  )
)

const grandTotal = computed(() => sumAmount(visibleItems.value))

const payPeriodOptions = computed(() =>
  [...payPeriods.value].sort((a, b) => b.start_date.localeCompare(a.start_date))
)

const visiblePeriods = computed(() =>
  payPeriods.value.filter((period) => visiblePeriodIds.value.has(period.id))
)

const activePeriodsAsc = computed(() =>
  activePeriodsAscending(visiblePeriods.value, visibleItemsByPeriodId.value)
)

/* ---------- per pay period sections ---------- */

const periodDrill = reactive({})

function drillPeriod(section, { dataPointIndex }) {
  const day = section.days[dataPointIndex]
  if (day) periodDrill[section.period.id] = day
}

function resetPeriodDrill(periodId) {
  delete periodDrill[periodId]
}

// Newest pay period first.
const periodSections = computed(() =>
  [...activePeriodsAsc.value]
    .reverse()
    .map((period) =>
      buildPeriodSection(
        period,
        visibleItemsByPeriodId.value.get(period.id) || [],
        periodDrill[period.id] || null
      )
    )
)

/* ---------- overview (stacked) chart ---------- */

const overviewDrill = reactive({ periodId: null, day: null })

watch(visiblePeriodIds, (ids) => {
  if (overviewDrill.periodId && !ids.has(overviewDrill.periodId)) {
    overviewDrill.periodId = null
    overviewDrill.day = null
  }
})

const overviewRoot = computed(() =>
  buildOverviewChart(activePeriodsAsc.value, visibleItemsByPeriodId.value)
)

function overviewPointLabel(seriesIndex, dataPointIndex) {
  return overviewRoot.value.labels[seriesIndex]?.[dataPointIndex] || ''
}

const overviewDrilldown = computed(() => {
  if (!overviewDrill.periodId) return null
  const period = payPeriods.value.find((p) => p.id === overviewDrill.periodId)
  if (!period) return null

  const periodItems = visibleItemsByPeriodId.value.get(period.id) || []
  const days = chartDaysFor(period, periodItems)

  if (overviewDrill.day) {
    const dayItems = purchasesForDay(periodItems, overviewDrill.day)
    return {
      level: 'day',
      title: `${period.label} — purchases on ${formatDate(overviewDrill.day)}`,
      categories: dayItems.map((item) => item.title),
      series: [{ name: 'Spent', data: dayItems.map((item) => round2(item.amount)) }],
      days,
      drillable: false,
    }
  }

  return {
    level: 'period',
    title: `Pay period ${period.label} — spent per day`,
    categories: days.map(shortDate),
    series: [{ name: 'Spent', data: days.map((day) => totalForDay(periodItems, day)) }],
    days,
    drillable: true,
  }
})

const overviewTitle = computed(() => overviewDrilldown.value?.title || 'Selected pay periods')

// iOS Chrome/WebKit scroll-anchors to similar headings when the overview
// chart remounts, which jumps the viewport to the matching pay-period chart.
function withPreservedScroll(fn) {
  const y = window.scrollY
  fn()
  nextTick(() => {
    window.scrollTo(0, y)
  })
}

function drillOverview({ dataPointIndex }) {
  withPreservedScroll(() => {
    const current = overviewDrilldown.value
    if (!current) {
      const period = overviewRoot.value.periods[dataPointIndex]
      if (period) overviewDrill.periodId = period.id
      return
    }
    if (current.level === 'period') {
      const day = current.days[dataPointIndex]
      if (day) overviewDrill.day = day
    }
  })
}

function backOverview() {
  withPreservedScroll(() => {
    if (overviewDrill.day) {
      overviewDrill.day = null
      return
    }
    overviewDrill.periodId = null
  })
}

const overviewChart = computed(() => {
  if (overviewDrilldown.value) {
    return {
      categories: overviewDrilldown.value.categories,
      series: overviewDrilldown.value.series,
      stacked: false,
      drillable: overviewDrilldown.value.drillable,
      pointLabel: null,
      height: 380,
    }
  }
  return {
    categories: overviewRoot.value.categories,
    series: overviewRoot.value.series,
    stacked: true,
    drillable: true,
    pointLabel: overviewPointLabel,
    height: 440,
  }
})

/* ---------- create / edit ---------- */

const showModal = ref(false)
const editingId = ref(null)
const formError = ref('')

const form = reactive({
  title: '',
  amount: '',
  purchase_date: todayYmd(),
  pay_period_id: 0,
})

const modalTitle = computed(() => (editingId.value ? 'Edit Purchase' : 'Add Purchase'))
const modalSaveLabel = computed(() => (editingId.value ? 'Save' : 'Create'))

function payPeriodIdForDate(dateIso) {
  return resolvePayPeriodId(payPeriods.value, dateIso)
}

// Picking a date selects its pay period; the dropdown can still be overridden.
watch(
  () => form.purchase_date,
  (value) => {
    if (!showModal.value || !value) return
    const derived = payPeriodIdForDate(value)
    if (derived) form.pay_period_id = derived
  }
)

function openCreateModal() {
  editingId.value = null
  formError.value = ''
  Object.assign(form, {
    title: '',
    amount: '',
    purchase_date: todayYmd(),
    pay_period_id: payPeriodIdForDate(todayYmd()) || payPeriodOptions.value[0]?.id || 0,
  })
  showModal.value = true
}

function openEditModal(row) {
  editingId.value = row.id
  formError.value = ''
  Object.assign(form, {
    title: row.title,
    amount: String(row.amount),
    purchase_date: row.purchase_date,
    pay_period_id: row.pay_period_id,
  })
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingId.value = null
  formError.value = ''
}

async function savePurchase() {
  const title = form.title.trim()
  const amount = Number(form.amount)

  if (!title) {
    formError.value = 'Title is required.'
    return
  }
  if (!form.purchase_date) {
    formError.value = 'Purchase date is required.'
    return
  }
  if (!Number.isFinite(amount)) {
    formError.value = 'Amount must be a number.'
    return
  }
  if (!form.pay_period_id) {
    formError.value = 'Pay period is required.'
    return
  }

  saving.value = true
  formError.value = ''
  try {
    const payload = {
      pay_period_id: form.pay_period_id,
      title,
      amount: round2(amount),
      purchase_date: form.purchase_date,
    }
    if (editingId.value) payload.id = editingId.value

    const { data } = await api.post(editingId.value ? API.update : API.create, payload)
    if (data?.success === false) {
      formError.value = data.error || 'Failed to save purchase.'
      return
    }
    includePeriodInFilter(payload.pay_period_id)
    closeModal()
    await loadData()
  } catch (err) {
    formError.value = err.response?.data?.error || 'Failed to save purchase.'
  } finally {
    saving.value = false
  }
}

/* ---------- delete ---------- */

const showConfirmModal = ref(false)
const pendingDelete = ref(null)

function openDeleteConfirm(row) {
  pendingDelete.value = row
  showConfirmModal.value = true
}

function closeConfirmModal() {
  showConfirmModal.value = false
  pendingDelete.value = null
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  saving.value = true
  try {
    await api.post(API.delete, { id: pendingDelete.value.id })
    closeConfirmModal()
    await loadData()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to delete purchase.'
    closeConfirmModal()
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  loadData()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Extra Purchases</h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Spur-of-the-moment buys you didn't really need, tracked per pay period.
      </p>
    </div>

    <div
      v-if="error"
      class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
    >
      {{ error }}
    </div>

    <div
      class="sticky top-0 z-30 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/95"
    >
      <button
        type="button"
        class="btn bg-primary-500 text-white hover:bg-primary-600"
        @click="openCreateModal"
      >
        Add Purchase
      </button>
      <div class="flex items-center gap-2">
        <label class="text-sm text-gray-600 dark:text-gray-400">Show</label>
        <select v-model="viewMode" class="form-input">
          <option value="lists">Only Datalists</option>
          <option value="charts">Only Charts</option>
          <option value="both">Datalist &amp; Charts</option>
        </select>
      </div>
      <div ref="filterEl" class="flex items-center gap-2">
        <label class="text-sm text-gray-600 dark:text-gray-400">Pay periods</label>
        <div class="relative">
        <button
          type="button"
          class="form-input flex min-w-[12rem] items-center justify-between gap-2 text-left"
          :aria-expanded="filterOpen"
          aria-haspopup="listbox"
          @click="filterOpen = !filterOpen"
        >
          <span class="truncate">{{ filterSummary }}</span>
          <span class="text-xs text-gray-400">▾</span>
        </button>
        <div
          v-if="filterOpen"
          class="absolute left-0 z-40 mt-1 w-72 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
        >
          <div class="flex gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
            <button
              type="button"
              class="text-xs text-primary-600 hover:underline dark:text-primary-400"
              @click="selectLastTwo"
            >
              Last 2
            </button>
            <button
              type="button"
              class="text-xs text-primary-600 hover:underline dark:text-primary-400"
              @click="selectAllPeriods"
            >
              Select all
            </button>
          </div>
          <div class="max-h-72 overflow-y-auto py-1" role="listbox" aria-multiselectable="true">
            <label
              v-for="period in filterOptions"
              :key="'filter-' + period.id"
              class="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <input
                type="checkbox"
                class="rounded border-gray-300"
                :checked="isPeriodSelected(period.start_date)"
                @change="togglePeriod(period.start_date)"
              />
              <span class="text-gray-900 dark:text-white">{{ period.label }}</span>
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {{ formatDate(period.start_date) }} – {{ formatDate(period.end_date) }}
              </span>
            </label>
            <p v-if="!filterOptions.length" class="px-3 py-2 text-sm italic text-gray-500">
              No pay periods loaded.
            </p>
          </div>
        </div>
        </div>
      </div>
      <div class="ml-auto text-sm text-gray-600 dark:text-gray-400">
        Total spent:
        <span class="font-semibold text-gray-900 dark:text-white">{{ currency(grandTotal) }}</span>
      </div>
    </div>

    <p v-if="loading" class="text-sm text-gray-500">Loading extra purchases…</p>

    <!-- All purchases (CRUD) -->
    <div v-if="showLists" class="space-y-2">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">All Purchases</h2>
      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Title</th>
                <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Pay Period</th>
                <th class="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Amount</th>
                <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr v-if="!loading && !allPurchasesDesc.length">
                <td colspan="5" class="px-3 py-6 text-center text-sm italic text-gray-500">
                  {{
                    items.length && !visibleItems.length
                      ? 'No extra purchases in the selected pay periods.'
                      : 'No extra purchases yet.'
                  }}
                </td>
              </tr>
              <tr
                v-for="row in allPurchasesDesc"
                :key="row.id"
                class="hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <td class="whitespace-nowrap px-3 py-2 text-sm">{{ formatDate(row.purchase_date) }}</td>
                <td class="px-3 py-2 text-sm break-words">{{ row.title }}</td>
                <td class="whitespace-nowrap px-3 py-2 text-sm text-gray-600 dark:text-gray-300">
                  {{ row.pay_period_label || '—' }}
                </td>
                <td class="whitespace-nowrap px-3 py-2 text-right text-sm">{{ currency(row.amount) }}</td>
                <td class="whitespace-nowrap px-3 py-2 text-sm">
                  <button
                    type="button"
                    class="btn mr-1 bg-gray-200 px-2 py-1 text-xs text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                    @click="openEditModal(row)"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="btn bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600"
                    @click="openDeleteConfirm(row)"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
            <tfoot v-if="allPurchasesDesc.length" class="bg-gray-50 dark:bg-gray-800">
              <tr>
                <td colspan="3" class="px-3 py-2 text-sm font-semibold text-gray-900 dark:text-white">
                  Total
                </td>
                <td class="px-3 py-2 text-right text-sm font-semibold text-gray-900 dark:text-white">
                  {{ currency(grandTotal) }}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>

    <p
      v-if="!loading && !periodSections.length"
      class="text-sm text-gray-500"
    >
      {{
        selectedStartDates.length
          ? 'No extra purchases in the selected pay periods.'
          : 'Select a pay period to see purchases and charts.'
      }}
    </p>

    <!-- Per pay period -->
    <div
      v-for="section in periodSections"
      :key="'period-' + section.period.id"
      class="space-y-3 [overflow-anchor:none]"
    >
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
        Pay Period {{ section.period.label }}
        <span class="ml-1 text-sm font-normal text-gray-500 dark:text-gray-400">
          {{ formatDate(section.period.start_date) }} – {{ formatDate(section.period.end_date) }}
        </span>
      </h2>

      <div v-if="showLists" class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Title</th>
                <th class="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Amount</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr
                v-for="row in section.items"
                :key="'pp-item-' + row.id"
                class="hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <td class="whitespace-nowrap px-3 py-2 text-sm">{{ formatDate(row.purchase_date) }}</td>
                <td class="px-3 py-2 text-sm break-words">{{ row.title }}</td>
                <td class="whitespace-nowrap px-3 py-2 text-right text-sm">{{ currency(row.amount) }}</td>
              </tr>
            </tbody>
            <tfoot class="bg-gray-50 dark:bg-gray-800">
              <tr>
                <td colspan="2" class="px-3 py-2 text-sm font-semibold text-gray-900 dark:text-white">
                  Subtotal
                </td>
                <td class="px-3 py-2 text-right text-sm font-semibold text-gray-900 dark:text-white">
                  {{ currency(section.subtotal) }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div v-if="showCharts" class="card">
        <div class="card-body space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">
              {{ section.chartTitle }}
            </h3>
            <button
              v-if="section.drillDay"
              type="button"
              class="btn bg-gray-200 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
              @click="resetPeriodDrill(section.period.id)"
            >
              Back
            </button>
            <p v-else class="text-xs text-gray-500 dark:text-gray-400">
              Click a bar to break the day down by purchase.
            </p>
          </div>
          <DrilldownBarChart
            :categories="section.categories"
            :series="section.series"
            :drillable="section.drillable"
            @drill="drillPeriod(section, $event)"
          />
        </div>
      </div>
    </div>

    <!-- Overview stacked chart -->
    <div v-if="showCharts && activePeriodsAsc.length" class="card">
      <div class="card-body space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{ overviewTitle }}</h2>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              <template v-if="!overviewDrilldown">
                Each bar is a pay period, split by day within that period. Click a bar to drill in.
              </template>
              <template v-else-if="overviewDrilldown.level === 'period'">
                Click a bar to break the day down by purchase.
              </template>
            </p>
          </div>
          <button
            v-if="overviewDrilldown"
            type="button"
            class="btn bg-gray-200 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
            @click="backOverview"
          >
            Back
          </button>
        </div>

        <DrilldownBarChart
          :categories="overviewChart.categories"
          :series="overviewChart.series"
          :stacked="overviewChart.stacked"
          :drillable="overviewChart.drillable"
          :point-label="overviewChart.pointLabel"
          :height="overviewChart.height"
          @drill="drillOverview"
        />
      </div>
    </div>

    <!-- Create / edit modal -->
    <div
      v-if="showModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="closeModal"
    >
      <div class="w-full max-w-lg rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div class="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ modalTitle }}</h3>
        </div>
        <div class="space-y-4 px-6 py-4">
          <p
            v-if="formError"
            class="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
          >
            {{ formError }}
          </p>
          <div>
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Title</label>
            <input
              v-model="form.title"
              type="text"
              maxlength="255"
              placeholder="What did you buy?"
              class="form-input w-full"
            />
          </div>
          <div>
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Amount</label>
            <input
              v-model="form.amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              class="form-input w-full"
            />
          </div>
          <div>
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Purchase date</label>
            <input v-model="form.purchase_date" type="date" class="form-input w-full" />
          </div>
          <div>
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Pay period</label>
            <select v-model.number="form.pay_period_id" class="form-input w-full">
              <option :value="0" disabled>Select a pay period…</option>
              <option v-for="period in payPeriodOptions" :key="period.id" :value="period.id">
                {{ period.label }} ({{ formatDate(period.start_date) }} – {{ formatDate(period.end_date) }})
              </option>
            </select>
          </div>
        </div>
        <div class="flex justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            type="button"
            class="btn bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
            @click="closeModal"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-60"
            :disabled="saving"
            @click="savePurchase"
          >
            {{ modalSaveLabel }}
          </button>
        </div>
      </div>
    </div>

    <!-- Confirm delete modal -->
    <div
      v-if="showConfirmModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="closeConfirmModal"
    >
      <div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Are you sure?</h3>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Delete “{{ pendingDelete?.title }}” ({{ currency(pendingDelete?.amount) }})? This cannot be
          undone.
        </p>
        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="btn bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
            @click="closeConfirmModal"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn bg-red-500 text-white hover:bg-red-600 disabled:opacity-60"
            :disabled="saving"
            @click="confirmDelete"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
