<script setup>
import {reactive, ref} from 'vue';
import {ArrowDownTrayIcon, ArrowsRightLeftIcon, ChevronLeftIcon, ChevronRightIcon} from '@heroicons/vue/24/outline';

// 1. 导入 vue-json-pretty 组件及其样式
import VueJsonPretty from 'vue-json-pretty';
import 'vue-json-pretty/lib/styles.css';

// --- 状态管理 ---
const jsonInput = ref('');
// 将原来的 jsonOutput 拆分为两部分
const jsonObjectOutput = ref({}); // 存储解析后的 JS 对象，用于树状图展示
const validationResult = reactive({isValid: null, message: ''});

// 新增：控制左侧输入框的显示
const isInputVisible = ref(true);

function toggleInputView() {
  isInputVisible.value = !isInputVisible.value;
}

// 格式化与校验
function formatAndValidate() {
  if (!jsonInput.value.trim()) {
    validationResult.isValid = null;
    validationResult.message = '';
    jsonOutput.value = '';
    return;
  }

  try {
    const jsonObj = JSON.parse(jsonInput.value);
    jsonObjectOutput.value = jsonObj; // 2. 将解析后的对象赋给新状态
    validationResult.isValid = true;
    validationResult.message = 'Valid JSON';
  } catch (error) {
    jsonObjectOutput.value = {}; // 清空对象
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
    alert('Minified JSON copied to clipboard!');
  } catch (error) {
    alert('Invalid JSON, cannot minify.');
  }
}

// 压缩 JSON
function minify() {
  if (!jsonInput.value.trim()) {
    validationResult.isValid = null;
    validationResult.message = '';
    jsonOutput.value = '';
    return;
  }

  try {
    const jsonObj = JSON.parse(jsonInput.value);
    // 不带额外参数的 JSON.stringify 会生成压缩后的字符串
    jsonOutput.value = JSON.stringify(jsonObj);
    validationResult.isValid = true;
    validationResult.message = 'Valid JSON';
  } catch (error) {
    jsonOutput.value = '';
    validationResult.isValid = false;
    validationResult.message = `Invalid JSON: ${error.message}`;
  }
}

// 复制输出结果
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
  <div class="h-full flex flex-col p-4 space-y-4">
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

      <transition name="slide-fade">
        <div v-if="isInputVisible" class="w-1/2 h-full flex flex-col">
          <label class="mb-1 text-sm font-semibold">Input</label>
          <textarea
              v-model="jsonInput"
              placeholder="Paste your JSON here..."
              class="m-1 flex-grow w-full p-2 font-mono text-sm bg-gray-100 dark:bg-gray-700 rounded-md resize-none"
          ></textarea>
        </div>
      </transition>

      <div class="flex-shrink-0 flex items-center justify-center">
        <button @click="toggleInputView"
                class="h-8 w-5 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center justify-center">
          <ChevronLeftIcon v-if="isInputVisible" class="h-4 w-4"/>
          <ChevronRightIcon v-else class="h-4 w-4"/>
        </button>
      </div>

      <div class="h-full flex flex-col" :class="isInputVisible ? 'w-1/2' : 'w-full'">
        <label class="mb-1 text-sm font-semibold">Output</label>
        <div
            class="w-full flex-grow p-4 bg-gray-100 dark:bg-gray-800 rounded-md border border-gray-300 dark:border-gray-600 overflow-auto">
          <VueJsonPretty
              v-if="Object.keys(jsonObjectOutput).length > 0"
              :data="jsonObjectOutput"
              :deep="3"
              show-line
              show-icon
          />
          <div v-else class="text-gray-400">Result will be shown here...</div>
        </div>
      </div>
    </div>
  </div>
</template>


<style>
/* 添加一个简单的过渡效果 */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease-out;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(-20px);
  opacity: 0;
  width: 0;
}

.vjs-tree {
  font-size: 13px !important;
}
</style>