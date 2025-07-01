<script setup>
  const emit = defineEmits(['close']);
</script>

<template>
  <div
      @click.self="emit('close')"
      class="fixed inset-0 bg-black bg-opacity-60 z-50 flex p-8 sm:p-16 transition-opacity"
  >
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full h-full flex flex-col">

      <div class="flex-shrink-0 flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-3 p-6">
        <slot name="header">
          <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">Modal Title</h3>
        </slot>
        <button @click="emit('close')" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="px-6 py-4 flex-grow overflow-y-auto">
        <slot />
      </div>

      <div class="flex-shrink-0 mt-auto border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3 p-6 bg-gray-50 dark:bg-gray-800/50 rounded-b-lg">
        <slot name="footer">
          <button @click="emit('close')" class="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Close</button>
        </slot>
      </div>
    </div>
  </div>
</template>