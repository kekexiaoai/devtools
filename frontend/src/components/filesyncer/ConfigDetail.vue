<script setup>
import { ref, reactive } from 'vue';
import { SaveConfig, TestConnection } from '../../../wailsjs/go/main/App';

const props = defineProps(['config']);
const emit = defineEmits(['config-updated']);

// 使用 reactive 来方便地双向绑定表单
const form = reactive({ ...props.config });
const testStatus = ref(''); // "testing", "success", "error"
const testMessage = ref('');

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
      <h2 class="text-xl font-bold mb-4">Sync Directories</h2>
    </div>

    <div class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
      <h2 class="text-xl font-bold mb-4">Clipboard to Remote File</h2>
    </div>
  </div>
</template>