<script setup>
import {onMounted, reactive, ref} from 'vue';
import ConfigList from '../components/filesyncer/ConfigList.vue';
import ConfigDetail from '../components/filesyncer/ConfigDetail.vue';
import Modal from '../components/Modal.vue';

// --- Wails 方法导入 ---
import {
  GetConfigs,
  SaveConfig,
  SelectFile,
  StartWatching,
  StopWatching,
  TestConnection
} from '../../wailsjs/go/main/App';


// --- 状态管理 ---
const configs = ref([]);
const selectedConfigId = ref(null);
const selectedConfig = ref(null);
const activeWatchers = ref({}); // 存储激活状态, e.g., { "config-id-123": true }

// 模态框状态
const isModalOpen = ref(false);
const editingConfigId = ref(null); // 用于区分是新建还是编辑
const testResult = ref({status: '', message: ''}); // 存储测试连接结果

// 表单状态 (用于新建/编辑模态框)
const form = reactive({
  id: '',
  name: '',
  host: '',
  port: 22,
  user: 'root',
  authMethod: 'password', // 'password' or 'key'
  password: '',
  keyPath: ''
});

// --- 方法定义 ---

// 重置表单和相关状态
function resetForm() {
  Object.assign(form, {
    id: '', name: '', host: '', port: 22, user: 'root',
    authMethod: 'password', password: '', keyPath: ''
  });
  testResult.value = {status: '', message: ''};
}

// 生命周期钩子：组件挂载时加载配置
onMounted(async () => {
  await refreshConfigs();
});

// 刷新配置列表
async function refreshConfigs() {
  try {
    configs.value = await GetConfigs();
    // 如果列表不为空且没有选中项，则默认选中第一个
    if (configs.value.length > 0 && !selectedConfigId.value) {
      handleSelectConfig(configs.value[0].id);
    }
  } catch (error) {
    console.error("Failed to load configs:", error);
    alert("Failed to load configurations.");
  }
}

// 处理左侧列表的选中事件
function handleSelectConfig(id) {
  selectedConfigId.value = id;
  selectedConfig.value = configs.value.find(c => c.id === id) || null;
}

// 打开“新建配置”模态框
function handleOpenCreateModal() {
  resetForm();
  editingConfigId.value = null; // 清除编辑ID，表示是新建
  isModalOpen.value = true;
}

// 打开“编辑配置”模态框
function handleOpenEditModal(configId) {
  const configToEdit = configs.value.find(c => c.id === configId);
  if (configToEdit) {
    resetForm();
    Object.assign(form, configToEdit); // 将现有数据填充到表单
    editingConfigId.value = configId; // 设置编辑ID
    isModalOpen.value = true;
  }
}

// 关闭模态框
function handleModalClose() {
  isModalOpen.value = false;
}

// 保存配置（新建或编辑）
async function handleSaveConfig() {
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

// 在模态框中测试连接
async function handleTestConnectionInModal() {
  testResult.value = {status: 'testing', message: 'Connecting...'};
  try {
    const result = await TestConnection(form);
    testResult.value = {status: 'success', message: result};
  } catch (error) {
    testResult.value = {status: 'error', message: error.toString()};
  }
}

// 切换同步服务的激活状态
async function toggleWatcher(configId, isActive) {
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

// 选择密钥文件
async function selectKeyFileForForm() {
  try {
    const filePath = await SelectFile("Select SSH Private Key");
    if (filePath) {
      form.keyPath = filePath;
    }
  } catch (error) {
    console.error("Error selecting file:", error);
  }
}
</script>

<template>
  <div class="flex h-full">
    <div class="w-1/3 max-w-xs flex-shrink-0 border-r border-gray-200 dark:border-gray-700">
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
      <div v-else class="flex items-center justify-center h-full text-gray-500">
        <p>Select or create a configuration to get started.</p>
      </div>
    </div>
  </div>

  <Modal v-if="isModalOpen" @close="handleModalClose" size="standard">
    <template #header>
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">
        {{ editingConfigId ? 'Edit Configuration' : 'Create New Configuration' }}
      </h3>
    </template>

    <div class="mt-4 grid grid-cols-[auto,1fr] gap-x-4 gap-y-5 items-center">
      <label for="config-name" class="text-sm font-medium text-gray-700 dark:text-gray-300 text-right">Name</label>
      <input id="config-name" v-model="form.name" type="text" placeholder="E.g., My Production Server"
             class="input-field">

      <label for="config-host" class="text-sm font-medium text-gray-700 dark:text-gray-300 text-right">Host &
        Port</label>
      <div class="grid grid-cols-3 gap-x-2">
        <input id="config-host" v-model="form.host" type="text" placeholder="192.168.1.100"
               class="input-field col-span-2">
        <input v-model.number="form.port" type="number" placeholder="22" class="input-field">
      </div>

      <label for="config-user" class="text-sm font-medium text-gray-700 dark:text-gray-300 text-right">User</label>
      <input id="config-user" v-model="form.user" type="text" placeholder="root" class="input-field">

      <label class="text-sm font-medium text-gray-700 dark:text-gray-300 text-right">Auth Method</label>
      <div class="flex space-x-4">
        <label class="flex items-center cursor-pointer"><input type="radio" v-model="form.authMethod" value="password"
                                                               class="h-4 w-4 radio-field"><span
            class="ml-2">Password</span></label>
        <label class="flex items-center cursor-pointer"><input type="radio" v-model="form.authMethod" value="key"
                                                               class="h-4 w-4 radio-field"><span
            class="ml-2">Key File</span></label>
      </div>

      <template v-if="form.authMethod === 'password'">
        <label for="config-password"
               class="text-sm font-medium text-gray-700 dark:text-gray-300 text-right">Password</label>
        <input id="config-password" v-model="form.password" type="password" class="input-field">
      </template>

      <template v-if="form.authMethod === 'key'">
        <label for="config-keypath" class="text-sm font-medium text-gray-700 dark:text-gray-300 text-right">Key
          Path</label>
        <div class="flex items-center">
          <input id="config-keypath" v-model="form.keyPath" type="text" readonly
                 placeholder="Click Browse to select a key file"
                 class="input-field bg-gray-200 dark:bg-gray-800 rounded-r-none">
          <button @click="selectKeyFileForForm"
                  class="px-3 py-2 bg-gray-300 dark:bg-gray-600 rounded-r-md text-sm flex-shrink-0 hover:bg-gray-400 dark:hover:bg-gray-500">
            Browse
          </button>
        </div>
      </template>

      <div v-if="testResult.message" class="col-span-2">
        <p class="text-sm p-2 rounded-md mt-2 text-center" :class="{
          'text-green-800 bg-green-100 dark:text-green-200 dark:bg-green-900/50': testResult.status === 'success',
          'text-red-800 bg-red-100 dark:text-red-200 dark:bg-red-900/50': testResult.status === 'error',
          'text-gray-800 bg-gray-100 dark:text-gray-200 dark:bg-gray-700': testResult.status === 'testing'
        }">{{ testResult.message }}</p>
      </div>
    </div>

    <template #footer>
      <button @click="handleTestConnectionInModal" class="btn btn-secondary">
        Test Connection
      </button>
      <div class="flex-grow"></div>
      <button @click="handleModalClose" class="btn btn-secondary">
        Cancel
      </button>
      <button @click="handleSaveConfig" class="btn btn-primary">
        Save
      </button>
    </template>
  </Modal>
</template>

<style scoped>
/* 定义一些可复用的样式，让模板更简洁 */
.input-field {
  @apply w-full p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none;
}

.radio-field {
  @apply text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:checked:bg-indigo-600;
}

.btn {
  @apply px-4 py-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800;
}

.btn-primary {
  @apply bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500;
}

.btn-secondary {
  @apply bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 focus:ring-gray-500;
}
</style>