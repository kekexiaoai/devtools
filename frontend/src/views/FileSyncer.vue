<script setup>
import { ref, reactive, onMounted } from 'vue';
import Modal from '../components/Modal.vue';
import ConfigList from '../components/filesyncer/ConfigList.vue';
import ConfigDetail from '../components/filesyncer/ConfigDetail.vue';

// Wails Go 后端方法
import { GetConfigs, SaveConfig, TestConnection, SelectFile, StartWatching, StopWatching } from '../../wailsjs/go/main/App';
// Wails Runtime 方法，用于文件选择

// --- 状态管理 ---

const configs = ref([]);
const selectedConfigId = ref(null);
const selectedConfig = ref(null);
const activeWatchers = ref({}); // 使用一个对象来存储激活状态, e.g., { "config-id-123": true }


// 模态框状态
const isModalOpen = ref(false);
const editingConfigId = ref(null); // 用于区分是新建还是编辑

// 表单状态
const form = reactive({
  id: '', name: '', host: '', port: 22, user: 'root',
  authMethod: 'password', password: '', keyPath: ''
});

// 测试连接状态
const testResult = ref({ status: '', message: '' }); // status: 'testing', 'success', 'error'

// --- 生命周期 & 数据加载 ---

onMounted(async () => {
  await refreshConfigs();
});

async function refreshConfigs() {
  configs.value = await GetConfigs();
  if (configs.value.length > 0 && !selectedConfigId.value) {
    handleSelectConfig(configs.value[0].id);
  }
}

function handleSelectConfig(id) {
  selectedConfigId.value = id;
  selectedConfig.value = configs.value.find(c => c.id === id) || null;
}

// --- 模态框控制 ---

function resetForm() {
  Object.assign(form, {
    id: '', name: '', host: '', port: 22, user: 'root',
    authMethod: 'password', password: '', keyPath: ''
  });
  testResult.value = { status: '', message: '' };
}

function handleOpenCreateModal() {
  resetForm();
  editingConfigId.value = null; // 清除编辑ID，表示是新建
  isModalOpen.value = true;
}

function handleOpenEditModal(configId) {
  const configToEdit = configs.value.find(c => c.id === configId);
  if (configToEdit) {
    resetForm();
    Object.assign(form, configToEdit); // 将现有数据填充到表单
    editingConfigId.value = configId; // 设置编辑ID
    isModalOpen.value = true;
  }
}

function handleModalClose() {
  isModalOpen.value = false;
}

// --- 表单与后端交互 ---

async function handleSaveConfig() {
  // 如果是编辑模式，把ID赋给表单
  if (editingConfigId.value) {
    form.id = editingConfigId.value;
  }

  try {
    await SaveConfig(form);
    alert('Configuration saved successfully!');
    handleModalClose();
    await refreshConfigs();
  } catch (error) {
    alert('Failed to save configuration: ' + error);
  }
}

async function handleTestConnectionInModal() {
  testResult.value = { status: 'testing', message: 'Connecting...' };
  try {
    const result = await TestConnection(form);
    testResult.value = { status: 'success', message: result };
  } catch (error) {
    testResult.value = { status: 'error', message: error };
  }
}

async function selectKeyFile() {
  try {
    // 直接调用我们后端 App 结构体上的 SelectFile 方法
    const filePath = await SelectFile("Select SSH Private Key");
    if (filePath) {
      form.keyPath = filePath;
    }
  } catch (error) {
    // 这个错误通常是用户取消了对话框，可以安全地忽略
    // 只有在发生真实错误时，Wails才会返回一个非空的error
    console.log("File selection cancelled or failed:", error);
  }
}

async function toggleWatcher(configId, isActive) {
  console.log(`Attempting to ${isActive ? 'START' : 'STOP'} watching for config ID:`, configId);

  try {
    if (isActive) {
      await StartWatching(configId);
      activeWatchers.value[configId] = true;
    } else {
      await StopWatching(configId);
      delete activeWatchers.value[configId];
    }
  } catch (error) {
    alert(`Failed to ${isActive ? 'start' : 'stop'} watching: ` + error);
  }
}
</script>

<template>
  <div class="flex h-full">
    <div class="w-1/3 max-w-xs border-r ...">
      <ConfigList
          :configs="configs"
          :selected-id="selectedConfigId"
          @select-config="handleSelectConfig"
          @configs-updated="refreshConfigs"
          @new-config-request="handleOpenCreateModal"
          @edit-config="handleOpenEditModal"
      />
    </div>
    <div class="flex-1 p-6 overflow-y-auto">
      <ConfigDetail
          v-if="selectedConfig"
          :key="selectedConfig.id"
          :config="selectedConfig"
          :is-watching="activeWatchers[selectedConfig.id] || false"
          @toggle-watcher="toggleWatcher"
          @config-updated="refreshConfigs"
      />
    </div>
  </div>

  <Modal v-if="isModalOpen" @close="handleModalClose">
    <template #header>
      <h3 class="text-lg font-medium ...">{{ editingConfigId ? 'Edit Configuration' : 'Create New Configuration' }}</h3>
    </template>

    <div class="mt-4 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
      <div>
        <label class="block text-sm font-medium mb-1">Config Name</label>
        <input v-model="form.name" type="text" placeholder="E.g., My Production Server" class="w-full p-2 ...">
      </div>
      <div class="grid grid-cols-3 gap-4">
        <div class="col-span-2">
          <label class="block text-sm font-medium mb-1">Host</label>
          <input v-model="form.host" type="text" placeholder="192.168.1.100" class="w-full p-2 ...">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Port</label>
          <input v-model.number="form.port" type="number" class="w-full p-2 ...">
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">User</label>
        <input v-model="form.user" type="text" placeholder="root" class="w-full p-2 ...">
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">Authentication Method</label>
        <div class="flex space-x-4">
          <label class="flex items-center">
            <input type="radio" v-model="form.authMethod" value="password" class="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300">
            <span class="ml-2">Password</span>
          </label>
          <label class="flex items-center">
            <input type="radio" v-model="form.authMethod" value="key" class="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300">
            <span class="ml-2">Key File</span>
          </label>
        </div>
      </div>

      <div v-if="form.authMethod === 'password'">
        <label class="block text-sm font-medium mb-1">Password</label>
        <input v-model="form.password" type="password" class="w-full p-2 ...">
      </div>
      <div v-if="form.authMethod === 'key'">
        <label class="block text-sm font-medium mb-1">Private Key Path</label>
        <div class="flex items-center">
          <input v-model="form.keyPath" type="text" readonly placeholder="Click Browse to select a key file" class="w-full p-2 bg-gray-200 ...">
          <button @click="selectKeyFile" class="ml-2 px-3 py-2 bg-gray-300 dark:bg-gray-600 rounded-md text-sm">Browse</button>
        </div>
      </div>

      <p v-if="testResult.message" class="text-sm p-2 rounded-md" :class="{
          'text-green-800 bg-green-100 dark:text-green-200 dark:bg-green-900/50': testResult.status === 'success',
          'text-red-800 bg-red-100 dark:text-red-200 dark:bg-red-900/50': testResult.status === 'error',
          'text-gray-800 bg-gray-100 dark:text-gray-200 dark:bg-gray-700': testResult.status === 'testing'
      }">{{ testResult.message }}</p>

    </div>

    <template #footer>
      <button @click="handleModalClose" class="px-4 py-2 ...">Cancel</button>
      <button @click="handleTestConnectionInModal" class="px-4 py-2 ...">Test Connection</button>
      <button @click="handleSaveConfig" class="px-4 py-2 bg-indigo-600 ...">Save</button>
    </template>
  </Modal>
</template>