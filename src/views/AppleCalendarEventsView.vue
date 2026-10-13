<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import api from '@/api/client'

const FILTER_STORAGE_KEY = 'apple_calendar_events_filters'
const CHICAGO_TZ = 'America/Chicago'

function todayYmd() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CHICAGO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function getDefaultFilters() {
  return {
    keyword_title: '',
    keyword_body: '',
    keyword_location: '',
    calendar_name: '',
    start_date: todayYmd(),
    end_date: '',
    sort_by: 'start_utc',
    sort_dir: 'ASC',
    show_cancelled: false,
  }
}

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

const stored = loadStoredFilters()
const defaults = getDefaultFilters()
const allowedSortBy = ['start_utc', 'end_utc', 'summary', 'calendar_name', 'location', 'status', 'last_modified_utc']

const events = ref([])
const calendars = ref([])
const viewingEvent = ref(null)
const copyStatus = ref('')
let copyStatusTimer = null

const filters = reactive({
  keyword_title:
    stored && typeof stored.keyword_title === 'string' ? stored.keyword_title : defaults.keyword_title,
  keyword_body:
    stored && typeof stored.keyword_body === 'string' ? stored.keyword_body : defaults.keyword_body,
  keyword_location:
    stored && typeof stored.keyword_location === 'string' ? stored.keyword_location : defaults.keyword_location,
  calendar_name:
    stored && typeof stored.calendar_name === 'string' ? stored.calendar_name : defaults.calendar_name,
  start_date: stored && typeof stored.start_date === 'string' ? stored.start_date : defaults.start_date,
  end_date: stored && typeof stored.end_date === 'string' ? stored.end_date : defaults.end_date,
  sort_by: stored && allowedSortBy.includes(stored.sort_by) ? stored.sort_by : defaults.sort_by,
  sort_dir:
    stored && (stored.sort_dir === 'ASC' || stored.sort_dir === 'DESC')
      ? stored.sort_dir
      : defaults.sort_dir,
  show_cancelled:
    stored && typeof stored.show_cancelled === 'boolean' ? stored.show_cancelled : defaults.show_cancelled,
})

const page = ref(1)
const perPage = ref(20)
const total = ref(0)
const totalPages = ref(1)
const loading = ref(false)
const error = ref('')

const pageNumbers = computed(() => {
  const totalP = totalPages.value
  const current = page.value
  if (totalP <= 1) return [1]
  if (totalP <= 9) return Array.from({ length: totalP }, (_, i) => i + 1)

  const pages = new Set([1, totalP, current, current - 1, current + 1, current - 2, current + 2])
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalP).sort((a, b) => a - b)
  const result = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('...')
    result.push(sorted[i])
  }
  return result
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
  { deep: true }
)

function persistFilters() {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters))
  } catch {
    /* ignore */
  }
}

async function loadEvents() {
  loading.value = true
  error.value = ''
  try {
    const params = {
      page: page.value,
      per_page: perPage.value,
      sort_by: filters.sort_by,
      sort_dir: filters.sort_dir,
    }
    if (filters.keyword_title) params.keyword_title = filters.keyword_title
    if (filters.keyword_body) params.keyword_body = filters.keyword_body
    if (filters.keyword_location) params.keyword_location = filters.keyword_location
    if (filters.calendar_name) params.calendar_name = filters.calendar_name
    if (filters.start_date) params.start_date = filters.start_date
    if (filters.end_date) params.end_date = filters.end_date
    if (filters.show_cancelled) params.show_cancelled = '1'

    const { data } = await api.get('/api/loadAppleCalendarEvents.php', { params })
    if (data?.error) {
      error.value = data.error
      events.value = []
      total.value = 0
      totalPages.value = 1
      return
    }

    events.value = (data.items || []).map((item) => ({
      ...item,
      id: parseInt(item.id, 10),
      all_day: Number(item.all_day) === 1,
      is_recurring: Number(item.is_recurring) === 1,
    }))
    calendars.value = data.calendars || []
    total.value = data.total || 0
    page.value = data.page || 1
    perPage.value = data.per_page || perPage.value
    totalPages.value = data.total_pages || 1
    viewingEvent.value = null
  } catch (err) {
    error.value = err.response?.data?.message || err.response?.data?.error || 'Failed to load events.'
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  page.value = 1
  persistFilters()
  loadEvents()
}

function clearKeyword(field) {
  if (!['keyword_title', 'keyword_body', 'keyword_location'].includes(field)) return
  filters[field] = ''
  applyFilters()
}

function clearDate(field) {
  if (field !== 'start_date' && field !== 'end_date') return
  filters[field] = ''
  applyFilters()
}

function clearFilters() {
  Object.assign(filters, getDefaultFilters())
  page.value = 1
  persistFilters()
  loadEvents()
}

function changePerPage() {
  page.value = 1
  loadEvents()
}

function goToPage(p) {
  if (p < 1 || p > totalPages.value) return
  page.value = p
  loadEvents()
}

function openEventModal(item) {
  viewingEvent.value = item
  copyStatus.value = ''
}

function closeEventModal() {
  viewingEvent.value = null
  copyStatus.value = ''
}

function eventBodyText(item) {
  return item?.description || ''
}

async function copyEventBody() {
  const text = eventBodyText(viewingEvent.value)
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    copyStatus.value = 'Copied'
    clearTimeout(copyStatusTimer)
    copyStatusTimer = setTimeout(() => {
      copyStatus.value = ''
    }, 1500)
  } catch {
    copyStatus.value = 'Failed'
    clearTimeout(copyStatusTimer)
    copyStatusTimer = setTimeout(() => {
      copyStatus.value = ''
    }, 1500)
  }
}

function formatEventWhen(value, allDay = false) {
  if (!value) return '—'
  const raw = String(value)
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (allDay) {
    if (!match) return raw
    return `${match[2]}/${match[3]}/${match[1]}`
  }
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const date = new Date(iso.endsWith('Z') ? iso : `${iso}Z`)
  if (Number.isNaN(date.getTime())) {
    if (!match) return raw
    if (!match[4]) return `${match[2]}/${match[3]}/${match[1]}`
    return `${match[2]}/${match[3]}/${match[1]} ${match[4]}:${match[5]}`
  }
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO_TZ,
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

onMounted(() => {
  loadEvents()
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Apple Calendar Events</h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Search and browse iCloud calendar events synced into MySQL.
      </p>
    </div>

    <div
      v-if="error"
      class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
    >
      {{ error }}
    </div>

    <div>
      <h2 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Events</h2>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <div>
          <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Title keyword</label>
          <div class="relative">
            <input
              v-model="filters.keyword_title"
              type="text"
              placeholder="Search title..."
              class="form-input w-full pr-9"
              @keyup.enter="applyFilters"
            />
            <button
              v-if="filters.keyword_title"
              type="button"
              class="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-700"
              aria-label="Clear title keyword"
              @click="clearKeyword('keyword_title')"
            >
              ×
            </button>
          </div>
        </div>
        <div>
          <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Description keyword</label>
          <div class="relative">
            <input
              v-model="filters.keyword_body"
              type="text"
              placeholder="Search description..."
              class="form-input w-full pr-9"
              @keyup.enter="applyFilters"
            />
            <button
              v-if="filters.keyword_body"
              type="button"
              class="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-700"
              aria-label="Clear description keyword"
              @click="clearKeyword('keyword_body')"
            >
              ×
            </button>
          </div>
        </div>
        <div>
          <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Location</label>
          <div class="relative">
            <input
              v-model="filters.keyword_location"
              type="text"
              placeholder="Search location..."
              class="form-input w-full pr-9"
              @keyup.enter="applyFilters"
            />
            <button
              v-if="filters.keyword_location"
              type="button"
              class="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-700"
              aria-label="Clear location"
              @click="clearKeyword('keyword_location')"
            >
              ×
            </button>
          </div>
        </div>
        <div>
          <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Calendar</label>
          <select v-model="filters.calendar_name" class="form-input w-full" @change="applyFilters">
            <option value="">All calendars</option>
            <option v-for="name in calendars" :key="name" :value="name">{{ name }}</option>
          </select>
        </div>
        <div>
          <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Start from</label>
          <div class="relative">
            <input v-model="filters.start_date" type="date" class="form-input w-full pr-9" />
            <button
              v-if="filters.start_date"
              type="button"
              class="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-700"
              aria-label="Clear start date"
              @click="clearDate('start_date')"
            >
              ×
            </button>
          </div>
        </div>
        <div>
          <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Start to</label>
          <div class="relative">
            <input v-model="filters.end_date" type="date" class="form-input w-full pr-9" />
            <button
              v-if="filters.end_date"
              type="button"
              class="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-700"
              aria-label="Clear end date"
              @click="clearDate('end_date')"
            >
              ×
            </button>
          </div>
        </div>
        <div>
          <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Sort by</label>
          <select v-model="filters.sort_by" class="form-input w-full" @change="applyFilters">
            <option value="start_utc">Start date</option>
            <option value="end_utc">End date</option>
            <option value="summary">Title</option>
            <option value="calendar_name">Calendar</option>
            <option value="location">Location</option>
            <option value="status">Status</option>
            <option value="last_modified_utc">Last modified</option>
          </select>
        </div>
        <div>
          <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">Sort direction</label>
          <select v-model="filters.sort_dir" class="form-input w-full" @change="applyFilters">
            <option value="ASC">ASC</option>
            <option value="DESC">DESC</option>
          </select>
        </div>
      </div>
    </div>

    <div
      class="sticky top-0 z-30 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/95"
    >
      <button type="button" class="btn bg-primary-500 text-white hover:bg-primary-600" @click="applyFilters">
        Search
      </button>
      <button
        type="button"
        class="btn bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
        @click="clearFilters"
      >
        Clear
      </button>
      <label class="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          v-model="filters.show_cancelled"
          type="checkbox"
          class="rounded border-gray-300"
          @change="applyFilters"
        />
        Show cancelled
      </label>
      <div class="ml-auto flex items-center gap-2">
        <label class="text-sm text-gray-600 dark:text-gray-400">Per page</label>
        <select v-model.number="perPage" class="form-input" @change="changePerPage">
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="text-sm text-gray-500">Loading events…</div>

    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th class="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">Title</th>
              <th class="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">Calendar</th>
              <th class="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">Start</th>
              <th class="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">End</th>
              <th class="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">Location</th>
              <th class="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">Description</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
            <tr v-if="!loading && events.length === 0">
              <td colspan="6" class="px-3 py-6 text-center text-gray-500">No events found.</td>
            </tr>
            <tr v-for="item in events" :key="item.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td class="px-3 py-3 align-top font-medium text-gray-900 dark:text-white">
                <div>{{ item.summary || '(Untitled)' }}</div>
                <div class="mt-1 flex flex-wrap gap-1">
                  <span
                    v-if="item.all_day"
                    class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  >
                    All day
                  </span>
                  <span
                    v-if="item.is_recurring"
                    class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  >
                    Recurring
                  </span>
                  <span
                    v-if="item.status"
                    class="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    :class="
                      String(item.status).toUpperCase() === 'CANCELLED'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                    "
                  >
                    {{ item.status }}
                  </span>
                </div>
              </td>
              <td class="px-3 py-3 align-top text-gray-600 dark:text-gray-300">
                {{ item.calendar_name || '—' }}
              </td>
              <td class="whitespace-nowrap px-3 py-3 align-top text-gray-600 dark:text-gray-300">
                {{ formatEventWhen(item.start_utc, item.all_day) }}
              </td>
              <td class="whitespace-nowrap px-3 py-3 align-top text-gray-600 dark:text-gray-300">
                {{ formatEventWhen(item.end_utc, item.all_day) }}
              </td>
              <td class="px-3 py-3 align-top text-gray-600 dark:text-gray-300">
                {{ item.location || '—' }}
              </td>
              <td class="px-3 py-3 align-top text-gray-700 dark:text-gray-300">
                <div class="note-body-preview" :title="item.description || ''">
                  {{ item.description || '—' }}
                </div>
                <button
                  v-if="item.description"
                  type="button"
                  class="mt-1 text-xs text-primary-600 hover:underline dark:text-primary-400"
                  @click="openEventModal(item)"
                >
                  View
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="text-sm text-gray-600 dark:text-gray-400">
        Showing {{ events.length ? (page - 1) * perPage + 1 : 0 }}–{{ Math.min(page * perPage, total) }}
        of {{ total }}
      </div>
      <div class="flex flex-wrap items-center gap-1">
        <button
          type="button"
          class="btn border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800"
          :disabled="page <= 1 || loading"
          @click="goToPage(page - 1)"
        >
          Previous
        </button>
        <template v-for="(item, idx) in pageNumbers" :key="'p-' + idx">
          <span v-if="item === '...'" class="px-2 text-gray-500">…</span>
          <button
            v-else
            type="button"
            class="btn px-3 py-2 text-sm"
            :class="
              item === page
                ? 'bg-primary-500 text-white'
                : 'border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800'
            "
            :disabled="loading"
            @click="goToPage(item)"
          >
            {{ item }}
          </button>
        </template>
        <button
          type="button"
          class="btn border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800"
          :disabled="page >= totalPages || loading"
          @click="goToPage(page + 1)"
        >
          Next
        </button>
      </div>
    </div>

    <div
      v-if="viewingEvent"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      @click.self="closeEventModal"
    >
      <div class="absolute inset-0 bg-black/50" @click="closeEventModal"></div>
      <div
        class="relative z-10 flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl dark:bg-gray-800"
      >
        <div class="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div class="pr-4">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
              {{ viewingEvent.summary || '(Untitled)' }}
            </h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {{ viewingEvent.calendar_name || '—' }} ·
              {{ formatEventWhen(viewingEvent.start_utc, viewingEvent.all_day) }}
              –
              {{ formatEventWhen(viewingEvent.end_utc, viewingEvent.all_day) }}
              <span v-if="viewingEvent.location"> · {{ viewingEvent.location }}</span>
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              class="btn bg-primary-500 px-3 py-1.5 text-sm text-white hover:bg-primary-600"
              @click="copyEventBody"
            >
              {{ copyStatus || 'Copy' }}
            </button>
            <button
              type="button"
              class="text-2xl leading-none text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              aria-label="Close"
              @click="closeEventModal"
            >
              ×
            </button>
          </div>
        </div>
        <div class="overflow-y-auto px-5 py-4">
          <pre class="note-modal-body m-0 text-gray-800 dark:text-gray-200">{{
            eventBodyText(viewingEvent) || '—'
          }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.note-body-preview {
  max-width: 420px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.note-modal-body {
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  font-size: 0.875rem;
  line-height: 1.5;
}
</style>
