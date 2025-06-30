<script setup>
import { ref, reactive, onMounted, watch } from 'vue';
import { TrashIcon } from '@heroicons/vue/24/outline'; // 引入删除图标

// --- Wails 方法导入 ---
import {
  SaveConfig,
  TestConnection,
  GetSyncPairs,
  SaveSyncPair,
  DeleteSyncPair
} from '../../../wailsjs/go/main/App';
import { SelectDirectory } from '../../../wailsjs/go/main/App'; // 导入新的方法


// --- Props & Emits ---
const props = defineProps(['config']);
const emit = defineEmits(['config-updated']);


// --- 响应式状态 ---
const form = reactive({ ...props.config });
const testStatus = ref('');
const testMessage = ref('');

// 1. 新增用于同步目录的状态
const syncPairs = ref([]); // 存储从后端获取的列表
const showAddForm = ref(false); // 控制添加表单的显示/隐藏
const newPair = reactive({ localPath: '', remotePath: '' }); // 存储新表单的数据


// --- 数据获取与监控 ---
async function fetchSyncPairs() {
  if (!props.config?.id) return;
  try {
    syncPairs.value = await GetSyncPairs(props.config.id);
  } catch (error) {
    console.error("Failed to fetch sync pairs:", error);
    syncPairs.value = []; // 出错时清空
  }
}

onMounted(() => {
  fetchSyncPairs();
});

// 监听 props.config 的变化，当用户切换左侧配置时，重新获取同步目录
watch(() => props.config.id, () => {
  fetchSyncPairs();
  // 重置表单以匹配新选择的配置
  Object.assign(form, props.config);
  testStatus.value = '';
  testMessage.value = '';
});

async function handleTestConnection() {
  testStatus.value = 'testing';
  testMessage.value = 'Connecting...';
  try {
    const result = await TestConnection(form);
    testStatus.value = 'success';
    testMessage.value = result;
  } catch (error) {
    testStatus.value = 'error';
    testMessage.value = error;
  }
}

async function handleSaveChanges() {
  try {
    await SaveConfig(form);
    emit('config-updated');
    alert('Configuration saved successfully!');
  } catch (error) {
    alert('Failed to save configuration: ' + error);
  }
}


async function handleBrowseLocalDirectory() {
  try {
    const dirPath = await SelectDirectory("Select Local Directory to Sync");
    if (dirPath) {
      newPair.localPath = dirPath;
    }
  } catch (error) {
    console.log("Directory selection cancelled or failed:", error);
  }
}

async function handleSaveNewPair() {
  if (!newPair.localPath || !newPair.remotePath) {
    alert("Local and Remote paths cannot be empty.");
    return;
  }
  try {
    await SaveSyncPair({
      configId: props.config.id,
      localPath: newPair.localPath,
      remotePath: newPair.remotePath,
      syncDeletes: true, // 默认开启删除同步，也可以做成一个选项
    });
    // 保存成功后，刷新列表、重置并隐藏表单
    await fetchSyncPairs();
    newPair.localPath = '';
    newPair.remotePath = '';
    showAddForm.value = false;
  } catch (error) {
    alert("Failed to save sync pair: " + error);
  }
}

async function handleDeletePair(pairId) {
  if (!confirm("Are you sure you want to delete this sync pair?")) {
    return;
  }
  try {
    await DeleteSyncPair(pairId);
    await fetchSyncPairs(); // 删除后刷新列表
  } catch (error) {
    alert("Failed to delete sync pair: " + error);
  }
}
</script>

<template>
  <div class="space-y-8">
<!--    <div class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow">-->
<!--      <h2 class="text-xl font-bold mb-4">Connection Settings</h2>-->
<!--      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">-->
<!--        <div>-->
<!--          <label class="block text-sm font-medium mb-1">Config Name</label>-->
<!--          <input v-model="form.name" type="text" class="w-full p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md">-->
<!--        </div>-->
<!--        <div>-->
<!--          <label class="block text-sm font-medium mb-1">Host</label>-->
<!--          <input v-model="form.host" type="text" class="w-full p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md">-->
<!--        </div>-->
<!--      </div>-->
<!--      <div class="mt-6 flex items-center space-x-4">-->
<!--        <button @click="handleSaveChanges" class="bg-blue-600 text-white py-2 px-5 rounded-md hover:bg-blue-700">Save Changes</button>-->
<!--        <button @click="handleTestConnection" class="bg-green-600 text-white py-2 px-5 rounded-md hover:bg-green-700">Test Connection</button>-->
<!--        <p v-if="testMessage" :class="{-->
<!--            'text-green-500': testStatus === 'success',-->
<!--            'text-red-500': testStatus === 'error',-->
<!--            'text-gray-500': testStatus === 'testing'-->
<!--         }">{{ testMessage }}</p>-->
<!--      </div>-->
<!--    </div>-->

    <div class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold">Sync Directories</h2>
        <button @click="showAddForm = !showAddForm" class="bg-blue-600 text-white py-1 px-3 rounded-md hover:bg-blue-700 text-sm">
          + Add Sync Pair
        </button>
      </div>

      <div v-if="showAddForm" class="p-4 mb-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg space-y-3">
        <div>
          <label class="block text-sm font-medium mb-1">Local Path</label>
          <div class="flex">
            <input v-model="newPair.localPath" type="text" readonly placeholder="Click Browse to select" class="w-full p-2 bg-gray-200 dark:bg-gray-700 rounded-l-md">
            <button @click="handleBrowseLocalDirectory" class="px-3 py-2 bg-gray-300 dark:bg-gray-600 rounded-r-md text-sm">Browse</button>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Remote Path</label>
          <input v-model="newPair.remotePath" type="text" placeholder="/var/www/my-project" class="w-full p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
        </div>
        <div class="flex justify-end space-x-2">
          <button @click="showAddForm = false" class="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-600 rounded-md">Cancel</button>
          <button @click="handleSaveNewPair" class="px-3 py-1 text-sm bg-green-600 text-white rounded-md">Save Pair</button>
        </div>
      </div>

      <div class="space-y-2">
        <div v-if="syncPairs.length === 0" class="text-center text-gray-500 py-4">
          No sync pairs configured.
        </div>
        <div v-for="pair in syncPairs" :key="pair.id" class="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700/50 rounded-md">
          <div class="font-mono text-sm">
            <p class="text-blue-600 dark:text-blue-400">{{ pair.localPath }}</p>
            <p class="text-gray-500">➔ {{ pair.remotePath }}</p>
          </div>
          <button @click="handleDeletePair(pair.id)" class="p-1 text-gray-400 hover:text-red-500 rounded-full">
            <TrashIcon class="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>

    <div class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
      <h2 class="text-xl font-bold mb-4">Clipboard to Remote File</h2>
    </div>
  </div>
</template>