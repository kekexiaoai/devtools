<script setup>
import { ref, watch, nextTick } from 'vue';

const props = defineProps({
  logs: {
    type: Array,
    required: true
  }
});

const emit = defineEmits(['clear-logs']);

const logContainer = ref(null);

// 监听 logs 数组的变化，当有新日志时，自动滚动到底部
watch(() => props.logs.length, async () => {
  await nextTick(); // 等待DOM更新
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight;
  }
});

// 1. 更新这个函数，为每种级别返回一组自适应主题的颜色类
const levelColorClass = (level) => {
  switch (level) {
    case 'SUCCESS':
      return 'text-green-600 dark:text-green-400';
    case 'ERROR':
      return 'text-red-600 dark:text-red-500';
    case 'INFO':
      return 'text-blue-600 dark:text-blue-400';
    default:
      return 'text-gray-600 dark:text-gray-300';
  }
};
</script>

<template>
  <div class="h-full bg-gray-50 dark:bg-gray-900 text-black dark:text-white flex flex-col p-2 border-t-2 border-gray-200 dark:border-gray-700">
    <div class="flex-shrink-0 flex justify-between items-center mb-1 px-1">
      <h3 class="font-bold text-sm text-gray-700 dark:text-gray-300">sync logs</h3>
      <button @click="emit('clear-logs')" class="text-xs text-gray-500 hover:text-black dark:hover:text-white">Clear</button>
    </div>
    <div ref="logContainer" class="flex-grow overflow-y-auto font-mono text-xs">
      <div v-for="(log, index) in logs" :key="index" class="flex items-start px-1 py-0.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded">
        <span class="text-gray-500 dark:text-gray-400 mr-2">{{ log.timestamp }}</span>
        <span class="font-bold mr-2" :class="levelColorClass(log.level)">[{{ log.level }}]</span>
        <span class="flex-1 whitespace-pre-wrap text-gray-700 dark:text-gray-300">{{ log.message }}</span>
      </div>
    </div>
  </div>
</template>