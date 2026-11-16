<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import api from '@/api/client'
import { scrollToElement, waitForLayout } from '@/utils/scrollToElement'
import {
  DAYS_BACK_STEP,
  WEEKDAY_SHORT,
  badgeStyle,
  formatLongDate,
  relativeDays,
  todayYmd,
} from '@/utils/lastTime'

const API = {
  items: '/api/last_time/items.php',
  calendar: '/api/last_time/calendar.php',
  search: '/api/last_time/search.php',
  create: '/api/last_time/create.php',
  delete: '/api/last_time/delete.php',
}

const items = ref([])
const weeks = ref([])
const daysBack = ref(0)
const today = ref(todayYmd())
const rangeLabel = ref('')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const calendarEl = ref(null)

const itemsById = computed(() => new Map(items.value.map((item) => [item.id, item])))

/* ---------- data ---------- */

function errorMessage(err, fallback) {
  return err?.response?.data?.error || err?.response?.data?.message || fallback
}

async function loadItems() {
  const { data } = await api.get(API.items)
  items.value = data.items || []
}

async function loadCalendar({ scrollToday = false } = {}) {
  loading.value = true
  error.value = ''
  try {
    const { data } = await api.get(API.calendar, { params: { days_back: daysBack.value } })
    weeks.value = data.weeks || []
    today.value = data.today || todayYmd()
    rangeLabel.value = `${formatLongDate(data.start_date)} – ${formatLongDate(data.end_date)}`
  } catch (err) {
    error.value = errorMessage(err, 'Could not load the calendar.')
  } finally {
    loading.value = false
  }
  if (scrollToday) {
    await nextTick()
    await waitForLayout()
    scrollToElement(calendarEl.value?.querySelector('[data-today="true"]'))
  }
}

function goEarlier() {
  daysBack.value += DAYS_BACK_STEP
  loadCalendar()
}

function goLater() {
  daysBack.value = Math.max(0, daysBack.value - DAYS_BACK_STEP)
  loadCalendar({ scrollToday: daysBack.value === 0 })
}

function goToday() {
  daysBack.value = 0
  closeSearch()
  loadCalendar({ scrollToday: true })
}

/* ---------- add entry ---------- */

const showAddModal = ref(false)
const addForm = ref({ item_id: '', date_used: '' })
const addError = ref('')

function openAdd(date = todayYmd()) {
  addForm.value = { item_id: '', date_used: date }
  addError.value = ''
  showAddModal.value = true
}

function closeAdd() {
  showAddModal.value = false
}

const selectedAddItem = computed(() => itemsById.value.get(Number(addForm.value.item_id)))

async function saveAdd() {
  if (!addForm.value.item_id || !addForm.value.date_used) {
    addError.value = 'Choose an item and a date.'
    return
  }
  saving.value = true
  addError.value = ''
  try {
    await api.post(API.create, {
      item_id: Number(addForm.value.item_id),
      date_used: addForm.value.date_used,
    })
    showAddModal.value = false
    await loadCalendar()
    if (search.value) await runSearch(search.value.item.id)
  } catch (err) {
    addError.value = errorMessage(err, 'Could not add the entry.')
  } finally {
    saving.value = false
  }
}

/* ---------- remove entry ---------- */

const pendingDelete = ref(null)

function askDelete(entry, date) {
  const item = itemsById.value.get(entry.item_id)
  pendingDelete.value = {
    id: entry.id,
    title: entry.title,
    date,
    isSeries: Boolean(item?.is_series),
  }
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  saving.value = true
  try {
    await api.post(API.delete, { id: pendingDelete.value.id })
    pendingDelete.value = null
    await loadCalendar()
    if (search.value) await runSearch(search.value.item.id)
  } catch (err) {
    error.value = errorMessage(err, 'Could not remove the entry.')
    pendingDelete.value = null
  } finally {
    saving.value = false
  }
}

/* ---------- search ---------- */

const showSearchModal = ref(false)
const searchItemId = ref('')
const search = ref(null) // { item, history }

function openSearch() {
  searchItemId.value = search.value?.item?.id ?? ''
  showSearchModal.value = true
}

async function runSearch(itemId) {
  try {
    const { data } = await api.get(API.search, { params: { item_id: itemId } })
    search.value = { item: data.item, history: data.history || [] }
  } catch (err) {
    error.value = errorMessage(err, 'Search failed.')
  }
}

async function submitSearch() {
  if (!searchItemId.value) return
  showSearchModal.value = false
  await runSearch(Number(searchItemId.value))
}

function closeSearch() {
  search.value = null
  searchItemId.value = ''
}

const lastUsed = computed(() => {
  const history = search.value?.history || []
  return history.find((row) => row.date_used <= today.value) || null
})

/* ---------- init ---------- */

onMounted(async () => {
  try {
    await loadItems()
  } catch (err) {
    error.value = errorMessage(err, 'Could not load items.')
  }
  await loadCalendar({ scrollToday: true })
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-3">
      <span
        class="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-50 text-2xl text-primary-600 dark:bg-primary-900/30 dark:text-primary-300"
        aria-hidden="true"
      >
        <i class="ph ph-clock-countdown"></i>
      </span>
      <div>
        <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">When Did I Last?</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Click a day to log something. Click an entry to remove it.
        </p>
      </div>
    </div>

    <div
      v-if="error"
      class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
    >
      {{ error }}
    </div>

    <!-- Toolbar -->
    <div
      class="sticky top-0 z-30 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/95"
    >
      <button type="button" class="btn bg-primary-500 text-white hover:bg-primary-600" @click="openAdd()">
        Add Item
      </button>
      <button
        type="button"
        class="btn bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
        @click="openSearch"
      >
        Search
      </button>
      <span class="mx-1 hidden h-6 w-px bg-gray-200 sm:block dark:bg-gray-700"></span>
      <button
        type="button"
        class="btn bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
        @click="goEarlier"
      >
        ‹ Earlier
      </button>
      <button
        v-if="daysBack > 0"
        type="button"
        class="btn bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
        @click="goLater"
      >
        Later ›
      </button>
      <button
        type="button"
        class="btn border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
        @click="goToday"
      >
        Today
      </button>
      <span class="ml-auto text-xs text-gray-500 dark:text-gray-400">{{ rangeLabel }}</span>
    </div>

    <!-- Search results -->
    <div v-if="search" class="card space-y-4 p-4">
      <div class="flex flex-wrap items-center gap-3">
        <span class="rounded px-2 py-1 text-sm font-bold" :style="badgeStyle(search.item.color)">
          {{ search.item.title }}
        </span>
        <span v-if="lastUsed" class="text-sm text-gray-700 dark:text-gray-300">
          Last time: <strong>{{ formatLongDate(lastUsed.date_used) }}</strong>
          ({{ relativeDays(lastUsed.date_used, today) }})
        </span>
        <span v-else class="text-sm italic text-gray-500">Not logged yet.</span>
        <button
          type="button"
          class="btn ml-auto bg-gray-200 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
          @click="closeSearch"
        >
          Close search
        </button>
      </div>
      <ul
        v-if="search.history.length"
        class="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700"
      >
        <li
          v-for="row in search.history"
          :key="row.id"
          class="flex items-center justify-between px-3 py-2 text-sm"
        >
          <span class="text-gray-900 dark:text-white">{{ formatLongDate(row.date_used) }}</span>
          <span class="text-gray-500 dark:text-gray-400">{{ relativeDays(row.date_used, today) }}</span>
        </li>
      </ul>
    </div>

    <p v-if="loading && !weeks.length" class="text-sm text-gray-500">Loading…</p>

    <!-- Calendar: 7 columns on desktop; on phones each week wraps Sun–Wed / Thu–Sat -->
    <div ref="calendarEl" class="space-y-2" :class="{ 'opacity-60': loading }">
      <div class="hidden grid-cols-7 gap-1 md:grid">
        <div
          v-for="label in WEEKDAY_SHORT"
          :key="label"
          class="text-center text-xs font-semibold uppercase text-gray-500 dark:text-gray-400"
        >
          {{ label }}
        </div>
      </div>

      <div v-for="(week, w) in weeks" :key="w" class="grid grid-cols-4 gap-1 md:grid-cols-7">
        <template v-for="day in week.days" :key="day.date">
          <div
            role="button"
            tabindex="0"
            :data-today="day.is_today"
            class="min-h-[8.5rem] cursor-pointer rounded-md border p-1.5 text-left text-xs transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
            :class="[
              day.is_today
                ? 'border-primary-500 ring-2 ring-primary-500/40'
                : 'border-gray-200 dark:border-gray-700',
              day.day_of_week <= 3
                ? 'bg-orange-50 md:bg-white dark:bg-gray-900 md:dark:bg-gray-900'
                : 'bg-yellow-50 md:bg-white dark:bg-gray-900 md:dark:bg-gray-900',
            ]"
            :aria-label="`Log something on ${formatLongDate(day.date)}`"
            @click="openAdd(day.date)"
            @keydown.enter.prevent="openAdd(day.date)"
          >
            <div class="mb-1 flex items-baseline gap-1">
              <span v-if="day.month_label" class="font-bold text-primary-600 dark:text-primary-400">
                {{ day.month_label }}
              </span>
              <span class="font-semibold text-gray-600 dark:text-gray-300">
                {{ WEEKDAY_SHORT[day.day_of_week] }} {{ day.day_of_month }}
              </span>
            </div>
            <button
              v-for="entry in day.items"
              :key="entry.id"
              type="button"
              class="mb-1 block w-full break-words rounded px-1.5 py-0.5 text-left text-[0.7rem] font-bold leading-tight hover:opacity-80 [overflow-wrap:anywhere]"
              :style="badgeStyle(entry.color)"
              :title="`Remove ${entry.title} on ${formatLongDate(day.date)}`"
              @click.stop="askDelete(entry, day.date)"
            >
              {{ entry.title }}
            </button>
          </div>
          <!-- Phone layout: blank cell after Saturday keeps Sun–Wed / Thu–Sat rows aligned -->
          <div v-if="day.day_of_week === 6" class="md:hidden" aria-hidden="true"></div>
        </template>
      </div>
    </div>

    <!-- Add entry modal -->
    <div
      v-if="showAddModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="closeAdd"
    >
      <div class="w-full max-w-lg rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div class="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Log Item Used</h3>
        </div>
        <div class="space-y-4 px-6 py-4">
          <p
            v-if="addError"
            class="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
          >
            {{ addError }}
          </p>
          <div>
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400" for="lt-item">Item</label>
            <select id="lt-item" v-model="addForm.item_id" class="form-input w-full">
              <option value="" disabled>Select an item…</option>
              <option v-for="item in items" :key="item.id" :value="item.id">{{ item.title }}</option>
            </select>
          </div>
          <div>
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400" for="lt-date">Date</label>
            <input id="lt-date" v-model="addForm.date_used" type="date" class="form-input w-full" />
          </div>
          <p
            v-if="selectedAddItem?.is_series"
            class="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
          >
            {{ selectedAddItem.title }} is a series: this also schedules it every 2 days for the
            next 180 doses.
          </p>
        </div>
        <div class="flex justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            type="button"
            class="btn bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
            @click="closeAdd"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-60"
            :disabled="saving"
            @click="saveAdd"
          >
            Save
          </button>
        </div>
      </div>
    </div>

    <!-- Search modal -->
    <div
      v-if="showSearchModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="showSearchModal = false"
    >
      <div class="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div class="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">When did I last…</h3>
        </div>
        <div class="px-6 py-4">
          <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400" for="lt-search">Item</label>
          <select id="lt-search" v-model="searchItemId" class="form-input w-full">
            <option value="" disabled>Select an item…</option>
            <option v-for="item in items" :key="item.id" :value="item.id">{{ item.title }}</option>
          </select>
        </div>
        <div class="flex justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            type="button"
            class="btn bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
            @click="showSearchModal = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-60"
            :disabled="!searchItemId"
            @click="submitSearch"
          >
            Search
          </button>
        </div>
      </div>
    </div>

    <!-- Confirm remove modal -->
    <div
      v-if="pendingDelete"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="pendingDelete = null"
    >
      <div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Remove entry?</h3>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
          <template v-if="pendingDelete.isSeries">
            This removes <strong>every</strong> {{ pendingDelete.title }} entry, not just
            {{ formatLongDate(pendingDelete.date) }}.
          </template>
          <template v-else>
            Remove {{ pendingDelete.title }} on {{ formatLongDate(pendingDelete.date) }}?
          </template>
        </p>
        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="btn bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
            @click="pendingDelete = null"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn bg-red-500 text-white hover:bg-red-600 disabled:opacity-60"
            :disabled="saving"
            @click="confirmDelete"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
