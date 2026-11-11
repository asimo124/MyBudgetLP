<script setup>
import { ref } from 'vue'

defineProps({
  /** True while a queued job is still running. */
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['run'])

const root = ref(null)

/** Scroll the window (and any scrolling layout wrapper) back to the very top. */
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
  let parent = root.value?.parentElement
  while (parent && parent !== document.documentElement) {
    if (parent.scrollTop > 0) {
      parent.scrollTo({ top: 0, behavior: 'smooth' })
    }
    parent = parent.parentElement
  }
}

function run(testMode) {
  scrollToTop()
  emit('run', testMode)
}
</script>

<template>
  <!-- Pages using this should add bottom padding (pb-28) so these never cover content. -->
  <div
    ref="root"
    class="fixed right-4 z-40 flex flex-col items-end gap-2"
    style="bottom: calc(1rem + env(safe-area-inset-bottom))"
  >
    <button
      type="button"
      class="rounded-full bg-primary-600 px-5 py-3 text-sm font-medium text-white shadow-lg hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
      :disabled="disabled"
      @click="run(0)"
    >
      Run Job
    </button>
    <button
      type="button"
      class="rounded-full bg-danger-600 px-5 py-3 text-sm font-medium text-white shadow-lg hover:bg-danger-700 disabled:cursor-not-allowed disabled:opacity-60"
      :disabled="disabled"
      @click="run(1)"
    >
      Run Test Job
    </button>
  </div>
</template>
