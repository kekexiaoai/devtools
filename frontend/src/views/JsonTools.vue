<script setup>
import {computed, reactive, ref} from 'vue';
import {ArrowDownTrayIcon, ArrowsRightLeftIcon, ChevronLeftIcon, ChevronRightIcon,} from '@heroicons/vue/24/outline';
import { ShowErrorDialog, ShowInfoDialog } from '../../wailsjs/go/main/App';

// 导入 vue-json-pretty 组件及其样式
import VueJsonPretty from 'vue-json-pretty';
import 'vue-json-pretty/lib/styles.css';

// 导入 Codemirror 相关组件和扩展
import {Codemirror} from 'vue-codemirror';
import {json} from '@codemirror/lang-json';
import {oneDark} from '@codemirror/theme-one-dark';
import {EditorView} from '@codemirror/view';

// --- 状态管理 ---
const jsonInput = ref('');
const jsonObjectOutput = ref({});
const validationResult = reactive({isValid: null, message: ''});
const isInputVisible = ref(true);

// 检查当前是否为暗黑模式，用于切换主题
const isDarkMode = computed(() => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

// 设置 Codemirror 的扩展

const cmExtensions = computed(() => {
  // 基础扩展是 JSON 语言支持
  const exts = [json(), EditorView.lineWrapping];

  if (isDarkMode.value) {
    exts.push(oneDark); // 暗黑模式下使用 oneDark 主题
  }
  return exts;
});

// --- 方法定义 (保持不变) ---
function toggleInputView() {
  isInputVisible.value = !isInputVisible.value;
}

function formatAndValidate() {
  if (!jsonInput.value.trim()) {
    validationResult.isValid = null;
    validationResult.message = '';
    jsonObjectOutput.value = {};
    return;
  }
  try {
    const jsonObj = JSON.parse(jsonInput.value);
    jsonObjectOutput.value = jsonObj;
    validationResult.isValid = true;
    validationResult.message = 'Valid JSON';
  } catch (error) {
    jsonObjectOutput.value = {};
    validationResult.isValid = false;
    validationResult.message = `Invalid JSON: ${error.message}`;
  }
}

async function minifyAndCopy() {
  if (!jsonInput.value.trim()) return;
  try {
    const jsonObj = JSON.parse(jsonInput.value);
    const minifiedText = JSON.stringify(jsonObj);
    await navigator.clipboard.writeText(minifiedText);
    await ShowInfoDialog('Success', 'Minified JSON copied to clipboard!');
  } catch (error) {
    await ShowErrorDialog('Error', 'Invalid JSON, cannot minify.');
  }
}

async function copyOutput() {
  if (!jsonObjectOutput.value || Object.keys(jsonObjectOutput.value).length === 0) return;
  try {
    const formattedText = JSON.stringify(jsonObjectOutput.value, null, 2);
    await navigator.clipboard.writeText(formattedText);
    alert('Formatted JSON copied to clipboard!');
  } catch (err) {
    alert('Failed to copy: ' + err);
  }
}

function clearAll() {
  jsonInput.value = '';
  jsonObjectOutput.value = {};
  validationResult.isValid = null;
  validationResult.message = '';
}
</script>

<template>
  <div class="h-full flex flex-col p-4 space-y-4  dark:bg-gray-900">
    <div class="flex-shrink-0 flex items-center space-x-2">
      <button @click="formatAndValidate"
              class="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
        <ArrowsRightLeftIcon class="h-5 w-5"/>
        <span>Format / Validate</span>
      </button>
      <button @click="minifyAndCopy"
              class="flex items-center space-x-2 px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm">
        <ArrowDownTrayIcon class="h-5 w-5"/>
        <span>Minify & Copy</span>
      </button>
      <div class="flex-grow"></div>
      <button @click="copyOutput" :disabled="Object.keys(jsonObjectOutput).length === 0"
              class="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
        Copy Output
      </button>
      <button @click="clearAll" class="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 text-sm">
        Clear
      </button>
    </div>

    <div v-if="validationResult.isValid !== null"
         class="flex-shrink-0 p-2 rounded-md text-sm font-medium"
         :class="{
           'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300': validationResult.isValid,
           'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300': !validationResult.isValid,
         }"
    >
      {{ validationResult.message }}
    </div>

    <div class="flex-grow flex items-stretch space-x-2 overflow-hidden">
      <div v-if="isInputVisible" class="w-1/2 h-full flex flex-col p-1 transition-all duration-300 ease-in-out">
        <label class="mb-1 text-sm font-semibold text-gray-800 dark:text-gray-200">Input</label>
        <div class="flex-grow w-full border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
          <codemirror
              v-model="jsonInput"
              placeholder="Paste your JSON here..."
              :style="{ height: '100%' }"
              :autofocus="true"
              :indent-with-tab="true"
              :tab-size="2"
              :extensions="cmExtensions"
          />
        </div>
      </div>

      <div class="flex-shrink-0 flex items-center justify-center">
        <button @click="toggleInputView"
                class="h-8 w-5 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center justify-center">
          <ChevronLeftIcon v-if="isInputVisible" class="h-4 w-4"/>
          <ChevronRightIcon v-else class="h-4 w-4"/>
        </button>
      </div>

      <div class="h-full flex flex-col p-1" :class="isInputVisible ? 'w-1/2' : 'w-full'">
        <label class="mb-1 text-sm font-semibold text-gray-800 dark:text-gray-200">Output</label>
        <div class="w-full flex-grow rounded-md border border-gray-300 dark:border-gray-600 overflow-auto">
          <VueJsonPretty
              v-if="Object.keys(jsonObjectOutput).length > 0"
              :data="jsonObjectOutput"
              :deep="3"
              show-line
              show-icon
              class="p-4"
              :theme="isDarkMode ? 'vjp-dark' : 'vjp-light'"
          />
          <div v-else class="p-4 text-gray-400">Result will be shown here...</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* 使 Codemirror 编辑器填满其容器并修复对齐 */
.cm-editor {
  height: 100%;
  text-align: left !important; /* 强制左对齐 */
}

/* 暗黑模式下，让 Codemirror 的 gutter (行号区域) 背景色与主题匹配 */
.cm-theme-dark .cm-gutters {
  background-color: #282c34 !important;
}

/* vue-json-pretty 的样式微调 (保持不变) */
.vjs-tree {
  font-size: 13px !important;
  background-color: transparent;
}
</style>