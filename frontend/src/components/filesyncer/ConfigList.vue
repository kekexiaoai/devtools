<script setup>
import {PencilIcon} from '@heroicons/vue/24/solid'; // 导入编辑图标

defineProps(['configs', 'selectedId']);
const emit = defineEmits(['select-config', 'configs-updated', 'new-config-request']);

function createNewConfig() {
  // 打开一个模态框来创建新配置
  emit('new-config-request');
}
</script>

<template>
  <div class="p-4 h-full flex flex-col">
    <button @click="createNewConfig"
            class="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition mb-4">
      + New Configuration
    </button>
    <ul class="space-y-2 overflow-y-auto text-left">
      <li
          v-for="config in configs"
          :key="config.id"
          @click="emit('select-config', config.id)"
          class="p-3 rounded-md cursor-pointer transition flex justify-between items-center"
          :class="[selectedId === config.id ? 'bg-indigo-100 dark:bg-indigo-900/50' : 'hover:bg-gray-200 dark:hover:bg-gray-700']"
      >
        <div>
          <h3 class="font-semibold text-sm">{{ config.name }}</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">{{ config.user }}@{{ config.host }}</p>
        </div>
        <button
            @click.stop="emit('edit-config', config.id)"
            class="p-1 text-gray-400 hover:text-gray-800 dark:hover:text-white rounded-full hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          <PencilIcon class="h-4 w-4"/>
        </button>
      </li>
    </ul>
  </div>
</template>