<template>
  <div class="password-field">
    <div class="flex gap-2">
      <Password
        :id="id"
        :modelValue="modelValue"
        @update:modelValue="emit('update:modelValue', $event)"
        toggleMask
        :feedback="false"
        class="flex-1"
      />
      <Button
        v-if="showGenerator"
        icon="pi pi-refresh"
        @click="emit('generate')"
        size="small"
        outlined
        rounded
        title="Сгенерировать пароль"
      />
      <Button
        v-if="showGenerator"
        icon="pi pi-envelope"
        @click="emit('copy-invite')"
        size="small"
        outlined
        rounded
        title="Скопировать приглашение"
      />
    </div>
  </div>
</template>

<script setup>

defineProps({
  id: String,
  modelValue: String,
  showGenerator: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'generate', 'copy-invite'])
</script>
