<script setup>
import { ref, onMounted, watch, reactive } from 'vue'
import { TrashIcon } from '@heroicons/vue/24/outline'
import {
  GetSyncPairs,
  SaveSyncPair,
  DeleteSyncPair,
  SelectDirectory,
  ShowConfirmDialog,
} from '../../../wailsjs/go/main/App'

const props = defineProps(['config', 'isWatching'])
const emit = defineEmits(['toggle-watcher'])

const syncPairs = ref([])
const showAddForm = ref(false)
const newPair = reactive({ localPath: '', remotePath: '' })

async function fetchSyncPairs() {
  if (!props.config?.id) return
  syncPairs.value = await GetSyncPairs(props.config.id)
}

onMounted(fetchSyncPairs)
watch(() => props.config.id, fetchSyncPairs)

async function handleBrowseLocalDirectory() {
  const dirPath = await SelectDirectory('Select Local Directory')
  if (dirPath) newPair.localPath = dirPath
}

async function handleSaveNewPair() {
  if (!newPair.localPath || !newPair.remotePath) return
  await SaveSyncPair({ configId: props.config.id, ...newPair, syncDeletes: true })
  await fetchSyncPairs()
  newPair.localPath = ''
  newPair.remotePath = ''
  showAddForm.value = false
}

async function handleDeletePair(pairId) {
  const choice = await ShowConfirmDialog(
    'Confirm Deletion',
    'Are you sure you want to delete this sync pair?'
  )
  if (choice !== 'Yes') return

  await DeleteSyncPair(pairId)
  await fetchSyncPairs()
}
</script>

<template>
  <div class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-bold">Sync Directories</h2>
      <div class="flex items-center space-x-4">
        <div class="flex items-center space-x-2">
          <span
            class="text-sm font-medium"
            :class="isWatching ? 'text-green-500' : 'text-gray-500'"
            >{{ isWatching ? 'Active' : 'Paused' }}</span
          >
          <button
            @click="emit('toggle-watcher', config.id, !isWatching)"
            class="relative inline-flex items-center h-6 rounded-full w-11 transition-colors"
            :class="isWatching ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'"
          >
            <span
              class="inline-block w-4 h-4 transform bg-white rounded-full transition-transform"
              :class="isWatching ? 'translate-x-6' : 'translate-x-1'"
            />
          </button>
        </div>
        <button
          @click="showAddForm = !showAddForm"
          class="bg-blue-600 text-white py-1 px-3 rounded-md hover:bg-blue-700 text-sm"
        >
          + Add Sync Pair
        </button>
      </div>
    </div>
    <div v-if="showAddForm" class="p-4 mb-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg space-y-3">
      <div>
        <label class="block text-sm font-medium mb-1">Local Path</label>
        <div class="flex">
          <input
            v-model="newPair.localPath"
            type="text"
            readonly
            placeholder="Click Browse to select"
            class="w-full p-2 bg-gray-200 dark:bg-gray-700 rounded-l-md"
          />
          <button
            @click="handleBrowseLocalDirectory"
            class="px-3 py-2 bg-gray-300 dark:bg-gray-600 rounded-r-md text-sm"
          >
            Browse
          </button>
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Remote Path</label>
        <input
          v-model="newPair.remotePath"
          type="text"
          placeholder="/var/www/my-project"
          class="w-full p-2 bg-gray-100 dark:bg-gray-700 rounded-md"
        />
      </div>
      <div class="flex justify-end space-x-2">
        <button
          @click="showAddForm = false"
          class="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-600 rounded-md"
        >
          Cancel
        </button>
        <button
          @click="handleSaveNewPair"
          class="px-3 py-1 text-sm bg-green-600 text-white rounded-md"
        >
          Save Pair
        </button>
      </div>
    </div>
    <div class="space-y-2">
      <div v-if="syncPairs.length === 0" class="text-center text-gray-500 py-4">
        No sync pairs configured.
      </div>
      <div
        v-for="pair in syncPairs"
        :key="pair.id"
        class="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700/50 rounded-md"
      >
        <div class="font-mono text-sm">
          <p class="text-blue-600 dark:text-blue-400">{{ pair.localPath }}</p>
          <p class="text-gray-500">➔ {{ pair.remotePath }}</p>
        </div>
        <button
          @click="handleDeletePair(pair.id)"
          class="p-1 text-gray-400 hover:text-red-500 rounded-full"
        >
          <TrashIcon class="h-5 w-5" />
        </button>
      </div>
    </div>
  </div>
</template>