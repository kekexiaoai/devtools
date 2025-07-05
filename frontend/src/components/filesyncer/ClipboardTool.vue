<script setup>
import { ref, reactive, watch } from 'vue'
import Modal from '../Modal.vue'
import {
  SaveConfig,
  UpdateRemoteFileFromClipboard,
  ShowErrorDialog,
} from '../../../wailsjs/go/main/App'
import { ClipboardGetText } from '../../../wailsjs/runtime/runtime'
import Tooltip from '../ui/Tooltip.vue'

const props = defineProps(['config'])
const emit = defineEmits(['config-updated', 'log-event']);


const createFormState = (config) => ({
  clipboardFilePath: config?.clipboardFilePath || '',
})
const form = reactive(createFormState(props.config))

const isEditingClipboardPath = ref(false)
const isClipboardModalOpen = ref(false)
const clipboardContent = ref('')
const syncAsHTML = ref(true)
const autoSyncOnPaste = ref(true)
const syncStatus = ref('')
const closeOnSuccess = ref(true);

watch(
  () => props.config,
  (newConfig) => {
    Object.assign(form, createFormState(newConfig))
    isEditingClipboardPath.value = false
  },
  { deep: true }
)

watch(clipboardContent, (newValue, oldValue) => {
  // 当内容发生变化，并且之前的状态是'Success!'时，清除状态
  if (syncStatus.value === 'Success!' && newValue !== oldValue) {
    syncStatus.value = '';
  }
});

async function handleSaveChanges() {
  if (!form.clipboardFilePath || !form.clipboardFilePath.trim()) {
    return await ShowErrorDialog('Invalid Path', 'Remote File Path cannot be empty.')
  }
  try {
    // We only save the clipboard path, but need to pass the whole config
    const configToSave = { ...props.config, clipboardFilePath: form.clipboardFilePath }
    await SaveConfig(configToSave)
    emit('config-updated')
    isEditingClipboardPath.value = false
  } catch (error) {
    await ShowErrorDialog('Error', 'Failed to save configuration: ' + error)
  }
}

function cancelEditClipboardPath() {
  form.clipboardFilePath = props.config.clipboardFilePath || ''
  isEditingClipboardPath.value = false
}

function openClipboardEditor() {
  clipboardContent.value = ''
  syncStatus.value = ''
  isClipboardModalOpen.value = true
}

async function pasteFromClipboard() {
  syncStatus.value = ''; // 清除状态

  try {
    // 优先尝试使用现代、编码正确的浏览器原生API
    console.log("Attempting to use navigator.clipboard.readText()");
    const text = await navigator.clipboard.readText();
    clipboardContent.value = text;

  } catch (navError) {
    console.warn("navigator.clipboard.readText() failed, falling back to Wails runtime.", navError);
    try {
      // 如果原生API失败（比如因为权限问题），则回退到 Wails 的后端方法
      const text = await ClipboardGetText();
      clipboardContent.value = text;
    } catch (wailsError) {
      console.error("Wails ClipboardGetText() also failed.", wailsError);
      await ShowErrorDialog(
        'Paste Failed',
        'Could not get text from clipboard. Please try using Ctrl+V (or ⌘+V on Mac) to paste directly into the text area.'
      );
      return; // 两种方法都失败，直接返回
    }
  }

  // 无论哪种方法成功，都检查是否需要自动同步
  if (autoSyncOnPaste.value) {
    await syncClipboardContent();
  }
}

async function syncClipboardContent() {
  if (!form.clipboardFilePath)
    return await ShowErrorDialog('Error', 'Please configure remote file path first.')
  if (!clipboardContent.value) return await ShowErrorDialog('Error', 'Content is empty.')

  syncStatus.value = 'Syncing...'
  try {
    await UpdateRemoteFileFromClipboard(
      props.config.id,
      form.clipboardFilePath,
      clipboardContent.value,
      syncAsHTML.value
    )
    syncStatus.value = 'Success!'
    const logEntry = {
      level: 'SUCCESS',
      message: `Clipboard content synced to: ${form.clipboardFilePath}`
    };
    // 在这里打印日志，确认事件已发出
    console.log('ClipboardTool: Emitting log-event', logEntry);
    emit('log-event', logEntry);
    if (closeOnSuccess.value) {
      setTimeout(() => {
        isClipboardModalOpen.value = false;
      }, 1000);
    }
  } catch (error) {
    syncStatus.value = `Error: ${error}`
    emit('log-event', {
      level: 'ERROR',
      message: `Failed to sync clipboard: ${error}`
    });
  }
}

async function handleNativePaste(event) {
  // 从事件的 clipboardData 属性中直接获取粘贴的文本
  const pastedText = event.clipboardData.getData('text');

  if (!pastedText) return;

  // 如果自动同步开启
  if (autoSyncOnPaste.value) {
    // 为了让用户看到粘贴的内容，我们可以手动更新 v-model 的值
    // event.preventDefault() 可以阻止默认粘贴行为，然后我们自己设置值
    event.preventDefault();
    clipboardContent.value += pastedText;

    // 立即使用我们刚获取到的文本执行同步
    await syncClipboardContent(false);
  }
}
</script>



<template>
  <div class="mt-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
    <h2 class="text-xl font-bold mb-4">Clipboard to Remote File</h2>
    <div>
      <label class="block text-sm font-medium mb-1">Remote File Path</label>
      <div v-if="!isEditingClipboardPath" class="flex items-center justify-between">
        <p class="p-2 text-gray-700 dark:text-gray-300 font-mono truncate">
          {{ form.clipboardFilePath || 'Not set' }}
        </p>
        <button @click="isEditingClipboardPath = true"
          class="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-sm rounded-md flex-shrink-0 hover:bg-gray-300 dark:hover:bg-gray-500">
          Edit
        </button>
      </div>
      <div v-else class="flex items-center space-x-2">
        <input v-model="form.clipboardFilePath" type="text" placeholder="/home/user/my_notes.txt"
          class="w-full p-2 bg-gray-100 dark:bg-gray-700 rounded-md border border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500" />
        <button @click="cancelEditClipboardPath"
          class="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-sm rounded-md flex-shrink-0">
          Cancel
        </button>
        <button @click="handleSaveChanges" class="px-4 py-2 bg-green-600 text-white text-sm rounded-md flex-shrink-0">
          Save
        </button>
      </div>
    </div>
    <div class="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
      <button @click="openClipboardEditor" :disabled="!form.clipboardFilePath || isEditingClipboardPath"
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
        Open Editor & Sync
      </button>
    </div>

    <Modal v-if="isClipboardModalOpen" @close="isClipboardModalOpen = false" size="responsive">
      <template #header>
        <h3 class="text-lg font-medium">Sync to: {{ form.clipboardFilePath }}</h3>
      </template>
      <div class="h-full flex flex-col">
        <textarea @paste="handleNativePaste($event)" v-model="clipboardContent"
          placeholder="Press Ctrl+V (or ⌘+V on Mac) to paste content here..."
          class="flex-grow w-full p-2 font-mono text-sm bg-gray-100 dark:bg-gray-700 rounded-md resize-none"></textarea>
        <div class="mt-2 space-y-2 text-sm text-gray-600 dark:text-gray-300 flex-shrink-0">
          <label class="flex items-center cursor-pointer"><input type="checkbox" v-model="syncAsHTML"
              class="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 dark:bg-gray-900" /><span
              class="ml-2">Sync as viewable HTML...</span></label>
          <label class="flex items-center cursor-pointer"><input type="checkbox" v-model="autoSyncOnPaste"
              class="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 dark:bg-gray-900" /><span
              class="ml-2">Auto-sync on paste</span></label>
          <label class="flex items-center cursor-pointer">
            <input type="checkbox" v-model="closeOnSuccess"
              class="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 dark:bg-gray-900">
            <span class="ml-2">Close modal on successful sync</span>
          </label>
        </div>
      </div>
      <template #footer>
        <div class="flex items-center w-full justify-between gap-x-4">
            <!-- <div>
                <button @click="pasteFromClipboard" class="btn btn-secondary">Paste from Clipboard</button>
            </div> -->

            <Tooltip
             v-if="syncStatus" 
             :text="syncStatus"
             class="flex-1 min-w-0 text-center"
             >
                <span
                    class="text-sm font-medium truncate cursor-help"
                    :class="{
                        'text-green-500': syncStatus === 'Success!',
                        'text-red-500': syncStatus.startsWith('Error'),
                    }"
                >{{ syncStatus }}</span>
            </Tooltip>
            <div v-else class="flex-1"></div>

            <div class="flex items-center space-x-3 ml-auto">
                <button @click="isClipboardModalOpen = false" class="btn btn-secondary">Cancel</button>
                <button @click="syncClipboardContent(true)" class="btn btn-primary">Sync to Remote</button>
            </div>
        </div>
      </template>
    </Modal>
  </div>
</template>