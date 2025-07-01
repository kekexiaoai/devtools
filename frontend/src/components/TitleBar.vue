<script setup>
import { WindowMinimise, WindowToggleMaximise, Quit } from '../../wailsjs/runtime/runtime';
</script>
<template>
  <div style="-wails-draggable: drag;" class="w-full h-8 bg-gray-200 dark:bg-gray-700 flex justify-between items-center px-2 select-none">

    <div class="text-sm font-semibold">DevTools</div>

    <div style="-wails-draggable: no-drag;" class="flex space-x-2">
      <button @click="WindowMinimise" class="h-4 w-4 bg-yellow-400 rounded-full hover:bg-yellow-500"></button>
      <button @click="WindowToggleMaximise" class="h-4 w-4 bg-green-400 rounded-full hover:bg-green-500"></button>
      <button @click="Quit" class="h-4 w-4 bg-red-500 rounded-full hover:bg-red-600"></button>
    </div>

  </div>
</template>