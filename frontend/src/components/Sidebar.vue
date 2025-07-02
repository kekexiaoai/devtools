<script setup>
import { ref } from 'vue';
import { defineProps, defineEmits } from 'vue';
import {
  FolderArrowDownIcon,
  CodeBracketSquareIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
} from '@heroicons/vue/24/outline';

// Declares that the component accepts 'modelValue' from its parent (for v-model)
const props = defineProps(['modelValue']);
const emit = defineEmits(['update:modelValue']);

// This state variable was missing. It controls the collapse/expand state.
const isCollapsed = ref(false); // false = expanded, true = collapsed

const tools = [
  { id: 'FileSyncer', name: 'File Syncer', icon: FolderArrowDownIcon },
  { id: 'JsonTools', name: 'JSON Tools', icon: CodeBracketSquareIcon },
];

// This function was missing. It toggles the state.
function toggleSidebar() {
  isCollapsed.value = !isCollapsed.value;
}
</script>

<template>
  <aside
      class="bg-white dark:bg-gray-800 p-2 flex flex-col shadow-lg transition-all duration-300 ease-in-out select-none"
      :class="isCollapsed ? 'w-16' : 'w-56'"
  >
    <div class="flex-grow">
      <button
          v-for="tool in tools"
          :key="tool.id"
          @click="emit('update:modelValue', tool.id)"
          :title="tool.name"
          class="flex items-center w-full px-3 py-2.5 my-1 rounded-lg transition-colors"
          :class="[
            modelValue === tool.id
              ? 'bg-indigo-600 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
            isCollapsed ? 'justify-center' : 'justify-start'
          ]"
      >
        <component :is="tool.icon" class="h-6 w-6 flex-shrink-0" />
        <span
            v-show="!isCollapsed"
            class="ml-4 font-semibold text-sm whitespace-nowrap"
        >
          {{ tool.name }}
        </span>
      </button>
    </div>

    <div class="mt-auto">
      <button
          @click="toggleSidebar"
          :title="isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          class="flex items-center w-full px-3 py-2.5 rounded-lg transition-colors"
          :class="[
            'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
            isCollapsed ? 'justify-center' : 'justify-start'
          ]"
      >
        <component :is="isCollapsed ? ChevronDoubleRightIcon : ChevronDoubleLeftIcon" class="h-6 w-6 flex-shrink-0" />
        <span v-show="!isCollapsed" class="ml-4 font-semibold text-sm whitespace-nowrap">Collapse</span>
      </button>
    </div>
  </aside>
</template>