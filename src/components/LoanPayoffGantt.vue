<script setup>
import { computed } from 'vue'
import { buildPayoffGantt } from '@/utils/loanPayoffGantt'

const props = defineProps({
  bars: { type: Array, default: () => [] },
  caption: { type: String, default: '' },
  message: { type: String, default: '' },
})

const gantt = computed(() => buildPayoffGantt(props.bars))
const monthCount = computed(() => gantt.value.months.length)
const minTimelinePx = computed(() => Math.max(monthCount.value * 36, 0))
</script>

<template>
  <div class="card">
    <div class="card-body space-y-3">
      <div>
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Loan Payoff Timeline</h2>
        <p v-if="caption" class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {{ caption }}
        </p>
      </div>
      <p v-if="message" class="text-sm text-gray-600 dark:text-gray-300">{{ message }}</p>
      <div v-else-if="gantt.bars.length" class="overflow-x-auto">
        <div class="w-full" :style="{ minWidth: 160 + minTimelinePx + 'px' }">
          <div class="flex w-full">
            <div class="w-40 shrink-0"></div>
            <div class="flex min-w-0 flex-1">
              <div
                v-for="(year, yearIndex) in gantt.years"
                :key="'gantt-year-' + year.year"
                class="border-b border-gray-200 text-center text-xs font-semibold text-gray-900 dark:border-gray-700 dark:text-white"
                :class="yearIndex % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-900'"
                :style="{ flex: year.span }"
              >
                {{ year.year }}
              </div>
            </div>
          </div>
          <div class="flex w-full">
            <div class="w-40 shrink-0"></div>
            <div class="flex min-w-0 flex-1">
              <div
                v-for="(month, monthIndex) in gantt.months"
                :key="'gantt-month-' + monthIndex"
                class="min-w-0 flex-1 border-b border-gray-100 py-1 text-center text-[10px] text-gray-500 dark:border-gray-800 dark:text-gray-400"
                :class="month.isYearStart ? 'border-l border-gray-300 dark:border-gray-600' : ''"
              >
                {{ month.label }}
              </div>
            </div>
          </div>
          <div v-for="bar in gantt.bars" :key="'gantt-bar-' + bar.id" class="flex w-full items-center">
            <div
              class="w-40 shrink-0 truncate pr-2 text-sm font-medium text-gray-900 dark:text-white"
              :title="bar.title"
            >
              {{ bar.title }}
            </div>
            <div class="relative h-8 min-w-0 flex-1">
              <div class="absolute inset-0 flex">
                <div
                  v-for="(month, monthIndex) in gantt.months"
                  :key="'gantt-grid-' + bar.id + '-' + monthIndex"
                  class="min-w-0 flex-1 border-r border-gray-100 dark:border-gray-800"
                  :class="month.isYearStart ? 'border-l border-gray-300 dark:border-gray-600' : ''"
                ></div>
              </div>
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
</template>
