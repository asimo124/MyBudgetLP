<script setup>
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api/client'

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

const filters = reactive({
  sort: stored && SORT_OPTIONS.includes(stored.sort) ? stored.sort : 'sort_order',
  sort_dir: stored && (stored.sort_dir === 'ASC' || stored.sort_dir === 'DESC') ? stored.sort_dir : 'ASC',
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
const paidByCutoff = ref(0)

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
        paid_by_cutoff: paidByCutoff.value || 0,
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
  const parsed = Math.round(Number(String(paidByCutoff.value).replace(/[^0-9.]/g, '')))
  paidByCutoff.value = Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  mainMsg.value = ''
  await loadLoans()
}

async function applyIncreaseCreditLimit() {
  mainMsg.value = ''
  await loadLoans()
}

async function clearPaidByCutoff() {
  paidByCutoff.value = 0
  await applyFilters()
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
  await loadLoans()
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
                v-model="paidByCutoff"
                type="text"
                inputmode="numeric"
                class="form-input w-full pr-9"
                placeholder="0"
                @change="applyFilters"
                @keyup.enter="applyFilters"
              />
              <button
                v-if="Number(paidByCutoff) > 0"
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
    <div class="card hidden lg:block">
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
    <div class="space-y-3 lg:hidden">
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
