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
        absolute bottom-full left-1/2 mb-2 w-max max-w-xs -translate-x-1/2
        transform rounded-md px-3 py-1.5 text-sm
        font-semibold shadow-lg z-10
        

        bg-gray-900 text-white
        dark:bg-gray-50 dark:text-gray-900
        
        text-left whitespace-normal
      "
    >
      {{ text }}
    </div>
  </div>
</template>