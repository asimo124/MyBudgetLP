<script setup>
import { computed, ref } from 'vue'
import { formatMoney, parseSynchronyPending } from '@/utils/synchronyPending'

const rawText = ref('')
const result = computed(() => parseSynchronyPending(rawText.value))

function clearText() {
  rawText.value = ''
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Synchrony Pending</h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Paste the pending activity copied from MySynchrony. Negative amounts are payments, positive
        amounts are charges you still owe.
      </p>
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div class="card p-4">
        <p class="text-sm text-gray-500 dark:text-gray-400">Still owe (positive)</p>
        <p class="mt-1 text-2xl font-semibold text-red-600 dark:text-red-400">
          {{ formatMoney(result.charges) }}
        </p>
        <p class="text-xs text-gray-500 dark:text-gray-400">{{ result.chargeCount }} charges</p>
      </div>
      <div class="card p-4">
        <p class="text-sm text-gray-500 dark:text-gray-400">Paid (negative)</p>
        <p class="mt-1 text-2xl font-semibold text-green-600 dark:text-green-400">
          {{ formatMoney(result.payments) }}
        </p>
        <p class="text-xs text-gray-500 dark:text-gray-400">{{ result.paymentCount }} payments</p>
      </div>
      <div class="card p-4">
        <p class="text-sm text-gray-500 dark:text-gray-400">Net pending</p>
        <p class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
          {{ formatMoney(result.net) }}
        </p>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          {{ result.transactions.length }} transactions
        </p>
      </div>
    </div>

    <div class="card space-y-3 p-4">
      <label for="synchrony-text" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Pending activity text
      </label>
      <textarea
        id="synchrony-text"
        v-model="rawText"
        rows="10"
        class="form-input w-full font-mono text-sm"
        placeholder="Paste your MySynchrony pending activity here…"
      ></textarea>
      <div class="flex gap-2">
        <button
          type="button"
          class="btn bg-neutral-200 text-neutral-800 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600"
          @click="clearText"
        >
          Clear
        </button>
      </div>
    </div>

    <div v-if="rawText.trim() && !result.transactions.length" class="text-sm text-gray-500 dark:text-gray-400">
      No dollar amounts found in the pasted text.
    </div>

    <div v-if="result.transactions.length" class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Date</th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Description</th>
              <th class="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Amount</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-for="(t, index) in result.transactions" :key="index">
              <td class="whitespace-nowrap px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{{ t.date }}</td>
              <td class="px-3 py-2 text-sm text-gray-900 dark:text-white">
                {{ t.description }}
                <span v-if="t.type" class="ml-1 text-xs text-gray-500 dark:text-gray-400">({{ t.type }})</span>
              </td>
              <td
                class="whitespace-nowrap px-3 py-2 text-right text-sm font-medium"
                :class="t.amount < 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'"
              >
                {{ formatMoney(t.amount) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
