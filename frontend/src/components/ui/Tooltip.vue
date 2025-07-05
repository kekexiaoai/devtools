<script setup>
import { ref } from 'vue';

defineProps({
  text: {
    type: String,
    required: true,
  },
});

const isVisible = ref(false);
</script>

<template>
  <div class="relative inline-flex" @mouseenter="isVisible = true" @mouseleave="isVisible = false">
    <slot />
    <div
      v-if="isVisible && text"
      class="
        absolute bottom-full left-1/2 mb-2 w-max -translate-x-1/2 max-w-lg
        transform rounded-md bg-gray-900 px-3 py-2 text-sm
        font-semibold text-white shadow-lg z-10
        
        /* ↓↓↓ 新增的关键样式 ↓↓↓ */
        text-left           /* 文本左对齐 */
        whitespace-normal   /* 允许文本正常换行 */
      "
    >
      {{ text }}
    </div>
  </div>
</template>