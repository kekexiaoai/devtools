<script setup>
import {onMounted, reactive, ref, watch} from 'vue';
import {TrashIcon} from '@heroicons/vue/24/outline';
import Modal from '../Modal.vue';

// --- Wails 方法导入 ---
import {
  DeleteSyncPair,
  GetSyncPairs,
  SaveConfig,
  SaveSyncPair,
  SelectDirectory,
  UpdateRemoteFileFromClipboard,
} from '../../../wailsjs/go/main/App';
import {ClipboardGetText} from '../../../wailsjs/runtime/runtime';


// --- Props & Emits ---
const props = defineProps(['config', 'isWatching']);
const emit = defineEmits(['config-updated', 'toggle-watcher']);


// --- 响应式状态 ---
const form = reactive({...props.config});

// 同步目录状态
const syncPairs = ref([]);
const showAddForm = ref(false);
const newPair = reactive({localPath: '', remotePath: ''});

// 剪贴板功能状态
const isClipboardModalOpen = ref(false);
const clipboardContent = ref('');
const syncAsHTML = ref(false);         // <-- 新增：是否作为HTML同步
const autoSyncOnPaste = ref(false);      // <-- 新增：是否粘贴后自动同步
const syncStatus = ref(''); // 新增：用于在模态框内显示同步状态


// --- 数据获取与监控 ---
async function fetchSyncPairs() {
  if (!props.config?.id) return;
  try {
    syncPairs.value = await GetSyncPairs(props.config.id);
  } catch (error) {
    console.error("Failed to fetch sync pairs:", error);
    syncPairs.value = [];
  }
}

onMounted(fetchSyncPairs);
watch(() => props.config.id, () => {
  Object.assign(form, props.config);
  fetchSyncPairs();
});


// --- 方法定义 ---
async function handleSaveChanges() {
  try {
    await SaveConfig(form);
    emit('config-updated');
    alert('Configuration saved!');
  } catch (error) {
    alert('Failed to save configuration: ' + error);
  }
}

async function handleBrowseLocalDirectory() {
  try {
    const dirPath = await SelectDirectory("Select Local Directory to Sync");
    if (dirPath) newPair.localPath = dirPath;
  } catch (error) {
    console.log("Directory selection cancelled:", error);
  }
}

async function handleSaveNewPair() {
  if (!newPair.localPath || !newPair.remotePath) return alert("Paths cannot be empty.");
  try {
    await SaveSyncPair({configId: props.config.id, ...newPair, syncDeletes: true});
    await fetchSyncPairs();
    newPair.localPath = '';
    newPair.remotePath = '';
    showAddForm.value = false;
  } catch (error) {
    alert("Failed to save sync pair: " + error);
  }
}

async function handleDeletePair(pairId) {
  if (!confirm("Are you sure?")) return;
  try {
    await DeleteSyncPair(pairId);
    await fetchSyncPairs();
  } catch (error) {
    alert("Failed to delete sync pair: " + error);
  }
}

function openClipboardEditor() {
  clipboardContent.value = '';
  isClipboardModalOpen.value = true;
}

async function pasteFromClipboard() {
  syncStatus.value = ''; // 清除状态
  try {
    const text = await ClipboardGetText();
    clipboardContent.value = text;
    if (autoSyncOnPaste.value) {
      await syncClipboardContent(false); // 传入 false 表示不要在成功后关闭模态框
    }
  } catch (error) {
    alert("Could not get text from clipboard: " + error);
  }
}

async function syncClipboardContent(closeOnSuccess = true) {
  if (!form.clipboardFilePath) return alert("Please configure remote file path first.");
  if (!clipboardContent.value) return alert("Content is empty.");

  syncStatus.value = 'Syncing...'; // 显示同步中状态
  try {
    await UpdateRemoteFileFromClipboard(props.config.id, form.clipboardFilePath, clipboardContent.value, syncAsHTML.value);
    syncStatus.value = 'Success!'; // 显示成功状态
    if (closeOnSuccess) {
      setTimeout(() => {
        isClipboardModalOpen.value = false;
      }, 1000); // 延迟1秒关闭，让用户看到成功信息
    }
  } catch (error) {
    syncStatus.value = `Error: ${error}`; // 显示错误状态
  }
}
</script>

<template>
  <div>
    <div class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold">Sync Directories</h2>
        <div class="flex items-center space-x-4">
          <div class="flex items-center space-x-2">
            <span class="text-sm font-medium"
                  :class="isWatching ? 'text-green-500' : 'text-gray-500'">{{ isWatching ? 'Active' : 'Paused' }}</span>
            <button @click="emit('toggle-watcher', config.id, !isWatching)"
                    class="relative inline-flex items-center h-6 rounded-full w-11 transition-colors..."
                    :class="isWatching ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'">
              <span class="inline-block w-4 h-4 transform bg-white rounded-full transition-transform"
                    :class="isWatching ? 'translate-x-6' : 'translate-x-1'"/>
            </button>
          </div>
          <button @click="showAddForm = !showAddForm"
                  class="bg-blue-600 text-white py-1 px-3 rounded-md hover:bg-blue-700 text-sm">+ Add Sync Pair
          </button>
        </div>
      </div>

      <div v-if="showAddForm" class="p-4 mb-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg space-y-3">
        <div>
          <label class="block text-sm font-medium mb-1">Local Path</label>
          <div class="flex">
            <input v-model="newPair.localPath" type="text" readonly placeholder="Click Browse to select"
                   class="w-full p-2 bg-gray-200 dark:bg-gray-700 rounded-l-md">
            <button @click="handleBrowseLocalDirectory"
                    class="px-3 py-2 bg-gray-300 dark:bg-gray-600 rounded-r-md text-sm">Browse
            </button>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Remote Path</label>
          <input v-model="newPair.remotePath" type="text" placeholder="/var/www/my-project"
                 class="w-full p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
        </div>
        <div class="flex justify-end space-x-2">
          <button @click="showAddForm = false" class="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-600 rounded-md">
            Cancel
          </button>
          <button @click="handleSaveNewPair" class="px-3 py-1 text-sm bg-green-600 text-white rounded-md">Save Pair
          </button>
        </div>
      </div>

      <div class="space-y-2">
        <div v-if="syncPairs.length === 0" class="text-center text-gray-500 py-4">
          No sync pairs configured.
        </div>
        <div v-for="pair in syncPairs" :key="pair.id"
             class="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700/50 rounded-md">
          <div class="font-mono text-sm">
            <p class="text-blue-600 dark:text-blue-400">{{ pair.localPath }}</p>
            <p class="text-gray-500">➔ {{ pair.remotePath }}</p>
          </div>
          <button @click="handleDeletePair(pair.id)" class="p-1 text-gray-400 hover:text-red-500 rounded-full">
            <TrashIcon class="h-5 w-5"/>
          </button>
        </div>
      </div>
    </div>

    <div class="mt-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
      <h2 class="text-xl font-bold mb-4">Clipboard to Remote File</h2>
      <div>
        <label class="block text-sm font-medium mb-1">Remote File Path</label>
        <div class="flex items-center space-x-2">
          <input v-model="form.clipboardFilePath" type="text" placeholder="/home/user/my_notes.txt"
                 class="w-full p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
          <button @click="handleSaveChanges"
                  class="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-sm rounded-md flex-shrink-0">Save Path
          </button>
        </div>
      </div>
      <div class="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
        <button @click="openClipboardEditor" :disabled="!form.clipboardFilePath"
                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
          Open Editor & Sync
        </button>
      </div>
    </div>
  </div>

  <Modal v-if="isClipboardModalOpen" @close="isClipboardModalOpen = false">
    <template #header>
      <h3 class="text-lg font-medium">Sync to: {{ form.clipboardFilePath }}</h3>
    </template>

    <textarea
        v-model="clipboardContent"
        placeholder="Paste your content here..."
        class="w-full h-64 p-2 mt-4 font-mono text-sm bg-gray-100 dark:bg-gray-700 rounded-md">
    </textarea>

    <div class="mt-2 space-y-2 text-sm text-gray-600 dark:text-gray-300">
      <label class="flex items-center cursor-pointer">
        <input type="checkbox" v-model="syncAsHTML"
               class="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 dark:bg-gray-900">
        <span class="ml-2">Sync as viewable HTML (wraps content in `&lt;pre&gt;` tag)</span>
      </label>
      <label class="flex items-center cursor-pointer">
        <input type="checkbox" v-model="autoSyncOnPaste"
               class="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 dark:bg-gray-900">
        <span class="ml-2">Auto-sync on paste</span>
      </label>
    </div>

    <template #footer>
      <div class="flex items-center w-full justify-between">
        <div>
          <button @click="pasteFromClipboard" class="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">
            Paste from Clipboard
          </button>
        </div>
        <span v-if="syncStatus" class="text-sm font-medium"
              :class="{'text-green-500': syncStatus === 'Success!', 'text-red-500': syncStatus.startsWith('Error')}">
          {{ syncStatus }}
        </span>
        <div class="flex items-center space-x-3">
          <button @click="isClipboardModalOpen = false"
                  class="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel
          </button>
          <button @click="syncClipboardContent(true)"
                  class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Sync to Remote
          </button>
        </div>
      </div>
    </template>
  </Modal>
</template>