<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ApexCharts from 'apexcharts'
import api from '@/api/client'

const activeTab = ref('tracker')
const loading = ref(false)
const mainMsg = ref('')
const mainError = ref('')
const uploadImportFile = ref(null)
const uploadPreviewFile = ref(null)
const uploadingImport = ref(false)
const uploadingPreview = ref(false)

const TRANSACTION_TYPES = [
  { value: 'disposable', label: 'Disposable' },
  { value: 'covered', label: 'Covered' },
  { value: 'impulse buy', label: 'Impulse buy' },
]

const SEARCH_TYPES = [
  { value: 'contains', label: 'Contains' },
  { value: 'starts with', label: 'Starts with' },
  { value: 'ends with', label: 'Ends with' },
  { value: 'regex', label: 'Regex' },
]

const TRACKER_START_PAYCHECK_DATE_KEY = 'disposableTrackerStartPaycheckDate'
const TRACKER_END_PAYCHECK_DATE_KEY = 'disposableTrackerEndPaycheckDate'
const TRACKER_SORT_BY_KEY = 'disposableTrackerSortBy'
const TRACKER_SORT_DIR_KEY = 'disposableTrackerSortDir'

const TRACKER_SORT_BY_OPTIONS = ['name', 'transaction_date', 'amount']
const TRACKER_SORT_DIR_OPTIONS = ['ASC', 'DESC']

function readStoredTrackerSortBy() {
  const stored = localStorage.getItem(TRACKER_SORT_BY_KEY)
  return TRACKER_SORT_BY_OPTIONS.includes(stored) ? stored : 'transaction_date'
}

function readStoredTrackerSortDir() {
  const stored = localStorage.getItem(TRACKER_SORT_DIR_KEY)
  return TRACKER_SORT_DIR_OPTIONS.includes(stored) ? stored : 'ASC'
}

const paycheckDate = ref('')
const transactionDate = ref(null)
const trackerStartPaycheckDate = ref('')
const trackerEndPaycheckDate = ref('')
const trackerTransactionTypes = ref(['disposable'])
const trackerKeyword1Mode = ref('includes')
const trackerKeyword1Match = ref('contains')
const trackerKeyword1 = ref('')
const trackerKeyword2Mode = ref('includes')
const trackerKeyword2Match = ref('contains')
const trackerKeyword2 = ref('')
const trackerSortBy = ref(readStoredTrackerSortBy())
const trackerSortDir = ref(readStoredTrackerSortDir())
const trackerSelectedIds = ref([])
const trackerBulkTransactionType = ref('disposable')
const trackerBulkUpdating = ref(false)
const showSaveSearchModal = ref(false)
const savingSearch = ref(false)
const savedSearches = ref([])
const savedSearchForm = ref({
  id: null,
  keyword: '',
  search_type: 'contains',
  transaction_type: 'covered',
})
const savedSearchSaving = ref(false)
const savedSearchBusy = ref(false)
const startPaycheckDateOptions = ref([])
const endPaycheckDateOptions = ref([])
const categoryName = ref(null)
const drilldownLevel = ref('root')
const chartLabel = ref('Dates')
const cumulative = ref(false)

const transactions = ref([])
const allTransactions = ref([])
const allTransactionsAmountTotal = ref(0)
const disposableAccountNames = ref([])
const disposableAccountTypes = ref([])
const disposableAccountNumbers = ref([])
const disposableInstitutionNames = ref([])
const disposableCategoryNames = ref([])

const allTxStartDate = ref('')
const allTxEndDate = ref('')
const allTxCategoryName = ref('')
const allTxAccountType = ref('')
const allTxAccountName = ref('')
const allTxAccountNumber = ref('')
const allTxInstitutionName = ref('')
const allTxName1 = ref('')
const allTxName2 = ref('')
const allTxName3 = ref('')
const allTxAmountStart = ref('')
const allTxAmountEnd = ref('')
const allTxSortBy1 = ref('transaction_date')
const allTxSortDir1 = ref('DESC')
const allTxSortBy2 = ref('name')
const allTxSortDir2 = ref('ASC')

const transactionCategories = ref([])
const drilldownTransactions = ref([])
const drilldownTransactionsAmountTotal = ref(0)
const txCategoriesStartDate = ref('')
const txCategoriesEndDate = ref('')
const txCategoriesSortBy = ref('title')
const txCategoriesSortDir = ref('ASC')
const transactionCategoryDrilldownLevel = ref('root')
const transactionCategoryName = ref(null)

const chartRef = ref(null)
let chartInstance = null

function initDefaultDateRange() {
  const end = new Date()
  const start = new Date()
  start.setMonth(start.getMonth() - 3)
  const endStr = end.toISOString().split('T')[0]
  const startStr = start.toISOString().split('T')[0]
  txCategoriesEndDate.value = endStr
  txCategoriesStartDate.value = startStr
  allTxEndDate.value = endStr
  allTxStartDate.value = startStr
}

function formatDateISO(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatPaycheckDateLabel(date) {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function generatePaycheckDateOptions() {
  const startOptions = []
  const endOptions = []
  const now = new Date()
  const startYear = now.getFullYear() - 2
  const endYear = now.getFullYear() + 1

  for (let year = startYear; year <= endYear; year++) {
    for (let month = 0; month < 12; month++) {
      const fourteenth = new Date(year, month, 14)
      const twentyEighth = new Date(year, month, 28)
      const thirteenth = new Date(year, month, 13)
      const twentySeventh = new Date(year, month, 27)

      startOptions.push({ value: formatDateISO(fourteenth), label: formatPaycheckDateLabel(fourteenth) })
      startOptions.push({ value: formatDateISO(twentyEighth), label: formatPaycheckDateLabel(twentyEighth) })
      endOptions.push({ value: formatDateISO(thirteenth), label: formatPaycheckDateLabel(thirteenth) })
      endOptions.push({ value: formatDateISO(twentySeventh), label: formatPaycheckDateLabel(twentySeventh) })
    }
  }

  startOptions.sort((a, b) => a.value.localeCompare(b.value))
  endOptions.sort((a, b) => a.value.localeCompare(b.value))
  startPaycheckDateOptions.value = startOptions
  endPaycheckDateOptions.value = endOptions
}

function getDefaultTrackerPaycheckRange() {
  const today = new Date()
  const day = today.getDate()
  const year = today.getFullYear()
  const month = today.getMonth()

  // Periods: 28th → 13th (crosses month), or 14th → 27th
  if (day >= 14 && day <= 27) {
    return {
      start: formatDateISO(new Date(year, month, 14)),
      end: formatDateISO(new Date(year, month, 27)),
    }
  }

  if (day >= 28) {
    const nextMonth = month === 11 ? 0 : month + 1
    const nextYear = month === 11 ? year + 1 : year
    return {
      start: formatDateISO(new Date(year, month, 28)),
      end: formatDateISO(new Date(nextYear, nextMonth, 13)),
    }
  }

  // day 1–13: previous month's 28th through this month's 13th
  const prevMonth = month === 0 ? 11 : month - 1
  const prevYear = month === 0 ? year - 1 : year
  return {
    start: formatDateISO(new Date(prevYear, prevMonth, 28)),
    end: formatDateISO(new Date(year, month, 13)),
  }
}

function initTrackerPaycheckDates() {
  const range = getDefaultTrackerPaycheckRange()
  const savedStart = localStorage.getItem(TRACKER_START_PAYCHECK_DATE_KEY)
  const savedEnd = localStorage.getItem(TRACKER_END_PAYCHECK_DATE_KEY)
  const startValid = savedStart && startPaycheckDateOptions.value.some((option) => option.value === savedStart)
  const endValid = savedEnd && endPaycheckDateOptions.value.some((option) => option.value === savedEnd)

  trackerStartPaycheckDate.value = startValid ? savedStart : range.start
  trackerEndPaycheckDate.value = endValid ? savedEnd : range.end
  paycheckDate.value = trackerEndPaycheckDate.value
}

function syncChartPaycheckDate() {
  paycheckDate.value = trackerEndPaycheckDate.value
}

function toggleTrackerTransactionType(type) {
  if (trackerTransactionTypes.value.includes(type)) {
    trackerTransactionTypes.value = trackerTransactionTypes.value.filter((value) => value !== type)
  } else {
    trackerTransactionTypes.value = [...trackerTransactionTypes.value, type]
  }
}

const trackerAllSelected = computed({
  get() {
    return (
      transactions.value.length > 0 &&
      transactions.value.every((item) => trackerSelectedIds.value.includes(item.id))
    )
  },
  set(checked) {
    trackerSelectedIds.value = checked ? transactions.value.map((item) => item.id) : []
  },
})

function toggleTrackerSelected(id) {
  if (trackerSelectedIds.value.includes(id)) {
    trackerSelectedIds.value = trackerSelectedIds.value.filter((value) => value !== id)
  } else {
    trackerSelectedIds.value = [...trackerSelectedIds.value, id]
  }
}

watch(trackerKeyword1Mode, (mode) => {
  if (mode === 'excludes' && trackerKeyword1Match.value === 'regex') {
    trackerKeyword1Match.value = 'contains'
  }
})

watch(trackerKeyword2Mode, (mode) => {
  if (mode === 'excludes' && trackerKeyword2Match.value === 'regex') {
    trackerKeyword2Match.value = 'contains'
  }
})

watch(trackerStartPaycheckDate, (value) => {
  if (value) {
    localStorage.setItem(TRACKER_START_PAYCHECK_DATE_KEY, value)
  }
})

watch(trackerEndPaycheckDate, (value) => {
  if (value) {
    localStorage.setItem(TRACKER_END_PAYCHECK_DATE_KEY, value)
  }
})

watch(trackerSortBy, (value) => {
  if (TRACKER_SORT_BY_OPTIONS.includes(value)) {
    localStorage.setItem(TRACKER_SORT_BY_KEY, value)
  }
})

watch(trackerSortDir, (value) => {
  if (TRACKER_SORT_DIR_OPTIONS.includes(value)) {
    localStorage.setItem(TRACKER_SORT_DIR_KEY, value)
  }
})

async function loadTransactions() {
  try {
    const params = {
      start_paycheck_date: trackerStartPaycheckDate.value,
      end_paycheck_date: trackerEndPaycheckDate.value,
      sort_by: trackerSortBy.value,
      sort_dir: trackerSortDir.value,
    }

    if (trackerTransactionTypes.value.length) {
      params.transaction_types = trackerTransactionTypes.value
    }

    if (trackerKeyword1.value.trim()) {
      params.keyword1 = trackerKeyword1.value.trim()
      params.keyword1_mode = trackerKeyword1Mode.value
      params.keyword1_match = trackerKeyword1Match.value
    }

    if (trackerKeyword2.value.trim()) {
      params.keyword2 = trackerKeyword2.value.trim()
      params.keyword2_mode = trackerKeyword2Mode.value
      params.keyword2_match = trackerKeyword2Match.value
    }

    const { data } = await api.get('/api/loadDisposableTransactions.php', { params })
    transactions.value = data?.items || []
    trackerSelectedIds.value = []
  } catch {
    transactions.value = []
    trackerSelectedIds.value = []
  }
}

async function applyTrackerFilters() {
  if (!trackerTransactionTypes.value.length) {
    mainError.value = 'Select at least one transaction type.'
    return
  }

  if (
    trackerStartPaycheckDate.value &&
    trackerEndPaycheckDate.value &&
    trackerStartPaycheckDate.value > trackerEndPaycheckDate.value
  ) {
    mainError.value = 'Start paycheck date must be on or before end paycheck date.'
    return
  }

  mainError.value = ''
  syncChartPaycheckDate()
  loading.value = true
  try {
    await Promise.all([loadTransactions(), loadChartData()])
  } finally {
    loading.value = false
  }
}

function mapKeywordMatchToSearchType(match) {
  switch (match) {
    case 'starts_with':
      return 'starts with'
    case 'ends_with':
      return 'ends with'
    case 'regex':
      return 'regex'
    default:
      return 'contains'
  }
}

function shouldPromptSaveCoveredSearch() {
  return (
    trackerKeyword1.value.trim() !== '' &&
    trackerAllSelected.value &&
    trackerBulkTransactionType.value === 'covered'
  )
}

async function markSelectedTransactionType() {
  if (!trackerSelectedIds.value.length) {
    mainError.value = 'Select at least one transaction.'
    return
  }

  if (shouldPromptSaveCoveredSearch()) {
    showSaveSearchModal.value = true
    return
  }

  await performBulkTransactionTypeUpdate()
}

async function confirmSaveSearchAndMark() {
  savingSearch.value = true
  mainMsg.value = ''
  mainError.value = ''
  try {
    const { data } = await api.post('/api/createDisposableSavedSearch.php', {
      keyword: trackerKeyword1.value.trim(),
      search_type: mapKeywordMatchToSearchType(trackerKeyword1Match.value),
      transaction_type: 'covered',
    })
    if (!data?.success) {
      mainError.value = data?.error || 'Failed to save search.'
      return
    }
    showSaveSearchModal.value = false
    await performBulkTransactionTypeUpdate()
    await loadSavedSearches()
  } catch (err) {
    mainError.value = err.response?.data?.error || err.response?.data?.message || 'Failed to save search.'
  } finally {
    savingSearch.value = false
  }
}

async function skipSaveSearchAndMark() {
  showSaveSearchModal.value = false
  await performBulkTransactionTypeUpdate()
}

async function performBulkTransactionTypeUpdate() {
  trackerBulkUpdating.value = true
  mainMsg.value = ''
  mainError.value = ''
  try {
    const { data } = await api.post('/api/updateDisposableTransactionTypes.php', {
      ids: trackerSelectedIds.value,
      transaction_type: trackerBulkTransactionType.value,
    })
    if (data?.success) {
      mainMsg.value = `Updated ${data.updated} transaction(s).`
      await loadTransactions()
    } else {
      mainError.value = data?.error || 'Update failed.'
    }
  } catch (err) {
    mainError.value = err.response?.data?.error || err.response?.data?.message || 'Update failed.'
  } finally {
    trackerBulkUpdating.value = false
  }
}

async function loadSavedSearches() {
  try {
    const { data } = await api.get('/api/loadDisposableSavedSearches.php')
    savedSearches.value = data?.items || []
  } catch {
    savedSearches.value = []
  }
}

function resetSavedSearchForm() {
  savedSearchForm.value = {
    id: null,
    keyword: '',
    search_type: 'contains',
    transaction_type: 'covered',
  }
}

function editSavedSearch(item) {
  savedSearchForm.value = {
    id: item.id,
    keyword: item.keyword,
    search_type: item.search_type,
    transaction_type: item.transaction_type,
  }
}

async function saveSavedSearchForm() {
  if (!savedSearchForm.value.keyword.trim()) {
    mainError.value = 'Keyword is required.'
    return
  }

  savedSearchSaving.value = true
  mainMsg.value = ''
  mainError.value = ''
  try {
    const payload = {
      keyword: savedSearchForm.value.keyword.trim(),
      search_type: savedSearchForm.value.search_type,
      transaction_type: savedSearchForm.value.transaction_type,
    }
    let data
    if (savedSearchForm.value.id) {
      ;({ data } = await api.post('/api/updateDisposableSavedSearch.php', {
        id: savedSearchForm.value.id,
        ...payload,
      }))
    } else {
      ;({ data } = await api.post('/api/createDisposableSavedSearch.php', payload))
    }
    if (data?.success) {
      mainMsg.value = savedSearchForm.value.id ? 'Saved search updated.' : 'Saved search created.'
      resetSavedSearchForm()
      await loadSavedSearches()
    } else {
      mainError.value = data?.error || 'Failed to save.'
    }
  } catch (err) {
    mainError.value = err.response?.data?.error || err.response?.data?.message || 'Failed to save.'
  } finally {
    savedSearchSaving.value = false
  }
}

async function deleteSavedSearch(id) {
  if (!confirm('Delete this saved search?')) return

  mainMsg.value = ''
  mainError.value = ''
  try {
    const { data } = await api.post('/api/deleteDisposableSavedSearch.php', { id })
    if (data?.success) {
      mainMsg.value = 'Saved search deleted.'
      if (savedSearchForm.value.id === id) {
        resetSavedSearchForm()
      }
      await loadSavedSearches()
    } else {
      mainError.value = data?.error || 'Delete failed.'
    }
  } catch (err) {
    mainError.value = err.response?.data?.error || err.response?.data?.message || 'Delete failed.'
  }
}

async function revertAllToDisposable() {
  if (!confirm('Set every transaction to disposable?')) return

  savedSearchBusy.value = true
  mainMsg.value = ''
  mainError.value = ''
  try {
    const { data } = await api.post('/api/revertDisposableTransactions.php')
    if (data?.success) {
      mainMsg.value = `Reverted ${data.updated} transaction(s) to disposable.`
      await loadTransactions()
    } else {
      mainError.value = data?.error || 'Revert failed.'
    }
  } catch (err) {
    mainError.value = err.response?.data?.error || err.response?.data?.message || 'Revert failed.'
  } finally {
    savedSearchBusy.value = false
  }
}

async function reRunSavedSearches() {
  if (!confirm('Re-run all saved searches against every transaction?')) return

  savedSearchBusy.value = true
  mainMsg.value = ''
  mainError.value = ''
  try {
    const { data } = await api.post('/api/reRunDisposableSavedSearches.php')
    if (data?.success) {
      mainMsg.value = `Applied ${data.searches_applied} saved search(es); updated ${data.updated} transaction(s).`
      await loadTransactions()
    } else {
      mainError.value = data?.error || 'Re-run failed.'
    }
  } catch (err) {
    mainError.value = err.response?.data?.error || err.response?.data?.message || 'Re-run failed.'
  } finally {
    savedSearchBusy.value = false
  }
}

async function loadTransactionCategories() {
  try {
    const { data } = await api.get('/api/loadTransactionCategories.php', {
      params: {
        start_date: txCategoriesStartDate.value,
        end_date: txCategoriesEndDate.value,
        sort_by: txCategoriesSortBy.value,
        sort_dir: txCategoriesSortDir.value,
      },
    })
    if (data?.error) {
      transactionCategories.value = []
      return
    }
    transactionCategories.value = data?.items || []
  } catch {
    transactionCategories.value = []
  }
}

function resetTransactionCategoryDrilldown() {
  transactionCategoryDrilldownLevel.value = 'root'
  transactionCategoryName.value = null
  drilldownTransactions.value = []
  drilldownTransactionsAmountTotal.value = 0
}

async function drilldownIntoTransactionCategory(category) {
  transactionCategoryDrilldownLevel.value = 'category'
  transactionCategoryName.value = category
  await loadDrilldownTransactions()
}

async function loadDrilldownTransactions() {
  try {
    const { data } = await api.get('/api/loadTransactionDrilldown.php', {
      params: {
        category_name: transactionCategoryName.value,
        start_date: txCategoriesStartDate.value,
        end_date: txCategoriesEndDate.value,
        sort_by: txCategoriesSortBy.value,
        sort_dir: txCategoriesSortDir.value,
      },
    })
    if (data?.error) {
      drilldownTransactions.value = []
      drilldownTransactionsAmountTotal.value = 0
      return
    }
    drilldownTransactions.value = data?.items || []
    drilldownTransactionsAmountTotal.value =
      data?.amount_total != null ? Number(data.amount_total) : 0
  } catch {
    drilldownTransactions.value = []
    drilldownTransactionsAmountTotal.value = 0
  }
}

async function loadDisposableFilterOptions() {
  try {
    const [names, types, numbers, institutions, categories] = await Promise.all([
      api.get('/api/loadDisposableAccountNames.php'),
      api.get('/api/loadDisposableAccountTypes.php'),
      api.get('/api/loadDisposableAccountNumbers.php'),
      api.get('/api/loadDisposableInstitutionNames.php'),
      api.get('/api/loadDisposableCategoryNames.php'),
    ])
    disposableAccountNames.value = names.data?.items || []
    disposableAccountTypes.value = types.data?.items || []
    disposableAccountNumbers.value = numbers.data?.items || []
    disposableInstitutionNames.value = institutions.data?.items || []
    disposableCategoryNames.value = categories.data?.items || []
  } catch {
    /* ignore */
  }
}

function clearAllTxFilters() {
  initDefaultDateRange()
  allTxCategoryName.value = ''
  allTxAccountType.value = ''
  allTxAccountName.value = ''
  allTxAccountNumber.value = ''
  allTxInstitutionName.value = ''
  allTxName1.value = ''
  allTxName2.value = ''
  allTxName3.value = ''
  allTxAmountStart.value = ''
  allTxAmountEnd.value = ''
  allTxSortBy1.value = 'transaction_date'
  allTxSortDir1.value = 'DESC'
  allTxSortBy2.value = 'name'
  allTxSortDir2.value = 'ASC'
  loadAllTransactions()
}

async function loadAllTransactions() {
  try {
    const params = {
      start_date: allTxStartDate.value,
      end_date: allTxEndDate.value,
      sort_by1: allTxSortBy1.value,
      sort_dir1: allTxSortDir1.value,
      sort_by2: allTxSortBy2.value,
      sort_dir2: allTxSortDir2.value,
    }
    if (allTxCategoryName.value) params.category_name = allTxCategoryName.value
    if (allTxAccountType.value) params.account_type = allTxAccountType.value
    if (allTxAccountName.value) params.account_name = allTxAccountName.value
    if (allTxAccountNumber.value) params.account_number = allTxAccountNumber.value
    if (allTxInstitutionName.value) params.institution_name = allTxInstitutionName.value
    if (allTxName1.value) params.name1 = allTxName1.value
    if (allTxName2.value) params.name2 = allTxName2.value
    if (allTxName3.value) params.name3 = allTxName3.value
    if (allTxAmountStart.value !== '') params.amount_start = allTxAmountStart.value
    if (allTxAmountEnd.value !== '') params.amount_end = allTxAmountEnd.value

    const { data } = await api.get('/api/loadTransactionAll.php', { params })
    if (data?.error) {
      allTransactions.value = []
      allTransactionsAmountTotal.value = 0
      return
    }
    allTransactions.value = data?.items || []
    allTransactionsAmountTotal.value = data?.amount_total != null ? Number(data.amount_total) : 0
  } catch {
    allTransactions.value = []
    allTransactionsAmountTotal.value = 0
  }
}

async function drilldownIntoChart(dimension) {
  if (drilldownLevel.value === 'root') {
    const dayOfMonth = parseInt(dimension.split(', ')[1], 10)
    const yearMonth = paycheckDate.value.slice(0, 7)
    transactionDate.value = `${yearMonth}-${String(dayOfMonth).padStart(2, '0')}`
    drilldownLevel.value = 'day'
    await loadChartData()
  } else if (drilldownLevel.value === 'day') {
    categoryName.value = dimension
    drilldownLevel.value = 'category'
    await loadChartData()
  }
}

async function reverseDrilldownChart() {
  if (drilldownLevel.value === 'category') {
    drilldownLevel.value = 'day'
    categoryName.value = null
    await loadChartData()
  } else if (drilldownLevel.value === 'day') {
    drilldownLevel.value = 'root'
    transactionDate.value = null
    await loadChartData()
  }
}

async function loadChartData() {
  const cumulativeParam = cumulative.value ? 1 : 0

  if (drilldownLevel.value === 'root') {
    chartLabel.value = 'Dates'
    try {
      const { data } = await api.get('/api/loadDisposableTransactionsChartData.php', {
        params: { paycheck_date: paycheckDate.value, cumulative: cumulativeParam },
      })
      if (data && chartInstance) {
        chartInstance.updateOptions(data.chartOptions)
        chartInstance.updateSeries(data.series)
        chartInstance.updateOptions({
          yaxis: { min: 0, max: data.maxY || undefined },
        })
      }
    } catch {
      /* ignore */
    }
  } else if (drilldownLevel.value === 'day') {
    chartLabel.value = 'Categories'
    try {
      const { data } = await api.get('/api/loadDisposableTransactionsChartDataDay.php', {
        params: {
          paycheck_date: paycheckDate.value,
          transaction_date: transactionDate.value,
          cumulative: cumulativeParam,
        },
      })
      if (data && chartInstance) {
        chartInstance.updateOptions(data.chartOptions)
        chartInstance.updateSeries(data.series)
      }
    } catch {
      /* ignore */
    }
  } else if (drilldownLevel.value === 'category') {
    chartLabel.value = 'Transactions'
    try {
      const { data } = await api.get('/api/loadDisposableTransactionsChartDataCategory.php', {
        params: {
          paycheck_date: paycheckDate.value,
          transaction_date: transactionDate.value,
          category_name: categoryName.value,
          cumulative: cumulativeParam,
        },
      })
      if (data && chartInstance) {
        chartInstance.updateOptions(data.chartOptions)
        chartInstance.updateSeries(data.series)
      }
    } catch {
      /* ignore */
    }
  }
}

async function updateAllNotCovered() {
  try {
    const { data } = await api.get('/api/updateAllNotCovered.php', {
      params: { paycheck_date: paycheckDate.value },
    })
    if (data?.success) {
      await loadData()
    }
  } catch {
    /* ignore */
  }
}

async function loadData() {
  syncChartPaycheckDate()
  await Promise.all([loadTransactions(), loadChartData(), loadTransactionCategories()])
}

function onImportFileChange(event) {
  uploadImportFile.value = event.target.files?.[0] || null
}

function onPreviewFileChange(event) {
  uploadPreviewFile.value = event.target.files?.[0] || null
}

async function submitImportUpload() {
  if (!uploadImportFile.value) {
    mainError.value = 'Please select a CSV file.'
    return
  }
  uploadingImport.value = true
  mainMsg.value = ''
  mainError.value = ''
  try {
    const formData = new FormData()
    formData.append('rocket_money_file', uploadImportFile.value)
    const { data } = await api.post('/api/disposable/upload_import.php', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    mainMsg.value = data.message || 'File uploaded successfully.'
    if (data.saved_searches_applied != null) {
      mainMsg.value += ` Applied ${data.saved_searches_applied} saved search(es) (${data.saved_searches_updated || 0} updated).`
    }
    uploadImportFile.value = null
    await loadData()
    await loadSavedSearches()
  } catch (err) {
    mainError.value = err.response?.data?.message || 'Upload failed.'
  } finally {
    uploadingImport.value = false
  }
}

async function submitPreviewUpload() {
  if (!uploadPreviewFile.value) {
    mainError.value = 'Please select a CSV file.'
    return
  }
  uploadingPreview.value = true
  mainMsg.value = ''
  mainError.value = ''
  try {
    const formData = new FormData()
    formData.append('rocket_money_file', uploadPreviewFile.value)
    const { data } = await api.post('/api/disposable/upload_preview.php', formData, {
      responseType: 'blob',
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    const url = URL.createObjectURL(data)
    const link = document.createElement('a')
    link.href = url
    link.download = 'disposable_income_tracker_main_output.csv'
    link.click()
    URL.revokeObjectURL(url)
    mainMsg.value = 'CSV downloaded.'
    uploadPreviewFile.value = null
  } catch (err) {
    mainError.value = err.response?.data?.message || 'Upload failed.'
  } finally {
    uploadingPreview.value = false
  }
}

function initChart() {
  if (!chartRef.value) return
  chartInstance = new ApexCharts(chartRef.value, {
    chart: {
      type: 'bar',
      events: {
        dataPointSelection(_event, _chartContext, config) {
          const categories = config.w.config.xaxis.categories || []
          const clicked = categories[config.dataPointIndex]
          if (clicked) {
            drilldownIntoChart(clicked)
          }
        },
      },
    },
    xaxis: { categories: [] },
    series: [{ name: 'Spent', data: [] }],
  })
  chartInstance.render()
}

onMounted(async () => {
  initDefaultDateRange()
  generatePaycheckDateOptions()
  initTrackerPaycheckDates()
  loading.value = true
  try {
    await loadData()
    await loadDisposableFilterOptions()
    await loadAllTransactions()
    await loadSavedSearches()
  } finally {
    loading.value = false
  }
  await nextTick()
  initChart()
  await loadChartData()
})

onBeforeUnmount(() => {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Disposable Income Tracker</h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Track Rocket Money spending by paycheck period.
      </p>
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

    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="-mb-px flex gap-4">
        <button
          v-for="tab in [
            { id: 'tracker', label: 'Tracker' },
            { id: 'upload', label: 'Upload' },
            { id: 'transactions', label: 'Transactions' },
            { id: 'saved-searches', label: 'Saved Searches' },
          ]"
          :key="tab.id"
          type="button"
          class="border-b-2 px-1 py-3 text-sm font-medium transition-colors"
          :class="
            activeTab === tab.id
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400'
          "
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </nav>
    </div>

    <!-- Tracker tab -->
    <div v-show="activeTab === 'tracker'" class="space-y-6">
      <div class="card">
        <div class="card-body space-y-4">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Upload Rocket Money Data</h2>
          <input
            type="file"
            accept=".csv"
            class="form-input w-full max-w-lg"
            @change="onImportFileChange"
          />
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="btn bg-primary-500 text-white hover:bg-primary-600"
              :disabled="uploadingImport"
              @click="submitImportUpload"
            >
              {{ uploadingImport ? 'Uploading…' : 'Upload File' }}
            </button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-body space-y-4">
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">Tracker filters</h3>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Start paycheck date</label>
              <select v-model="trackerStartPaycheckDate" class="form-input w-full">
                <option v-for="option in startPaycheckDateOptions" :key="'start-' + option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">End paycheck date</label>
              <select v-model="trackerEndPaycheckDate" class="form-input w-full">
                <option v-for="option in endPaycheckDateOptions" :key="'end-' + option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>
            <div class="sm:col-span-2">
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Transaction type</label>
              <div class="flex flex-wrap gap-4">
                <label
                  v-for="type in TRANSACTION_TYPES"
                  :key="type.value"
                  class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <input
                    type="checkbox"
                    class="rounded"
                    :checked="trackerTransactionTypes.includes(type.value)"
                    @change="toggleTrackerTransactionType(type.value)"
                  />
                  {{ type.label }}
                </label>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div class="space-y-2">
              <label class="block text-sm text-gray-600 dark:text-gray-400">Keyword search 1</label>
              <div class="flex flex-wrap gap-2">
                <select v-model="trackerKeyword1Mode" class="form-input w-32">
                  <option value="includes">Includes</option>
                  <option value="excludes">Excludes</option>
                </select>
                <div class="relative min-w-0 flex-1">
                  <input
                    v-model="trackerKeyword1"
                    type="text"
                    placeholder="Keyword…"
                    class="form-input w-full pr-9"
                    @keydown.enter.prevent="applyTrackerFilters"
                  />
                  <button
                    v-if="trackerKeyword1"
                    type="button"
                    class="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    aria-label="Clear keyword 1"
                    @click="trackerKeyword1 = ''"
                  >
                    ×
                  </button>
                </div>
                <select v-model="trackerKeyword1Match" class="form-input w-36">
                  <option value="contains">Contains</option>
                  <option value="starts_with">Starts with</option>
                  <option value="ends_with">Ends with</option>
                  <option v-if="trackerKeyword1Mode === 'includes'" value="regex">Regex</option>
                </select>
              </div>
            </div>
            <div class="space-y-2">
              <label class="block text-sm text-gray-600 dark:text-gray-400">Keyword search 2</label>
              <div class="flex flex-wrap gap-2">
                <select v-model="trackerKeyword2Mode" class="form-input w-32">
                  <option value="includes">Includes</option>
                  <option value="excludes">Excludes</option>
                </select>
                <div class="relative min-w-0 flex-1">
                  <input
                    v-model="trackerKeyword2"
                    type="text"
                    placeholder="Keyword…"
                    class="form-input w-full pr-9"
                    @keydown.enter.prevent="applyTrackerFilters"
                  />
                  <button
                    v-if="trackerKeyword2"
                    type="button"
                    class="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    aria-label="Clear keyword 2"
                    @click="trackerKeyword2 = ''"
                  >
                    ×
                  </button>
                </div>
                <select v-model="trackerKeyword2Match" class="form-input w-36">
                  <option value="contains">Contains</option>
                  <option value="starts_with">Starts with</option>
                  <option value="ends_with">Ends with</option>
                  <option v-if="trackerKeyword2Mode === 'includes'" value="regex">Regex</option>
                </select>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Sort by</label>
              <select v-model="trackerSortBy" class="form-input w-full">
                <option value="name">Name</option>
                <option value="transaction_date">Transaction date</option>
                <option value="amount">Amount</option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Sort direction</label>
              <select v-model="trackerSortDir" class="form-input w-full">
                <option value="ASC">Ascending</option>
                <option value="DESC">Descending</option>
              </select>
            </div>
          </div>

          <div class="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              class="btn bg-primary-500 text-white hover:bg-primary-600"
              @click="applyTrackerFilters"
            >
              Apply filters
            </button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Rocket Money Data</h3>
            <div class="flex shrink-0 flex-nowrap items-center gap-2">
              <button
                type="button"
                class="btn min-w-[8.75rem] shrink-0 whitespace-nowrap bg-primary-500 text-white hover:bg-primary-600"
                :disabled="trackerBulkUpdating || !trackerSelectedIds.length"
                @click="markSelectedTransactionType"
              >
                {{ trackerBulkUpdating ? 'Updating…' : 'Mark selected' }}
              </button>
              <select v-model="trackerBulkTransactionType" class="form-input w-40">
                <option v-for="type in TRANSACTION_TYPES" :key="'bulk-' + type.value" :value="type.value">
                  {{ type.label }}
                </option>
              </select>
            </div>
          </div>
          <div class="overflow-x-auto overflow-y-auto max-h-[450px]">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th class="px-3 py-2 w-10">
                    <input v-model="trackerAllSelected" type="checkbox" class="rounded" title="Select all" />
                  </th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 w-16">Date</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 w-24">Amount</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-if="!transactions.length">
                  <td colspan="4" class="px-3 py-6 text-center text-sm italic text-gray-500">
                    No rocket money data available
                  </td>
                </tr>
                <tr
                  v-for="item in transactions"
                  :key="item.id"
                  class="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <td class="px-3 py-2">
                    <input
                      type="checkbox"
                      class="rounded"
                      :checked="trackerSelectedIds.includes(item.id)"
                      @change="toggleTrackerSelected(item.id)"
                    />
                  </td>
                  <td class="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    {{ item.transaction_date_display || item.transaction_date }}
                  </td>
                  <td class="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 break-words">{{ item.name }}</td>
                  <td class="px-3 py-2 text-sm text-gray-900 dark:text-gray-100">${{ item.amount }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ chartLabel }}</h3>
            <div class="flex items-center gap-4">
              <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input v-model="cumulative" type="checkbox" class="rounded" @change="loadChartData" />
                Cumulative
              </label>
              <button
                v-if="chartLabel !== 'Dates'"
                type="button"
                class="btn bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                @click="reverseDrilldownChart"
              >
                Back
              </button>
            </div>
          </div>
          <div ref="chartRef" class="h-[350px] w-full"></div>
        </div>
      </div>
    </div>

    <!-- Upload tab -->
    <div v-show="activeTab === 'upload'" class="space-y-6">
      <div class="card">
        <div class="card-body space-y-4">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Upload Rocket Money Data</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Adds a Paycheck Date column and downloads the CSV.
          </p>
          <input
            type="file"
            accept=".csv"
            class="form-input w-full max-w-lg"
            @change="onPreviewFileChange"
          />
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="btn bg-primary-500 text-white hover:bg-primary-600"
              :disabled="uploadingPreview"
              @click="submitPreviewUpload"
            >
              {{ uploadingPreview ? 'Processing…' : 'Upload File' }}
            </button>
            <button
              type="button"
              class="btn bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
              @click="updateAllNotCovered"
            >
              Mark All Not Covered
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Transactions tab -->
    <div v-show="activeTab === 'transactions'" class="space-y-6">
      <div class="card">
        <div class="card-body space-y-4">
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">Category summary filters</h3>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Start date</label>
              <input v-model="txCategoriesStartDate" type="date" class="form-input w-full" />
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">End date</label>
              <input v-model="txCategoriesEndDate" type="date" class="form-input w-full" />
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Order by</label>
              <select v-model="txCategoriesSortBy" class="form-input w-full">
                <option value="title">Title</option>
                <option value="amount">Amount</option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Direction</label>
              <select v-model="txCategoriesSortDir" class="form-input w-full">
                <option value="ASC">Ascending</option>
                <option value="DESC">Descending</option>
              </select>
            </div>
          </div>
          <div class="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              class="btn bg-primary-500 text-white hover:bg-primary-600"
              @click="loadTransactionCategories"
            >
              Apply filters
            </button>
          </div>
        </div>
      </div>

      <div v-if="transactionCategoryDrilldownLevel === 'root'" class="card">
        <div class="card-body">
          <h3 class="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Transaction categories</h3>
          <div class="overflow-x-auto overflow-y-auto max-h-[450px]">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Category</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 w-24">Amount</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-if="!transactionCategories.length">
                  <td colspan="2" class="px-3 py-6 text-center text-sm italic text-gray-500">No data for this range</td>
                </tr>
                <tr v-for="(item, index) in transactionCategories" :key="index">
                  <td class="px-3 py-2 text-sm">
                    <button
                      type="button"
                      class="text-primary-600 hover:underline dark:text-primary-400"
                      @click="drilldownIntoTransactionCategory(item.title)"
                    >
                      {{ item.title }}
                    </button>
                  </td>
                  <td class="px-3 py-2 text-sm">${{ item.amount_per_category }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div v-else class="card">
        <div class="card-body">
          <div class="mb-3 flex items-center gap-3">
            <button
              type="button"
              class="btn bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
              @click="resetTransactionCategoryDrilldown"
            >
              Back
            </button>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ transactionCategoryName }}</h3>
          </div>
          <div class="overflow-x-auto overflow-y-auto max-h-[450px]">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Category</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 w-24">Amount</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-if="!drilldownTransactions.length">
                  <td colspan="3" class="px-3 py-6 text-center text-sm italic text-gray-500">No data for this range</td>
                </tr>
                <tr v-for="(item, index) in drilldownTransactions" :key="index">
                  <td class="px-3 py-2 text-sm break-words">{{ item.name }}</td>
                  <td class="px-3 py-2 text-sm">${{ item.amount }}</td>
                  <td class="px-3 py-2 text-sm">{{ item.transaction_date }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="mt-3 flex justify-end border-t border-gray-200 pt-3 dark:border-gray-700">
            <span class="text-sm font-semibold">
              Total: ${{ Number(drilldownTransactionsAmountTotal).toFixed(2) }}
            </span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-body space-y-4">
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">All transactions — filters</h3>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Start date</label>
              <input v-model="allTxStartDate" type="date" class="form-input w-full" />
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">End date</label>
              <input v-model="allTxEndDate" type="date" class="form-input w-full" />
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Category</label>
              <select v-model="allTxCategoryName" class="form-input w-full">
                <option value="">All</option>
                <option v-for="(row, idx) in disposableCategoryNames" :key="'cat-' + idx" :value="row.category_name">
                  {{ row.category_name }}
                </option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Account type</label>
              <select v-model="allTxAccountType" class="form-input w-full">
                <option value="">All</option>
                <option v-for="(row, idx) in disposableAccountTypes" :key="'at-' + idx" :value="row.account_type">
                  {{ row.account_type }}
                </option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Account name</label>
              <select v-model="allTxAccountName" class="form-input w-full">
                <option value="">All</option>
                <option v-for="(row, idx) in disposableAccountNames" :key="'an-' + idx" :value="row.account_name">
                  {{ row.account_name }}
                </option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Account number</label>
              <select v-model="allTxAccountNumber" class="form-input w-full">
                <option value="">All</option>
                <option v-for="(row, idx) in disposableAccountNumbers" :key="'ano-' + idx" :value="row.account_number">
                  {{ row.account_number }}
                </option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Institution</label>
              <select v-model="allTxInstitutionName" class="form-input w-full">
                <option value="">All</option>
                <option
                  v-for="(row, idx) in disposableInstitutionNames"
                  :key="'in-' + idx"
                  :value="row.institution_name"
                >
                  {{ row.institution_name }}
                </option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Name search 1</label>
              <input v-model="allTxName1" type="text" placeholder="Contains…" class="form-input w-full" />
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Name search 2</label>
              <input v-model="allTxName2" type="text" placeholder="Contains…" class="form-input w-full" />
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Name search 3</label>
              <input v-model="allTxName3" type="text" placeholder="Contains…" class="form-input w-full" />
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Amount min</label>
              <input v-model="allTxAmountStart" type="text" placeholder="Optional" class="form-input w-full" />
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Amount max</label>
              <input v-model="allTxAmountEnd" type="text" placeholder="Optional" class="form-input w-full" />
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Sort by</label>
              <select v-model="allTxSortBy1" class="form-input w-full">
                <option value="transaction_date">Transaction date</option>
                <option value="amount">Amount</option>
                <option value="name">Name</option>
                <option value="category">Category</option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Direction</label>
              <select v-model="allTxSortDir1" class="form-input w-full">
                <option value="ASC">Ascending</option>
                <option value="DESC">Descending</option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Then sort by</label>
              <select v-model="allTxSortBy2" class="form-input w-full">
                <option value="name">Name</option>
                <option value="transaction_date">Transaction date</option>
                <option value="amount">Amount</option>
                <option value="category">Category</option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Then direction</label>
              <select v-model="allTxSortDir2" class="form-input w-full">
                <option value="ASC">Ascending</option>
                <option value="DESC">Descending</option>
              </select>
            </div>
          </div>
          <div class="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              class="btn bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
              @click="clearAllTxFilters"
            >
              Clear filters
            </button>
            <button
              type="button"
              class="btn bg-primary-500 text-white hover:bg-primary-600"
              @click="loadAllTransactions"
            >
              Apply filters
            </button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <h3 class="mb-3 text-lg font-semibold text-gray-900 dark:text-white">All transactions</h3>
          <div class="overflow-x-auto overflow-y-auto max-h-[450px]">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Category</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Expense</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 w-24">Amount</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-if="!allTransactions.length">
                  <td colspan="4" class="px-3 py-6 text-center text-sm italic text-gray-500">No data for this range</td>
                </tr>
                <tr v-for="(item, index) in allTransactions" :key="index">
                  <td class="px-3 py-2 text-sm break-words">{{ item.category_name }}</td>
                  <td class="px-3 py-2 text-sm break-words">{{ item.name }}</td>
                  <td class="px-3 py-2 text-sm">${{ item.amount }}</td>
                  <td class="px-3 py-2 text-sm">{{ item.transaction_date }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="mt-3 flex justify-end border-t border-gray-200 pt-3 dark:border-gray-700">
            <span class="text-sm font-semibold">
              Total: ${{ Number(allTransactionsAmountTotal).toFixed(2) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Saved Searches tab -->
    <div v-show="activeTab === 'saved-searches'" class="space-y-6">
      <div class="card">
        <div class="card-body space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Saved Searches</h2>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="btn bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                :disabled="savedSearchBusy"
                @click="revertAllToDisposable"
              >
                Revert All to Disposable
              </button>
              <button
                type="button"
                class="btn bg-primary-500 text-white hover:bg-primary-600"
                :disabled="savedSearchBusy"
                @click="reRunSavedSearches"
              >
                Re-Run Saved Searches
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Keyword</label>
              <input v-model="savedSearchForm.keyword" type="text" class="form-input w-full" />
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Search type</label>
              <select v-model="savedSearchForm.search_type" class="form-input w-full">
                <option v-for="type in SEARCH_TYPES" :key="type.value" :value="type.value">
                  {{ type.label }}
                </option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Transaction type</label>
              <select v-model="savedSearchForm.transaction_type" class="form-input w-full">
                <option v-for="type in TRANSACTION_TYPES" :key="'ss-' + type.value" :value="type.value">
                  {{ type.label }}
                </option>
              </select>
            </div>
            <div class="flex items-end gap-2">
              <button
                type="button"
                class="btn bg-primary-500 text-white hover:bg-primary-600"
                :disabled="savedSearchSaving"
                @click="saveSavedSearchForm"
              >
                {{ savedSearchSaving ? 'Saving…' : savedSearchForm.id ? 'Update' : 'Create' }}
              </button>
              <button
                v-if="savedSearchForm.id"
                type="button"
                class="btn bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                @click="resetSavedSearchForm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="overflow-x-auto overflow-y-auto max-h-[450px]">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Keyword</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Search type</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Transaction type</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 w-40">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-if="!savedSearches.length">
                  <td colspan="4" class="px-3 py-6 text-center text-sm italic text-gray-500">
                    No saved searches yet
                  </td>
                </tr>
                <tr v-for="item in savedSearches" :key="item.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td class="px-3 py-2 text-sm break-words">{{ item.keyword }}</td>
                  <td class="px-3 py-2 text-sm">{{ item.search_type }}</td>
                  <td class="px-3 py-2 text-sm">{{ item.transaction_type }}</td>
                  <td class="px-3 py-2 text-sm">
                    <div class="flex gap-2">
                      <button
                        type="button"
                        class="text-primary-600 hover:underline dark:text-primary-400"
                        @click="editSavedSearch(item)"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        class="text-red-600 hover:underline dark:text-red-400"
                        @click="deleteSavedSearch(item.id)"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="showSaveSearchModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div class="w-full max-w-md rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
        <p class="text-sm text-gray-800 dark:text-gray-200">
          Do you want to save this search for covered?
        </p>
        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="btn bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
            :disabled="savingSearch"
            @click="skipSaveSearchAndMark"
          >
            No
          </button>
          <button
            type="button"
            class="btn bg-primary-500 text-white hover:bg-primary-600"
            :disabled="savingSearch"
            @click="confirmSaveSearchAndMark"
          >
            {{ savingSearch ? 'Saving…' : 'Yes' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div class="rounded-lg bg-white px-6 py-4 shadow-lg dark:bg-gray-800">Loading…</div>
    </div>
  </div>
</template>
