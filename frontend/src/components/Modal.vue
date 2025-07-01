<script setup>
const emit = defineEmits(['close']);

// 1. 定义 size prop，并设置默认值为 'standard'
const props = defineProps({
  size: {
    type: String,
    default: 'standard', // 可选值: 'standard', 'responsive'
  }
});
</script>

<template>
  <div
      @click.self="emit('close')"
      class="fixed inset-0 bg-black bg-opacity-60 z-50 flex transition-opacity"
      :class="{
      'justify-center items-center p-4': props.size === 'standard',
      'p-8 sm:p-16': props.size === 'responsive',
    }"
  >
    <div
        class="bg-white dark:bg-gray-800 rounded-lg shadow-xl flex flex-col"
        :class="{
        'w-full max-w-2xl': props.size === 'standard', // 固定尺寸，最大宽度为 2xl
        'w-full h-full': props.size === 'responsive',     // 自适应尺寸，占满可用空间
      }"
    >

      <div
          class="flex-shrink-0 flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-3 p-6">
        <slot name="header"></slot>
        <button @click="emit('close')" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="px-6 py-4 overflow-y-auto" :class="{'flex-grow': props.size === 'responsive'}">
        <slot/>
      </div>

      <div
          class="flex-shrink-0 mt-auto border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3 p-6 bg-gray-50 dark:bg-gray-800/50 rounded-b-lg">
        <slot name="footer"></slot>
      </div>
    </div>
  </div>
</template>