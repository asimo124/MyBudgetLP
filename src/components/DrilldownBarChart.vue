<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ApexCharts from 'apexcharts'

const props = defineProps({
  categories: { type: Array, default: () => [] },
  series: { type: Array, default: () => [] },
  stacked: { type: Boolean, default: false },
  height: { type: Number, default: 380 },
  drillable: { type: Boolean, default: false },
  // (seriesIndex, dataPointIndex) => string, used for the tooltip row label.
  pointLabel: { type: Function, default: null },
  emptyText: { type: String, default: 'No purchases to chart.' },
})

const emit = defineEmits(['drill'])

const chartEl = ref(null)
const chartId = `ep-chart-${Math.random().toString(36).slice(2, 10)}`
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
      id: chartId,
      type: 'bar',
      stacked: props.stacked,
      height: props.height,
      background: 'transparent',
      toolbar: { show: false },
      animations: { enabled: false },
      events: {
        // dataPointSelection is broadcast to every ApexCharts instance on the
        // page. A click on the overview chart would also drill the per-period
        // charts above it. `click` stays on this instance; still ignore clicks
        // whose target sits in a different chart's DOM.
        click: (event, _context, config) => {
          if (!props.drillable) return
          const index = config?.dataPointIndex
          if (index == null || index < 0) return
          if (event?.target && chartEl.value && !chartEl.value.contains(event.target)) {
            return
          }
          emit('drill', {
            dataPointIndex: index,
            seriesIndex: config.seriesIndex ?? 0,
          })
        },
      },
    },
    theme: { mode: dark ? 'dark' : 'light' },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: '60%',
        borderRadius: 2,
      },
    },
    dataLabels: { enabled: false },
    // Without this the clicked bar stays dimmed after drilling down.
    states: { active: { filter: { type: 'none' } } },
    grid: { borderColor: dark ? '#374151' : '#e5e7eb' },
    // Vertical bars: categories run along the x-axis, the measure up the y-axis.
    xaxis: {
      categories: props.categories,
      labels: {
        rotate: -45,
        rotateAlways: props.categories.length > 8,
        trim: true,
        maxHeight: 140,
        hideOverlappingLabels: false,
        style: { fontSize: '11px' },
      },
      tickPlacement: 'on',
    },
    yaxis: {
      labels: { formatter: (value) => `$${Math.round(Number(value) || 0)}` },
    },
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
