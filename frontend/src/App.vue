<script setup>
import {computed, onMounted, ref, provide} from 'vue'; // 1. 导入 computed
import Sidebar from './components/Sidebar.vue';
import LogPanel from './components/LogPanel.vue';
import FileSyncer from './views/FileSyncer.vue';
import {EventsOn} from '../wailsjs/runtime/runtime';
import JsonTools from "./views/JsonTools.vue";
import InfoModal from "./components/ui/InfoModal.vue";
// import TitleBar from './components/TitleBar.vue';

const activeTool = ref('FileSyncer');
const logs = ref([]);

const isLogPanelOpen = ref(false);

function toggleLogPanel() {
  isLogPanelOpen.value = !isLogPanelOpen.value;
}

const latestLogStatus = computed(() => {
  if (logs.value.length === 0) {
    return {level: 'INFO', message: 'Ready'};
  }
  return logs.value[logs.value.length - 1];
});

const statusColorClass = computed(() => {
  switch (latestLogStatus.value.level) {
    case 'SUCCESS':
      return 'text-green-500';
    case 'ERROR':
      return 'text-red-500';
    default:
      return 'text-gray-400';
  }
});

function addLogEntry(logEntry) {
  console.log('App.vue: Received log entry!', logEntry);

  const fullLogEntry = {
    ...logEntry,
    timestamp: new Date().toLocaleTimeString() // 补充完整的时间戳
  };

  logs.value.push(fullLogEntry);
  if (logs.value.length > 200) {
    logs.value.shift();
  }
}

onMounted(() => {
  EventsOn('log_event', addLogEntry);
});

function clearLogs() {
  logs.value = [];
}

const dialog = ref({
  show: false,
  title: '',
  message: '',
  type: 'info',
});

// 创建一个方法来显示对话框
function showDialog({ title, message, type = 'info' }) {
  dialog.value = { show: true, title, message, type };
}

// 使用 provide 将这个方法提供给所有子组件
provide('showDialog', showDialog);

</script>

<template>
  <div class="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
    <Sidebar v-model="activeTool"/>

    <div class="flex-1 flex flex-col overflow-hidden">

      <main class="flex-1 overflow-y-auto">
        <FileSyncer v-if="activeTool === 'FileSyncer'" @log-event="addLogEntry"/>
        <JsonTools v-if="activeTool === 'JsonTools'"/>
      </main>

      <template v-if="activeTool === 'FileSyncer'">
        <div v-if="isLogPanelOpen" class="h-48 flex-shrink-0">
          <LogPanel :logs="logs" @clear-logs="clearLogs"/>
        </div>

        <div
            class="h-6 flex-shrink-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between px-2 text-xs">
          <button @click="toggleLogPanel"
                  class="flex items-center space-x-1 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
            <span>{{ isLogPanelOpen ? '▼' : '▲' }}</span>
            <span>Logs</span>
          </button>

          <div class="flex-1 text-right truncate" :class="statusColorClass">
            <span>{{ latestLogStatus.message }}</span>
          </div>
        </div>
      </template>
    </div>
  </div>

  <transition name="modal-pop">
    <InfoModal
        v-if="dialog.show"
        :show="dialog.show"
        :title="dialog.title"
        :message="dialog.message"
        :type="dialog.type"
        @close="dialog.show = false"
    />
  </transition>
</template>