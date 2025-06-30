<script setup>
import { ref } from 'vue';
import Sidebar from './components/Sidebar.vue';
import FileSyncer from './views/FileSyncer.vue';

// 在一个更复杂的应用中，这里会使用 Vue Router
// 为了简化，我们先用一个 ref 来切换视图
const activeTool = ref('FileSyncer');
</script>

<template>
  <div class="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
    <Sidebar v-model="activeTool" />
    <main class="flex-1 overflow-y-auto">
      <FileSyncer v-if="activeTool === 'FileSyncer'" />
    </main>
  </div>
</template>