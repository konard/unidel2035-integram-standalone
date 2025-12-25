<template>
  <Dialog
    :visible="visible"
    modal
    :header="dialogTitle"
    :style="{ width: '90vw', height: '90vh' }"
    :contentStyle="{ padding: '0', display: 'flex', flexDirection: 'column', height: '100%' }"
  >
    <div class="execution-window">
      <!-- Code tabs -->
      <TabView v-model:activeIndex="activeTabIndex" class="execution-tabs">
        <TabPanel v-for="(exec, index) in executions" :key="exec.id" :header="exec.title">
          <div class="execution-panel">
            <!-- Code display -->
            <div class="code-section">
              <div class="section-header">
                <span class="section-title">Код ({{ exec.language }})</span>
                <div class="section-actions">
                  <Button
                    icon="pi pi-copy"
                    class="p-button-text p-button-sm"
                    @click="copyCode(exec.code)"
                    title="Копировать код"
                  />
                  <Button
                    v-if="!exec.executed"
                    icon="pi pi-play"
                    class="p-button-text p-button-sm"
                    @click="executeCode(exec)"
                    :loading="exec.executing"
                    title="Выполнить код"
                  />
                  <Button
                    v-if="exec.executed && canRerun(exec)"
                    icon="pi pi-refresh"
                    class="p-button-text p-button-sm"
                    @click="rerunCode(exec)"
                    :loading="exec.executing"
                    title="Выполнить повторно"
                  />
                </div>
              </div>
              <pre class="code-block"><code>{{ exec.code }}</code></pre>
            </div>

            <!-- Dependencies -->
            <div v-if="exec.dependencies && exec.dependencies.length > 0" class="dependencies-section">
              <div class="section-header">
                <span class="section-title">Зависимости</span>
                <Button
                  v-if="!exec.dependenciesInstalled"
                  icon="pi pi-download"
                  label="Установить"
                  class="p-button-sm"
                  @click="installDependencies(exec)"
                  :loading="exec.installingDeps"
                />
                <span v-else class="installed-badge">
                  <i class="pi pi-check-circle" /> Установлены
                </span>
              </div>
              <div class="dependencies-list">
                <Tag v-for="dep in exec.dependencies" :key="dep" :value="dep" class="dep-tag" />
              </div>
            </div>

            <!-- Output -->
            <div v-if="exec.executed" class="output-section">
              <div class="section-header">
                <span class="section-title">Результат выполнения</span>
                <div class="section-actions">
                  <Button
                    icon="pi pi-copy"
                    class="p-button-text p-button-sm"
                    @click="copyOutput(exec.output || exec.error)"
                    title="Копировать вывод"
                  />
                  <Button
                    v-if="exec.execId"
                    icon="pi pi-trash"
                    class="p-button-text p-button-sm p-button-danger"
                    @click="cleanupExecution(exec)"
                    title="Очистить песочницу"
                  />
                </div>
              </div>

              <!-- Success output -->
              <div v-if="exec.exitCode === 0 && exec.output" class="output-success">
                <pre>{{ exec.output }}</pre>
              </div>

              <!-- Error output -->
              <div v-if="exec.error" class="output-error">
                <div class="error-header">
                  <i class="pi pi-exclamation-triangle" />
                  <span>Ошибка выполнения (Exit code: {{ exec.exitCode }})</span>
                </div>
                <pre>{{ exec.error }}</pre>
              </div>

              <!-- HTML/CSS Preview -->
              <div v-if="isPreviewable(exec)" class="preview-section">
                <div class="section-header">
                  <span class="section-title">Превью</span>
                  <Button
                    icon="pi pi-external-link"
                    class="p-button-text p-button-sm"
                    @click="openPreviewInNewWindow(exec)"
                    title="Открыть в новом окне"
                  />
                </div>
                <iframe
                  :srcdoc="getPreviewContent(exec)"
                  class="preview-frame"
                  sandbox="allow-scripts"
                />
              </div>
            </div>

            <!-- Execution info -->
            <div v-if="exec.executed" class="execution-info">
              <small>
                Выполнено: {{ formatDate(exec.executedAt) }}
                <span v-if="exec.execId"> | Sandbox ID: {{ exec.execId }}</span>
              </small>
            </div>
          </div>
        </TabPanel>
      </TabView>
    </div>
  </Dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import {
  executeCode as executeCodeAPI,
  installDependencies as installDepsAPI,
  cleanupSandbox,
} from '@/services/chatAgentService';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  executions: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['update:modelValue', 'execution-complete', 'execution-error']);

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const activeTabIndex = ref(0);

const dialogTitle = computed(() => {
  const count = props.executions.length;
  return count > 0 ? `Выполнение кода (${count})` : 'Выполнение кода';
});

/**
 * Execute code
 */
async function executeCode(exec) {
  exec.executing = true;
  exec.error = null;
  exec.output = null;

  try {
    const result = await executeCodeAPI(exec.code, exec.language, exec.filename);

    if (result.success) {
      exec.execId = result.data.execId;
      exec.output = result.data.output;
      exec.exitCode = result.data.exitCode;
      exec.executed = true;
      exec.executedAt = new Date();

      emit('execution-complete', exec);
    } else {
      exec.error = result.data.error;
      exec.exitCode = result.data.exitCode || 1;
      exec.executed = true;
      exec.executedAt = new Date();

      emit('execution-error', exec);
    }
  } catch (error) {
    exec.error = error.message;
    exec.exitCode = 1;
    exec.executed = true;
    exec.executedAt = new Date();

    emit('execution-error', exec);
  } finally {
    exec.executing = false;
  }
}

/**
 * Rerun code execution
 */
async function rerunCode(exec) {
  exec.executed = false;
  exec.output = null;
  exec.error = null;
  exec.exitCode = null;
  exec.executedAt = null;

  await executeCode(exec);
}

/**
 * Install dependencies
 */
async function installDependencies(exec) {
  exec.installingDeps = true;

  try {
    const result = await installDepsAPI(exec.dependencies, exec.language);

    if (result.success) {
      exec.dependenciesInstalled = true;
      exec.depsOutput = result.data.output;
    } else {
      exec.depsError = result.data.error;
      alert('Ошибка установки зависимостей:\n' + result.data.error);
    }
  } catch (error) {
    exec.depsError = error.message;
    alert('Ошибка установки зависимостей:\n' + error.message);
  } finally {
    exec.installingDeps = false;
  }
}

/**
 * Cleanup execution sandbox
 */
async function cleanupExecution(exec) {
  if (!exec.execId) return;

  try {
    await cleanupSandbox(exec.execId);
    exec.execId = null;
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

/**
 * Check if execution can be rerun
 */
function canRerun(exec) {
  return ['javascript', 'python', 'bash'].includes(exec.language);
}

/**
 * Check if execution result is previewable
 */
function isPreviewable(exec) {
  return ['html', 'css'].includes(exec.language) && exec.exitCode === 0;
}

/**
 * Get preview content for HTML/CSS
 */
function getPreviewContent(exec) {
  if (exec.language === 'html') {
    return exec.code;
  } else if (exec.language === 'css') {
    return `<!DOCTYPE html>
<html>
<head>
  <style>${exec.code}</style>
</head>
<body>
  <div class="preview-container">
    <h1>CSS Preview</h1>
    <p>This is a preview of your CSS styles.</p>
  </div>
</body>
</html>`;
  }
  return '';
}

/**
 * Open preview in new window
 */
function openPreviewInNewWindow(exec) {
  const newWindow = window.open('', '_blank', 'width=800,height=600');
  if (newWindow) {
    newWindow.document.write(getPreviewContent(exec));
    newWindow.document.close();
  }
}

/**
 * Copy code to clipboard
 */
async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code);
  } catch (err) {
    const textArea = document.createElement('textarea');
    textArea.value = code;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }
}

/**
 * Copy output to clipboard
 */
async function copyOutput(output) {
  await copyCode(output);
}

/**
 * Format date
 */
function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleString('ru-RU');
}
</script>

<style scoped lang="scss">
.execution-window {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.execution-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;

  :deep(.p-tabview-panels) {
    flex: 1;
    overflow-y: auto;
  }
}

.execution-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background: var(--surface-ground);
  border-radius: 4px;
  margin-bottom: 0.5rem;

  .section-title {
    font-weight: 600;
    font-size: 0.9rem;
  }

  .section-actions {
    display: flex;
    gap: 0.25rem;
  }
}

.code-section {
  .code-block {
    background: var(--surface-card);
    border: 1px solid var(--surface-border);
    border-radius: 4px;
    padding: 1rem;
    overflow-x: auto;
    font-family: 'Courier New', monospace;
    font-size: 0.875rem;
    margin: 0;
  }
}

.dependencies-section {
  .dependencies-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .dep-tag {
    background: var(--primary-color);
    color: white;
  }

  .installed-badge {
    color: var(--green-500);
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
}

.output-section {
  .output-success {
    background: var(--surface-card);
    border: 1px solid var(--green-500);
    border-radius: 4px;
    padding: 1rem;

    pre {
      margin: 0;
      font-family: 'Courier New', monospace;
      font-size: 0.875rem;
      white-space: pre-wrap;
      word-break: break-all;
    }
  }

  .output-error {
    background: rgba(255, 68, 68, 0.1);
    border: 1px solid var(--red-500);
    border-radius: 4px;
    padding: 1rem;

    .error-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--red-500);
      font-weight: 600;
      margin-bottom: 0.5rem;
    }

    pre {
      margin: 0;
      font-family: 'Courier New', monospace;
      font-size: 0.875rem;
      white-space: pre-wrap;
      word-break: break-all;
      color: var(--red-600);
    }
  }
}

.preview-section {
  .preview-frame {
    width: 100%;
    height: 400px;
    border: 1px solid var(--surface-border);
    border-radius: 4px;
    background: white;
  }
}

.execution-info {
  padding: 0.5rem;
  background: var(--surface-ground);
  border-radius: 4px;
  font-size: 0.875rem;
  opacity: 0.8;
}
</style>
