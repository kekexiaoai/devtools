<script setup>
// 导入新创建的子组件
import SyncPairsManager from './SyncPairsManager.vue';
import ClipboardTool from './ClipboardTool.vue';

// 定义 props 和 emits，与之前保持一致
const props = defineProps(['config', 'isWatching']);
const emit = defineEmits(['config-updated', 'toggle-watcher', 'log-event']);
</script>

<template>
  <div class="text-left">
    <SyncPairsManager 
      :config="props.config" 
      :is-watching="props.isWatching"
      @toggle-watcher="(configId, isActive) => emit('toggle-watcher', configId, isActive)"
    />

    <ClipboardTool 
      :config="props.config" 
      @config-updated="emit('config-updated')"
      @log-event="(logEntry) => {
        console.log('ConfigDetail: Caught log-event, re-emitting.', logEntry);
        emit('log-event', logEntry);
      }"
    />
  </div>
</template>