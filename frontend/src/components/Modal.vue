<script setup>
  const emit = defineEmits(['close']);
</script>

<template>
  <div
      @click.self="emit('close')"
      class="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center transition-opacity"
  >
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg transform transition-all">

      <div class="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-3">
        <slot name="header">
          <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">Modal Title</h3>
        </slot>
        <button @click="emit('close')" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="mt-4 px-6 flex-grow overflow-y-auto">
        <slot />
      </div>

      <div class="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
        <slot name="footer">
          <button @click="emit('close')" class="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Close</button>
        </slot>
      </div>
    </div>
  </div>
</template>