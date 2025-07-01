<script setup>
import { ref, reactive } from 'vue';
import { ClipboardDocumentCheckIcon, ArrowDownTrayIcon, TrashIcon, ArrowsRightLeftIcon } from '@heroicons/vue/24/outline';

// --- 状态管理 ---
const jsonInput = ref('');
const jsonOutput = ref('');
const validationResult = reactive({
  isValid: null, // null, true, or false
  message: ''
});

// --- 核心方法 ---

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
    // 使用 JSON.stringify 的第三个参数 '2' 来进行美化，表示缩进2个空格
    jsonOutput.value = JSON.stringify(jsonObj, null, 2);
    validationResult.isValid = true;
    validationResult.message = 'Valid JSON';
  } catch (error) {
    jsonOutput.value = ''; // 清空输出
    validationResult.isValid = false;
    validationResult.message = `Invalid JSON: ${error.message}`;
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
  if (!jsonOutput.value) return;
  try {
    await navigator.clipboard.writeText(jsonOutput.value);
    alert('Output copied to clipboard!');
  } catch (err) {
    alert('Failed to copy: ' + err);
  }
}

// 清空所有
function clearAll() {
  jsonInput.value = '';
  jsonOutput.value = '';
  validationResult.isValid = null;
  validationResult.message = '';
}
</script>

<template>
  <div class="h-full flex flex-col p-4 space-y-4">
    <div class="flex-shrink-0 flex items-center space-x-2">
      <button @click="formatAndValidate" class="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
        <ArrowsRightLeftIcon class="h-5 w-5"/>
        <span>Format / Validate</span>
      </button>
      <button @click="minify" class="flex items-center space-x-2 px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm">
        <ArrowDownTrayIcon class="h-5 w-5"/>
        <span>Minify</span>
      </button>
      <div class="flex-grow"></div> <button @click="copyOutput" :disabled="!jsonOutput" class="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
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

    <div class="flex-grow flex space-x-4 overflow-hidden">
      <div class="w-1/2 h-full flex flex-col">
        <label class="mb-1 text-sm font-semibold">Input</label>
        <textarea
            v-model="jsonInput"
            placeholder="Paste your JSON here..."
            class="w-full flex-grow p-2 font-mono text-sm bg-gray-100 dark:bg-gray-800 rounded-md border border-gray-300 dark:border-gray-600 resize-none focus:ring-blue-500 focus:border-blue-500"
        ></textarea>
      </div>
      <div class="w-1/2 h-full flex flex-col">
        <label class="mb-1 text-sm font-semibold">Output</label>
        <textarea
            :value="jsonOutput"
            readonly
            placeholder="Result will be shown here..."
            class="w-full flex-grow p-2 font-mono text-sm bg-gray-100 dark:bg-gray-800 rounded-md border border-gray-300 dark:border-gray-600 resize-none"
        ></textarea>
      </div>
    </div>
  </div>
</template>