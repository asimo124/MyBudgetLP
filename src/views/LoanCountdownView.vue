<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import api from '@/api/client'
import LoanPayoffGantt from '@/components/LoanPayoffGantt.vue'
import {
  LOAN_COUNTDOWN_STORAGE_KEY,
  defaultLoanFormState,
  emptyLoanExtras,
  fifteenthRunningTotalsText,
  formatMoney,
  loadSavedFormInto,
  simulateLoanCountdown,
  startingMonthOptions,
} from '@/utils/loanCountdown'

const form = reactive(defaultLoanFormState())
const monthOptions = startingMonthOptions()
const loanExtras = reactive({})

const cuLoans = ref([])
const loanResults = ref([])
const loadingLoans = ref(false)
const countdownValidationError = ref('')
const loadError = ref('')

const extraFieldDefs = [
  {
    key: 'adjust_disposable_per_paycheck1',
    label: 'Adjust disposable (1st paycheck)',
    hint: 'Extra income (or a negative amount for income you lose) while this loan is being paid off.',
  },
  {
    key: 'adjust_disposable_per_paycheck15',
    label: 'Adjust disposable (15th paycheck)',
    hint: 'Extra income (or a negative amount for income you lose) while this loan is being paid off.',
  },
  {
    key: 'minimum_payment_percent',
    label: 'Minimum Payment Percent',
    hint: 'Percent of extra principal paid each paycheck is added to monthly disposable, then split across the 1st and 15th.',
  },
  {
    key: 'day_of_month',
    label: 'Day of month',
    min: '1',
    max: '31',
    step: '1',
  },
]

const allDebtGoalLabel = computed(() => {
  const goal = Number(form.original_debt_goal)
  if (!Number.isFinite(goal) || goal <= 0) return 'Toward All Debt'
  return `Toward $${Math.round(goal).toLocaleString('en-US')}`
})

const hasResults = computed(
  () => Boolean(countdownValidationError.value) || loanResults.value.some((row) => row.schedule.length > 0)
)

const countdownSimulation = computed(() => simulateLoanCountdown(cuLoans.value, form, loanExtras))

function extrasFor(loanId) {
  const key = String(loanId)
  if (!loanExtras[key]) {
    loanExtras[key] = emptyLoanExtras()
  }
  return loanExtras[key]
}

function persistLoanForm() {
  const payload = {
    disposable_per_paycheck1: form.disposable_per_paycheck1,
    disposable_per_paycheck15: form.disposable_per_paycheck15,
    already_spent_on_first_paycheck: form.already_spent_on_first_paycheck,
    already_spent_on_second_paycheck: form.already_spent_on_second_paycheck,
    original_debt_goal: form.original_debt_goal,
    starting_month: form.starting_month,
    push_to_next_paycheck: form.push_to_next_paycheck,
    loan_extras: { ...loanExtras },
  }
  try {
    localStorage.setItem(LOAN_COUNTDOWN_STORAGE_KEY, JSON.stringify(payload))
  } catch (e) {
    console.warn('Could not save loan form to local storage', e)
  }
}

function resetResultState() {
  loanResults.value = []
}

function clearLoanFormData() {
  try {
    localStorage.removeItem(LOAN_COUNTDOWN_STORAGE_KEY)
  } catch (e) {
    console.warn('Could not clear loan form storage', e)
  }
  const d = defaultLoanFormState()
  Object.keys(d).forEach((key) => {
    form[key] = d[key]
  })
  Object.keys(loanExtras).forEach((key) => {
    delete loanExtras[key]
  })
  cuLoans.value.forEach((loan) => extrasFor(loan.id))
  countdownValidationError.value = ''
  resetResultState()
}

async function loadCuLoans() {
  loadingLoans.value = true
  loadError.value = ''
  try {
    const { data } = await api.get('/api/credit_utilization/list.php', {
      params: {
        sort: 'milestone_order',
        sort_dir: 'ASC',
        paid_by_cutoff: 0,
        increase_credit_limit_by: 0,
      },
    })
    cuLoans.value = (data.loans || []).filter((loan) => Number(loan.debt_owed) > 0)
    cuLoans.value.forEach((loan) => extrasFor(loan.id))
  } catch (err) {
    loadError.value = err.response?.data?.message || 'Failed to load loans from Credit Utilization.'
    cuLoans.value = []
  } finally {
    loadingLoans.value = false
  }
}

function calculateLoanCountdown() {
  persistLoanForm()
  const sim = simulateLoanCountdown(cuLoans.value, form, loanExtras)
  countdownValidationError.value = sim.error
  loanResults.value = sim.results
}

function scrollToResults() {
  const el = document.getElementById('loan-countdown-results')
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function scrollToTop() {
  const el = document.getElementById('loan-countdown-top')
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

async function runCalculateAndScroll() {
  calculateLoanCountdown()
  await nextTick()
  scrollToResults()
}

onMounted(async () => {
  const extras = loadSavedFormInto(form) || {}
  Object.keys(extras).forEach((id) => {
    loanExtras[id] = extras[id]
  })
  await loadCuLoans()
  calculateLoanCountdown()
})
</script>

<template>
  <div id="loan-countdown-top" class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Loan Countdown</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Snowball payoff from Credit Utilization loans with debt owed. Plan settings stay in your browser.
        </p>
      </div>
      <div class="flex flex-wrap gap-2 sm:justify-end">
        <button
          type="button"
          class="btn bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
          @click="clearLoanFormData"
        >
          Clear Data
        </button>
        <button
          type="button"
          class="btn bg-primary-500 text-white hover:bg-primary-600"
          @click="runCalculateAndScroll"
        >
          Calculate Loan Countdown
        </button>
      </div>
    </div>

    <div
      v-if="loadError"
      class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
    >
      {{ loadError }}
    </div>

    <div class="card">
      <div class="card-body space-y-4">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">
              Original all-debt goal
            </label>
            <input
              v-model.number="form.original_debt_goal"
              type="number"
              step="0.01"
              min="0"
              class="form-input w-full"
              @blur="persistLoanForm"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Used for the “All Debt” / Toward goal percent on every paycheck.
            </p>
          </div>
          <div>
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">
              Disposable per paycheck on the 1st of the month
            </label>
            <input
              v-model.number="form.disposable_per_paycheck1"
              type="number"
              step="any"
              class="form-input w-full"
              @blur="persistLoanForm"
            />
          </div>
          <div>
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">
              Disposable per paycheck on the 15th of the month
            </label>
            <input
              v-model.number="form.disposable_per_paycheck15"
              type="number"
              step="any"
              class="form-input w-full"
              @blur="persistLoanForm"
            />
          </div>
          <div>
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">
              Already spent on first paycheck (1st / next upcoming)
            </label>
            <input
              v-model.number="form.already_spent_on_first_paycheck"
              type="number"
              step="0.01"
              min="0"
              class="form-input w-full"
              @blur="persistLoanForm"
            />
          </div>
          <div>
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">
              Already spent on 2nd paycheck (15th / after next)
            </label>
            <input
              v-model.number="form.already_spent_on_second_paycheck"
              type="number"
              step="0.01"
              min="0"
              class="form-input w-full"
              @blur="persistLoanForm"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              With “Push to next paycheck” checked, this amount is deducted from the first paycheck shown.
            </p>
          </div>
          <div>
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Starting month</label>
            <select
              v-model="form.starting_month"
              class="form-input w-full"
              @change="persistLoanForm"
              @blur="persistLoanForm"
            >
              <option value="">— Select —</option>
              <option v-for="opt in monthOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="flex items-center gap-2 pt-6">
            <input
              id="push_to_next_paycheck"
              v-model="form.push_to_next_paycheck"
              type="checkbox"
              class="rounded"
              @change="persistLoanForm"
            />
            <label for="push_to_next_paycheck" class="text-sm text-gray-700 dark:text-gray-300">
              Push to next paycheck
            </label>
          </div>
        </div>
      </div>
    </div>

    <div v-if="loadingLoans" class="text-sm text-gray-500">Loading loans from Credit Utilization…</div>
    <div
      v-else-if="!cuLoans.length"
      class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
    >
      No loans with debt owed greater than 0. Add or update them on Credit Utilization.
    </div>

    <div v-for="loan in cuLoans" :key="'loan-form-' + loan.id" class="card">
      <div class="card-body space-y-4">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{ loan.title }}</h2>
        <p class="text-sm text-gray-700 dark:text-gray-300">
          {{ formatMoney(loan.debt_owed) }}
          · {{ formatMoney(loan.original_debt_owed) }}
          · {{ formatMoney(loan.amount_to_principal) }}
        </p>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div v-for="field in extraFieldDefs" :key="loan.id + '-' + field.key">
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">{{ field.label }}</label>
            <input
              v-model.number="extrasFor(loan.id)[field.key]"
              type="number"
              :step="field.step || 'any'"
              :min="field.min"
              :max="field.max"
              class="form-input w-full"
              @blur="persistLoanForm"
            />
            <p v-if="field.hint" class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ field.hint }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap justify-end gap-2">
      <button
        type="button"
        class="btn bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
        @click="clearLoanFormData"
      >
        Clear Data
      </button>
      <button
        type="button"
        class="btn bg-primary-500 text-white hover:bg-primary-600"
        @click="runCalculateAndScroll"
      >
        Calculate Loan Countdown
      </button>
    </div>

    <div id="loan-countdown-results" class="scroll-mt-4 space-y-6">
      <div
        v-if="countdownValidationError"
        class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
      >
        {{ countdownValidationError }}
      </div>

      <div v-if="hasResults" class="flex justify-end">
        <button
          type="button"
          class="btn bg-gray-200 text-sm text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
          @click="scrollToTop"
        >
          Back to Top
        </button>
      </div>

      <div v-for="row in loanResults" :key="'loan-result-' + row.id">
        <div v-if="row.schedule.length" class="card">
          <div class="card-body space-y-4">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">{{ row.name }}</h2>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead class="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                    <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                      Disposable per paycheck
                    </th>
                    <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Running total</th>
                    <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Toward Original</th>
                    <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                      {{ allDebtGoalLabel }}
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                  <tr v-for="(item, idx) in row.schedule" :key="row.id + '-' + idx">
                    <td class="px-3 py-2 text-sm">{{ item.dateLabel }}</td>
                    <td class="px-3 py-2 text-sm">${{ formatMoney(item.disposableApplied) }}</td>
                    <td class="px-3 py-2 text-sm">${{ formatMoney(item.runningTotal) }}</td>
                    <td class="px-3 py-2 text-sm">
                      {{ item.towardOriginalPercent == null ? '' : `${item.towardOriginalPercent}%` }}
                    </td>
                    <td class="px-3 py-2 text-sm">{{ item.debtFreePercent }}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <pre
              v-if="fifteenthRunningTotalsText(row.schedule, row.minimum_payment_percent)"
              class="overflow-x-auto rounded bg-gray-50 p-3 text-xs dark:bg-gray-900"
            >{{ fifteenthRunningTotalsText(row.schedule, row.minimum_payment_percent) }}</pre>
            <p v-if="row.payoffLeftover !== null" class="text-base">
              Money left over from paying {{ row.name }}:
              <strong>${{ formatMoney(row.payoffLeftover) }}</strong>
            </p>
            <p v-if="row.balanceAfterSpill != null" class="text-base">
              New balance after spill:
              <strong>${{ formatMoney(row.balanceAfterSpill) }}</strong>
            </p>
          </div>
        </div>
        <div v-else-if="row.payoffLeftover != null || row.balanceAfterSpill != null" class="card">
          <div class="card-body space-y-2">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{ row.name }}</h2>
            <p v-if="row.payoffLeftover != null" class="text-base">
              Money left over from paying {{ row.name }}:
              <strong>${{ formatMoney(row.payoffLeftover) }}</strong>
            </p>
            <p v-if="row.balanceAfterSpill != null" class="text-base">
              New balance after spill:
              <strong>${{ formatMoney(row.balanceAfterSpill) }}</strong>
            </p>
          </div>
        </div>
      </div>

      <div v-if="hasResults" class="flex justify-end pb-2">
        <button
          type="button"
          class="btn bg-gray-200 text-sm text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
          @click="scrollToTop"
        >
          Back to Top
        </button>
      </div>
    </div>

    <LoanPayoffGantt
      :bars="countdownSimulation.bars"
      :message="countdownSimulation.error"
      caption="Same snowball as the tables above: 1st/15th disposable, extras, and starting month."
    />
  </div>
</template>
