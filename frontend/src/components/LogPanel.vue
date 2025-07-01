<script setup>
import {nextTick, ref, watch} from 'vue';

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

const levelColorClass = (level) => {
  switch (level) {
    case 'SUCCESS':
      return 'text-green-400';
    case 'ERROR':
      return 'text-red-400';
    case 'INFO':
      return 'text-blue-400';
    default:
      return 'text-gray-400';
  }
};
</script>

<template>
  <div class="h-full bg-gray-900 text-white flex flex-col p-2 border-t-2 border-gray-700">
    <div class="flex-shrink-0 flex justify-between items-center mb-1">
      <h3 class="font-bold text-sm">Sync Log</h3>
      <button @click="emit('clear-logs')" class="text-xs text-gray-400 hover:text-white">Clear</button>
    </div>
    <div ref="logContainer" class="flex-grow overflow-y-auto font-mono text-xs">
      <div v-for="(log, index) in logs" :key="index" class="flex items-start">
        <span class="text-gray-500 mr-2">{{ log.timestamp }}</span>
        <span class="mr-2" :class="levelColorClass(log.level)">[{{ log.level }}]</span>
        <span class="flex-1 whitespace-pre-wrap">{{ log.message }}</span>
      </div>
    </div>
  </div>
</template>