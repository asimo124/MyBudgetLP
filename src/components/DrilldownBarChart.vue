<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ApexCharts from 'apexcharts'

const props = defineProps({
  categories: { type: Array, default: () => [] },
  series: { type: Array, default: () => [] },
  stacked: { type: Boolean, default: false },
  height: { type: Number, default: 360 },
  drillable: { type: Boolean, default: false },
  // (seriesIndex, dataPointIndex) => string, used for the tooltip row label.
  pointLabel: { type: Function, default: null },
  emptyText: { type: String, default: 'No purchases to chart.' },
})

const emit = defineEmits(['drill'])

const chartEl = ref(null)
let chart = null
let themeObserver = null
let lastDark = null

function isDark() {
  return document.documentElement.classList.contains('dark')
}

function currency(value) {
  return `$${Number(value || 0).toFixed(2)}`
}

function buildOptions() {
  const dark = isDark()

  return {
    chart: {
      type: 'bar',
      stacked: props.stacked,
      height: props.height,
      background: 'transparent',
      toolbar: { show: false },
      animations: { enabled: false },
      events: {
        dataPointSelection: (_event, _context, config) => {
          if (!props.drillable) return
          emit('drill', {
            dataPointIndex: config.dataPointIndex,
            seriesIndex: config.seriesIndex,
          })
        },
      },
    },
    theme: { mode: dark ? 'dark' : 'light' },
    plotOptions: {
      bar: {
        horizontal: true,
        barHeight: '70%',
        borderRadius: 2,
      },
    },
    dataLabels: { enabled: false },
    // Without this the clicked bar stays dimmed after drilling down.
    states: { active: { filter: { type: 'none' } } },
    grid: { borderColor: dark ? '#374151' : '#e5e7eb' },
    xaxis: {
      categories: props.categories,
      labels: { formatter: (value) => currency(value) },
    },
    yaxis: { labels: { maxWidth: 240 } },
    legend: { show: props.stacked, position: 'bottom' },
    tooltip: {
      shared: false,
      intersect: true,
      y: {
        formatter: (value) => currency(value),
        title: {
          formatter: (seriesName, opts) => {
            if (props.pointLabel && opts) {
              const label = props.pointLabel(opts.seriesIndex, opts.dataPointIndex)
              if (label) return `${label}:`
            }
            return `${seriesName}:`
          },
        },
      },
    },
    noData: { text: props.emptyText },
    series: props.series,
  }
}

function destroyChart() {
  if (chart) {
    chart.destroy()
    chart = null
  }
}

async function render() {
  destroyChart()
  await nextTick()
  if (!chartEl.value) return
  lastDark = isDark()
  chart = new ApexCharts(chartEl.value, buildOptions())
  await chart.render()
}

// Compared as a string so the parent can pass freshly-built objects without
// forcing a rebuild on every render.
const signature = computed(() =>
  JSON.stringify({
    categories: props.categories,
    series: props.series,
    stacked: props.stacked,
    height: props.height,
  })
)

watch(signature, render)

onMounted(() => {
  render()
  themeObserver = new MutationObserver(() => {
    if (isDark() !== lastDark) render()
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
})

onBeforeUnmount(() => {
  themeObserver?.disconnect()
  themeObserver = null
  destroyChart()
})
</script>

<template>
  <div ref="chartEl" class="w-full"></div>
</template>
