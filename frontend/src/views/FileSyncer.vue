<script setup>
import { onMounted, reactive, ref } from 'vue';
import ConfigList from '../components/filesyncer/ConfigList.vue';
import ConfigDetail from '../components/filesyncer/ConfigDetail.vue';
import Modal from '../components/Modal.vue';
import { ShowErrorDialog, ShowInfoDialog } from '../../wailsjs/go/main/App';


// 导入 shadcn-vue 组件
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'


// --- Wails 方法导入 ---
import {
  GetConfigs,
  SaveConfig,
  DeleteConfig,
  SelectFile,
  StartWatching,
  StopWatching,
  TestConnection,
  ShowConfirmDialog,
} from '../../wailsjs/go/main/App';


const emit = defineEmits(['log-event']);

// --- 状态管理 ---
const configs = ref([]);
const selectedConfigId = ref(null);
const selectedConfig = ref(null);
const activeWatchers = ref({}); // 存储激活状态, e.g., { "config-id-123": true }

// 模态框状态
const isModalOpen = ref(false);
const editingConfigId = ref(null); // 用于区分是新建还是编辑
const testResult = ref({ status: '', message: '' }); // 存储测试连接结果

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
  testResult.value = { status: '', message: '' };
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
    await ShowErrorDialog('Error', "Failed to load configurations: " + error.message);
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
    await ShowInfoDialog('Success', 'Configuration saved successfully!');
    handleModalClose();
    await refreshConfigs();
  } catch (error) {
    await ShowErrorDialog('Error', 'Failed to save configuration: ' + error);
  }
}

async function handleDeleteConfig(configId) {
  // Use the native confirmation dialog
  const choice = await ShowConfirmDialog(
    "Confirm Deletion",
    "Are you sure you want to permanently delete this configuration? This action cannot be undone."
  );

  if (choice !== "Yes") {
    return; // User cancelled
  }

  try {
    await DeleteConfig(configId);

    // If the deleted config was the currently selected one, clear the selection
    if (selectedConfigId.value === configId) {
      selectedConfigId.value = null;
      selectedConfig.value = null;
    }

    // Refresh the list to show the item has been removed
    await refreshConfigs();

  } catch (error) {
    // Use the native error dialog
    await ShowErrorDialog('Deletion Failed', `Failed to delete configuration: ${error}`);
  }
}

// 在模态框中测试连接
async function handleTestConnectionInModal() {
  testResult.value = { status: 'testing', message: 'Connecting...' };
  try {
    const result = await TestConnection(form);
    testResult.value = { status: 'success', message: result };
  } catch (error) {
    testResult.value = { status: 'error', message: error.toString() };
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
    await ShowErrorDialog('Error', `Failed to ${isActive ? 'start' : 'stop'} watching: ` + error);
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
          @delete-config="handleDeleteConfig"
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
          @log-event="(logEntry) => {
            console.log('FileSyncer: Caught log-event, re-emitting.', logEntry);
            $emit('log-event', logEntry);
          }"
      />
      <div v-else class="flex items-center justify-center h-full text-gray-500">
        <p>Select or create a configuration to get started.</p>
      </div>
    </div>


    <Dialog :open="isModalOpen" @update:open="isModalOpen = $event">
      <DialogContent class="sm:max-w-[625px] grid-rows-[auto,1fr,auto]">
        <DialogHeader>
          <DialogTitle>{{ editingConfigId ? 'Edit Configuration' : 'Create New Configuration' }}</DialogTitle>
          <DialogDescription>
            Provide the details for your SSH connection. Click save when you're done.
          </DialogDescription>
        </DialogHeader>

        <div class="grid gap-4 py-4">
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="name" class="text-right">Name</Label>
            <Input id="name" v-model="form.name" placeholder="E.g., Production Server" class="col-span-3" />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="host" class="text-right">Host & Port</Label>
            <div class="col-span-3 grid grid-cols-3 gap-2">
              <Input id="host" v-model="form.host" class="col-span-2" placeholder="192.168.1.1" />
              <Input type="number" v-model.number="form.port" placeholder="22"/>
            </div>
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="user" class="text-right">User</Label>
            <Input id="user" v-model="form.user" class="col-span-3" placeholder="root" />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label class="text-right">Auth Method</Label>
            <RadioGroup v-model="form.authMethod" default-value="password" class="col-span-3 flex items-center space-x-4">
              <div class="flex items-center space-x-2">
                <RadioGroupItem id="r-password" value="password" />
                <Label for="r-password">Password</Label>
              </div>
              <div class="flex items-center space-x-2">
                <RadioGroupItem id="r-key" value="key" />
                <Label for="r-key">Key File</Label>
              </div>
            </RadioGroup>
          </div>
          <div v-if="form.authMethod === 'password'" class="grid grid-cols-4 items-center gap-4">
            <Label for="password" class="text-right">Password</Label>
            <Input id="password" v-model="form.password" type="password" class="col-span-3" />
          </div>
          <div v-if="form.authMethod === 'key'" class="grid grid-cols-4 items-center gap-4">
            <Label for="key" class="text-right">Key Path</Label>
            <div class="col-span-3 flex items-center">
              <Input id="key" v-model="form.keyPath" readonly placeholder="Click Browse..." />
              <Button @click="selectKeyFileForForm" type="button" variant="outline" class="ml-2">Browse</Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <p v-if="testResult.message" class="text-sm mr-auto" :class="{
            'text-green-600': testResult.status === 'success',
            'text-red-600': testResult.status === 'error'
          }">{{ testResult.message }}</p>
          <Button @click="handleTestConnectionInModal" type="button" variant="outline">Test Connection</Button>
          <Button @click="handleSaveConfig" type="button">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
