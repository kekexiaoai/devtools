<script setup>
import Modal from '../Modal.vue';
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from 'vue';
import { InformationCircleIcon, XCircleIcon } from '@heroicons/vue/24/solid';

const props = defineProps({
  show: Boolean,
  title: String,
  message: String,
  type: { type: String, default: 'info' }
});
const emit = defineEmits(['close']);

const iconComponent = computed(() => props.type === 'error' ? XCircleIcon : InformationCircleIcon);
const titleColor = computed(() => props.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400');

const okButton = ref(null); // 创建一个 ref 来引用按钮

// 键盘事件处理器
const handleKeydown = (e) => {
  if (props.show) {
    if (e.key === 'Escape') {
      emit('close');
    }
    if (e.key === 'Enter') {
      e.preventDefault(); // 防止触发表单提交等其他行为
      emit('close');
    }
  }
};

// 在组件挂载时添加全局键盘事件监听
onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

// 在组件卸载时移除监听，防止内存泄漏
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});

// 当模态框显示时，自动聚焦到 OK 按钮
watch(() => props.show, (newVal) => {
  if (newVal) {
    // 使用 nextTick 确保按钮已经渲染到 DOM 上
    nextTick(() => {
      okButton.value?.focus();
    });
  }
});

</script>

<template>
  <Modal :show="show" @close="emit('close')" size="standard">
    <template #header>
      <h3 class="text-lg font-medium" :class="titleColor">{{ props.title }}</h3>
    </template>

    <div class="mt-2 flex items-start space-x-4">
      <div class="flex-shrink-0">
        <component :is="iconComponent" class="h-8 w-8" :class="titleColor" />
      </div>
      <p class="flex-1 pt-1 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
        {{ props.message }}
      </p>
    </div>

    <template #footer>
      <div class="w-full flex justify-end">
        <button ref="okButton" @click="emit('close')" class="btn btn-primary">OK</button>
      </div>
    </template>
  </Modal>
</template>