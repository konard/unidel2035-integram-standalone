<template>
  <div class="card layout-chat layout-menu chat-component" :style="{ width: chatWidth + 'px' }">
    <div class="resize-handle" @mousedown="startResize"></div>
    <div class="tabview-container">
      <div class="expand-button-container">
        <Button icon="pi pi-plus-circle" @click="createNewChatSession" class="p-button-text p-button-success"
                title="Новый чат" data-testid="new-chat-button" data-action="new-chat" aria-label="Создать новый чат" />
        <Button icon="pi pi-history" @click="showHistory = true" class="p-button-text" title="История чатов"
                data-testid="history-button" data-action="open-history" aria-label="Открыть историю чатов" />
        <Button icon="pi pi-window-maximize" @click="showModal" class="expand-button p-button-text"
                title="Развернуть чат" data-testid="expand-chat-button" data-action="expand-chat" aria-label="Развернуть чат" />
      </div>

      <TabView v-model:activeIndex="activeTabIndex">
        <TabPanel>
          <template #header>
            <span title="ИИ-ассистент">
              <i class="pi pi-prime" />
            </span>
          </template>

          <div class="chat-container" data-testid="ai-chat-container">
            <AgentStatusIndicator :runningAgents="runningAgents" />
            <div class="messages" ref="aiMessagesContainer" data-testid="messages-container">
              <div v-for="(msg, index) in aiChat.messages" :key="index" class="message"
                :class="{ 'user-message': msg.isUser }" data-testid="message-item" :data-message-id="index">
                <div class="message-content" v-if="!isSystemMessage(msg)">
                  <div v-if="msg.attachments && msg.attachments.length > 0" class="attachment-info">
                    <div v-for="(attachment, attIndex) in msg.attachments" :key="attIndex" class="attachment-item">
                      <img v-if="isImage(attachment)" :src="attachment.url" class="image-preview" 
                           @click="showImagePreview(attachment.url)" />
                      <i v-else :class="getAttachmentIcon(attachment)" class="attachment-icon" />
                      <span class="attachment-name">{{ getAttachmentDisplayName(attachment) }}</span>
                      <span v-if="attachment.source === 'file'" class="file-size">({{ formatFileSize(attachment.size) }})</span>
                      <Button v-if="attachment.source === 'file'" icon="pi pi-download" class="p-button-text p-button-sm download-btn"
                        @click="downloadAttachment(attachment)" />
                    </div>
                  </div>
                  
                  <div class="message-text">
                    <MarkdownRender :content="msg.text" />
                    <span v-if="aiLoading && msg === assistantMessage" class="streaming-cursor"></span>
                  </div>
                  <div class="message-actions">
                    <div class="message-time">{{ msg.time }}</div>
                    <div class="action-buttons">
                      <Button v-if="!msg.isUser && isEditorPage" icon="pi pi-arrow-left" title="Перенести в редактор"
                        class="transfer-button p-button-text p-button-sm" @click="transferToEditor(msg.text)"
                        data-testid="transfer-to-editor-button" aria-label="Перенести в редактор" />
                      <Button v-if="!msg.isUser" icon="pi pi-copy" title="Скопировать"
                        class="copy-button p-button-text p-button-sm" @click="copyToClipboard(msg.text)"
                        data-testid="copy-message-button" aria-label="Скопировать сообщение" />
                      <Button icon="pi pi-refresh" title="Отправить снова"
                        class="resend-button p-button-text p-button-sm" @click="resendMessage(index)"
                        data-testid="resend-message-button" aria-label="Отправить сообщение снова" />
                      <Button v-if="msg.isUser" icon="pi pi-pencil" title="Редактировать"
                        class="edit-button p-button-text p-button-sm" @click="editMessage(index)"
                        data-testid="edit-message-button" aria-label="Редактировать сообщение" />
                      <Button v-if="msg.isUser" icon="pi pi-trash" title="Удалить"
                        class="delete-button p-button-text p-button-sm p-button-danger" @click="deleteMessage(index)"
                        data-testid="delete-message-button" aria-label="Удалить сообщение" />
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="aiLoading && !assistantMessage" class="loading-indicator">
                <ProgressSpinner style="width: 30px; height: 30px" />
              </div>

              <div v-if="aiError" class="error-message">
                {{ aiError }}
              </div>
            </div>

            <div class="input-container">
              <InputText ref="aiMessageInputRef" v-model="aiMessage" placeholder="Задайте вопрос ИИ..." @keyup.enter="handleSendAiMessage"
                class="input-field" :disabled="aiLoading" data-testid="message-input" aria-label="Поле ввода сообщения" />

            </div>
            <div class="input-actions">
              <Button icon="pi pi-microphone" @click="toggleVoiceInput"
                      :class="['p-button-text', 'voice-btn', { 'recording': isRecording }]"
                      title="Голосовой ввод" data-testid="voice-input-button" aria-label="Голосовой ввод" />

              <!-- Model Selector Button with OverlayPanel -->
              <Button
                @click.stop.prevent="toggleModelPanel"
                class="p-button-text model-selector-btn-bottom"
                v-tooltip.top="currentModelDisplayName || 'Выбрать модель'"
              >
                <i class="pi pi-sparkles"></i>
              </Button>
              <ModelSelectorPopover
                ref="modelPanel"
                v-model="selectedModel"
                :access-token="userAccessToken"
                @model-change="handleModelChange"
                @settings-change="handleSettingsChange"
                @show-agents="showAgentsList = true"
                @show-settings="showSettings = true"
              />

              <input type="file" ref="fileInput" style="display: none" @change="handleFileUpload"
                     accept=".txt,.pdf,.doc,.docx,.xls,.xlsx,.json,.csv,image/*" multiple data-testid="file-input" />

              <span style="margin-left: auto; display: flex; gap: 0.25rem;">
                              <Button icon="pi pi-paperclip" @click="attachmentMenu.toggle($event)" class="p-button-text attachment-btn" title="Прикрепить файл"
                              data-testid="attach-file-button" aria-label="Прикрепить файл" />
              <Popover ref="attachmentMenu">
                <div class="attachment-menu">
                  <Button label="С устройства" icon="pi pi-upload" @click="triggerFileUpload(); attachmentMenu.hide()" class="p-button-text w-full justify-start"
                          data-testid="upload-from-device-button" />
                  <Button label="Таблицы/отчёты" icon="pi pi-database" @click="showDataSelector = true; attachmentMenu.hide()" class="p-button-text w-full justify-start"
                          data-testid="attach-data-button" />
                </div>
              </Popover><Button icon="pi pi-send" @click="handleSendAiMessage" severity="help" :disabled="aiLoading" class="send-btn" title="Отправить сообщение"
                                data-testid="send-message-button" aria-label="Отправить сообщение"/></span></div>
            <div v-if="uploadProgress > 0" class="upload-progress">
              <ProgressBar :value="uploadProgress" :showValue="false" />
              <span>Загрузка: {{ uploadProgress }}%</span>
            </div>
            
            <div v-if="currentAttachments.length > 0" class="current-attachments">
              <div v-for="(attachment, index) in currentAttachments" :key="index" class="current-attachment">
                <div class="attachment-info current">
                  <img v-if="isImage(attachment)" :src="attachment.url" class="image-preview-small" />
                  <i v-else :class="getAttachmentIcon(attachment)" class="attachment-icon" />
                  <span class="attachment-name">{{ getAttachmentDisplayName(attachment) }}</span>
                  <span v-if="attachment.source === 'file'" class="file-size">({{ formatFileSize(attachment.size) }})</span>
                  <Button icon="pi pi-times" class="p-button-text p-button-sm p-button-danger remove-btn"
                    @click="removeCurrentAttachment(index)" />
                </div>
              </div>
            </div>
          </div>
        </TabPanel>

        <TabPanel title="Общий чат">
          <template #header>
            <span title="Общий чат">
              <i class="pi pi-users" />
            </span>
          </template>
          <div class="chat-container">
            <div class="messages" ref="messagesContainer">
              <div v-for="(msg, index) in activeChat.messages" :key="index" class="message"
                :class="{ 'user-message': msg.isUser }">
                <Avatar v-if="!msg.isUser" icon="pi pi-user" shape="circle" />
                <div class="message-content">
                  <div v-if="msg.attachment || (msg.attachments && msg.attachments.length > 0)" class="attachment-info">
                    <template v-if="msg.attachment">
                      <img v-if="isImage(msg.attachment)" :src="msg.attachment.url" class="image-preview" 
                           @click="showImagePreview(msg.attachment.url)" />
                      <i v-else :class="getAttachmentIcon(msg.attachment)" class="attachment-icon" />
                      <span class="attachment-name">{{ getAttachmentDisplayName(msg.attachment) }}</span>
                      <span v-if="msg.attachment.source === 'file'" class="file-size">({{ formatFileSize(msg.attachment.size) }})</span>
                      <Button v-if="msg.attachment.source === 'file'" icon="pi pi-download" class="p-button-text p-button-sm download-btn"
                        @click="downloadAttachment(msg.attachment)" />
                    </template>
                    <template v-else-if="msg.attachments && msg.attachments.length > 0">
                      <div v-for="(attachment, attIndex) in msg.attachments" :key="attIndex" class="attachment-item">
                        <img v-if="isImage(attachment)" :src="attachment.url" class="image-preview" 
                             @click="showImagePreview(attachment.url)" />
                        <i v-else :class="getAttachmentIcon(attachment)" class="attachment-icon" />
                        <span class="attachment-name">{{ getAttachmentDisplayName(attachment) }}</span>
                        <span v-if="attachment.source === 'file'" class="file-size">({{ formatFileSize(attachment.size) }})</span>
                        <Button v-if="attachment.source === 'file'" icon="pi pi-download" class="p-button-text p-button-sm download-btn"
                          @click="downloadAttachment(attachment)" />
                      </div>
                    </template>
                  </div>
                  
                  <div class="message-text">{{ msg.text }}</div>
                  <div class="message-time">{{ msg.time }}</div>
                </div>
                <Avatar v-if="msg.isUser" icon="pi pi-user" shape="circle" />
              </div>

              <!-- Typing indicator -->
              <div v-if="typingIndicator" class="typing-indicator">
                <small class="text-muted">{{ typingIndicator }}</small>
              </div>
            </div>
            <div class="input-container">
              <InputText ref="generalMessageInputRef" v-model="newMessage" placeholder="Напишите ваше сообщение..."
                @keyup.enter="handleSendMessage" @input="handleTyping"
                class="input-field" />
              <input type="file" ref="fileInputGeneral" style="display: none" @change="handleFileUploadGeneral"
                     accept="*" multiple />
              <Button icon="pi pi-paperclip" @click="attachmentMenuGeneral.toggle($event)" class="p-button-text attachment-btn" title="Прикрепить файл" />
              <Popover ref="attachmentMenuGeneral">
                <div class="attachment-menu">
                  <Button label="С устройства" icon="pi pi-upload" @click="triggerFileUploadGeneral(); attachmentMenuGeneral.hide()" class="p-button-text w-full justify-start" />
                  <Button label="Таблицы/отчёты" icon="pi pi-database" @click="showDataSelector = true; attachmentMenuGeneral.hide()" class="p-button-text w-full justify-start" />
                </div>
              </Popover>
              <Button icon="pi pi-send" @click="handleSendMessage" severity="info" class="send-btn" title="Отправить сообщение"/>
            </div>
          </div>
        </TabPanel>
      </TabView>
    </div>

    <Dialog v-model:visible="isModalVisible" modal :closable="true"
      :style="{ width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh' }" :contentStyle="{
        padding: '0',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }" :modal="true" @hide="hideModal" :dismissableMask="false">
      <template #header>
        <div class="flex align-items-center gap-2"><span class="font-bold white-space-nowrap">
          <i :class="activeTabIndex === 0 ? 'pi pi-prime' : 'pi pi-users'" />
            {{ activeTabIndex === 0 ? 'ИИ-ассистент' : 'Общий чат' }}
          <Button icon="pi pi-trash" @click="clearCurrentChat" class="p-button-text p-button-danger ml-auto"
                  title="Очистить чат" />
          <Button icon="pi pi-times" @click="hideModal" class="p-button-text p-button-sm"
                  title="Закрыть окно чата" style="margin-left: 0.5rem;" /></span>
        </div>
      </template>

      <div class="modal-chat-container">
        <div class="modal-messages" ref="modalMessagesContainer">
          <div v-for="(msg, index) in activeTabIndex === 0
            ? aiChat.messages
            : activeChat.messages" :key="index" class="modal-message" :class="{ 'modal-user-message': msg.isUser }">
            <Avatar v-if="!msg.isUser" :icon="activeTabIndex === 0 ? 'pi pi-prime' : 'pi pi-user'" shape="circle"
              size="normal" class="mr-2" />
            <div class="modal-message-content" v-if="!isSystemMessage(msg)">
              <div v-if="msg.attachment || (msg.attachments && msg.attachments.length > 0)" class="modal-attachment-info">
                <template v-if="msg.attachment">
                  <img v-if="isImage(msg.attachment)" :src="msg.attachment.url" class="image-preview" 
                       @click="showImagePreview(msg.attachment.url)" />
                  <i v-else :class="getAttachmentIcon(msg.attachment)" class="attachment-icon" />
                  <span class="attachment-name">{{ getAttachmentDisplayName(msg.attachment) }}</span>
                  <span v-if="msg.attachment.source === 'file'" class="file-size">({{ formatFileSize(msg.attachment.size) }})</span>
                  <Button v-if="msg.attachment.source === 'file'" icon="pi pi-download" class="p-button-text p-button-sm download-btn"
                    @click="downloadAttachment(msg.attachment)" />
                </template>
                <template v-else-if="msg.attachments && msg.attachments.length > 0">
                  <div v-for="(attachment, attIndex) in msg.attachments" :key="attIndex" class="attachment-item">
                    <img v-if="isImage(attachment)" :src="attachment.url" class="image-preview" 
                         @click="showImagePreview(attachment.url)" />
                    <i v-else :class="getAttachmentIcon(attachment)" class="attachment-icon" />
                    <span class="attachment-name">{{ getAttachmentDisplayName(attachment) }}</span>
                    <span v-if="attachment.source === 'file'" class="file-size">({{ formatFileSize(attachment.size) }})</span>
                    <Button v-if="attachment.source === 'file'" icon="pi pi-download" class="p-button-text p-button-sm download-btn"
                      @click="downloadAttachment(attachment)" />
                  </div>
                </template>
              </div>
              
              <div class="modal-message-text">
                <MarkdownRender v-if="activeTabIndex === 0" :content="msg.text" />
                <template v-else>{{ msg.text }}</template>
                <span v-if="
                  aiLoading &&
                  msg === assistantMessage &&
                  activeTabIndex === 0
                " class="streaming-cursor"></span>
              </div>
              <div class="modal-message-actions">
                <div class="modal-message-time">{{ msg.time }}</div>
                <div class="modal-action-buttons">
                  <Button v-if="activeTabIndex === 0 && !msg.isUser" icon="pi pi-copy" title="Скопировать"
                    class="copy-button p-button-text p-button-sm" @click="copyToClipboard(msg.text)" />
                  <Button v-if="activeTabIndex === 0" icon="pi pi-refresh" title="Отправить снова"
                    class="resend-button p-button-text p-button-sm" @click="resendMessage(index)"
                    data-testid="resend-message-button-modal" aria-label="Отправить сообщение снова" />
                  <Button v-if="activeTabIndex === 0 && msg.isUser" icon="pi pi-pencil" title="Редактировать"
                    class="edit-button p-button-text p-button-sm" @click="editMessage(index)"
                    data-testid="edit-message-button-modal" aria-label="Редактировать сообщение" />
                  <Button v-if="activeTabIndex === 0 && msg.isUser" icon="pi pi-trash" title="Удалить"
                    class="delete-button p-button-text p-button-sm p-button-danger" @click="deleteMessage(index)"
                    data-testid="delete-message-button-modal" aria-label="Удалить сообщение" />
                </div>
              </div>
            </div>
            <Avatar v-if="msg.isUser && !isSystemMessage(msg)" icon="pi pi-user" shape="circle" size="normal" class="ml-2" />
          </div>

          <div v-if="aiLoading && !assistantMessage && activeTabIndex === 0" class="modal-loading-indicator">
            <ProgressSpinner style="width: 30px; height: 30px" />
          </div>

          <div v-if="aiError && activeTabIndex === 0" class="modal-error-message">
            {{ aiError }}
          </div>

          <!-- Typing indicator for general chat -->
          <div v-if="typingIndicator && activeTabIndex === 1" class="modal-typing-indicator">
            <small class="text-muted">{{ typingIndicator }}</small>
          </div>
        </div>
        <div class="modal-controls">
          <div class="model-selector-row" v-if="activeTabIndex === 0">
            <ModelSelector
              application="Chat"
              :access-token="userAccessToken"
              :show-header="true"
              :show-token-info="false"
              :show-settings="false"
              @model-change="handleModelChange"
            />
            <Button icon="pi pi-cog" @click="showSettings = true" class="p-button-text settings-btn"
                    title="Настройки модели" />
            <Button icon="pi pi-wrench" @click="showTools = true" class="p-button-text tools-btn"
                    title="Инструменты" />
          </div>

          <div class="workspace-selector-row" v-if="activeTabIndex === 0 && agentMode">
            <label>Workspace:</label>
            <Dropdown v-model="selectedWorkspace" :options="workspaces" optionLabel="name" optionValue="id"
              placeholder="Выберите workspace" class="workspace-dropdown" :filter="true" :loading="loadingWorkspaces">
              <template #value="slotProps">
                <div v-if="slotProps.value" class="workspace-option">
                  <i class="pi pi-folder"></i>
                  <span>{{ getWorkspaceName(slotProps.value) }}</span>
                </div>
                <span v-else>{{ slotProps.placeholder }}</span>
              </template>
              <template #option="slotProps">
                <div class="workspace-option">
                  <i class="pi pi-folder"></i>
                  <span>{{ slotProps.option.name }}</span>
                </div>
              </template>
            </Dropdown>
            <Button icon="pi pi-plus" @click="showCreateWorkspaceDialog = true" class="p-button-text"
                    title="Создать workspace" />
            <Button icon="pi pi-refresh" @click="loadWorkspaces" :loading="loadingWorkspaces" class="p-button-text"
                    title="Обновить список" />
          </div>

          <div class="modal-input-container">
            <Button icon="pi pi-microphone" @click="toggleVoiceInput"
                    :class="['p-button-text', 'voice-btn', { 'recording': isRecording }]"
                    title="Голосовой ввод" />
            <InputText ref="modalAiInputRef" v-if="activeTabIndex === 0" v-model="aiMessage" placeholder="Задайте вопрос ИИ..."
              @keyup.enter="handleSendAiMessage" class="modal-input-field" :disabled="aiLoading" />
            <InputText ref="modalGeneralInputRef" v-else v-model="newMessage" placeholder="Напишите ваше сообщение..."
              @keyup.enter="handleSendMessage" @input="handleTyping"
              class="modal-input-field" />
            <input type="file" ref="modalFileInput" style="display: none" @change="handleModalFileUpload"
                   accept=".txt,.pdf,.doc,.docx,.xls,.xlsx,.json,.csv,image/*" multiple />
            <Button icon="pi pi-paperclip" @click="modalAttachmentMenu.toggle($event)" class="p-button-text attachment-btn" title="Прикрепить файл" />
            <Popover ref="modalAttachmentMenu">
              <div class="attachment-menu">
                <Button label="С устройства" icon="pi pi-upload" @click="triggerModalFileUpload(); modalAttachmentMenu.hide()" class="p-button-text w-full justify-start" />
                <Button label="Таблицы/отчёты" icon="pi pi-database" @click="showDataSelector = true; modalAttachmentMenu.hide()" class="p-button-text w-full justify-start" />
              </div>
            </Popover>
            <Button icon="pi pi-send" @click="activeTabIndex === 0 ? handleSendAiMessage() : handleSendMessage()"
              :severity="activeTabIndex === 0 ? 'help' : 'info'" :disabled="aiLoading && activeTabIndex === 0" class="send-btn" />
          </div>
        </div>
        
        <div v-if="currentAttachments.length > 0 && activeTabIndex === 0" class="current-attachments">
          <div v-for="(attachment, index) in currentAttachments" :key="index" class="current-attachment">
            <div class="modal-attachment-info current">
              <img v-if="isImage(attachment)" :src="attachment.url" class="image-preview-small" />
              <i v-else :class="getAttachmentIcon(attachment)" class="attachment-icon" />
              <span class="attachment-name">{{ getAttachmentDisplayName(attachment) }}</span>
              <span v-if="attachment.source === 'file'" class="file-size">({{ formatFileSize(attachment.size) }})</span>
              <Button icon="pi pi-times" class="p-button-text p-button-sm p-button-danger remove-btn"
                @click="removeCurrentAttachment(index)" />
            </div>
          </div>
        </div>
      </div>
    </Dialog>

    <!-- History Dialog (using ChatHistoryDialog component) -->
    <ChatHistoryDialog
      v-model:visible="showHistory"
      :savedChats="savedChats"
      :canSaveCurrentChat="aiChat.messages.length > 2"
      @quickSave="quickSaveChat"
      @startNewChat="startNewChat"
      @clearAll="clearAllChats"
      @saveWithName="saveCurrentChatWithName"
      @loadChat="loadChat"
      @deleteChat="deleteChat"
    />

    <Dialog v-model:visible="showEditMessageDialog" modal header="Редактировать сообщение" :style="{ width: '500px' }" data-testid="edit-message-dialog">
      <div class="edit-message-dialog">
        <Textarea v-model="editingMessageText" rows="10" class="w-full" autoResize data-testid="edit-message-textarea" aria-label="Текст сообщения" />
      </div>
      <template #footer>
        <Button label="Отмена" icon="pi pi-times" @click="cancelEditMessage" class="p-button-text"
                data-testid="cancel-edit-button" aria-label="Отменить редактирование" />
        <Button label="Сохранить" icon="pi pi-check" @click="saveEditedMessage" severity="success"
                data-testid="save-edit-button" aria-label="Сохранить изменения" />
      </template>
    </Dialog>

    <Dialog v-model:visible="showDataSelector" modal header="Прикрепить данные" :style="{ width: '500px' }">
      <div class="data-selector-dialog">
        <div class="field">
          <label>Тип вложения</label>
          <Dropdown v-model="selectedDataType" :options="dataTypes" optionLabel="label"
            placeholder="Выберите тип вложения" class="w-full" />
        </div>

        <div class="field" v-if="selectedDataType">
          <label>{{ selectedDataType.label }}</label>
          <Dropdown v-model="selectedDataItem" :options="dataItems"
            :optionLabel="item => item.name || item.value || item.id" placeholder="Выберите элемент" class="w-full"
            :loading="loadingDataItems" />
        </div>

        <div class="field" v-if="selectedDataItem">
          <label>Комментарий к данным</label>
          <InputText v-model="dataComment" placeholder="Добавьте комментарий..." class="w-full" />
        </div>
      </div>

      <template #footer>
        <Button label="Отмена" icon="pi pi-times" @click="showDataSelector = false" class="p-button-text" />
        <Button label="Прикрепить" icon="pi pi-paperclip" @click="attachData" :disabled="!selectedDataItem"
          severity="success" />
      </template>
    </Dialog>

    <Dialog v-model:visible="showImageDialog" modal header="Просмотр изображения" :style="{ width: 'auto' }">
      <img :src="currentImage" class="preview-image" />
    </Dialog>

    <!-- Settings Dialog -->
    <Dialog v-model:visible="showSettings" modal header="Настройки модели" :style="{ width: '600px', maxHeight: '80vh' }">
      <div class="settings-dialog">
        <div class="field">
          <label>Context Size (Размер контекста)</label>
          <InputNumber v-model="llmSettings.contextSize" :min="0" :max="32768" :step="512" class="w-full" />
          <small>Размер контекста промпта (0 = загружается из модели). По умолчанию: 8192</small>
        </div>

        <div class="field">
          <label>GPU Layers (Слои GPU)</label>
          <InputNumber v-model="llmSettings.gpuLayers" :min="-1" :max="200" class="w-full" />
          <small>Количество слоев модели для выгрузки на GPU (-1 для всех слоев, 0 для CPU). По умолчанию: 100</small>
        </div>

        <div class="field">
          <label>Temperature (Температура): {{ llmSettings.temperature }}</label>
          <Slider v-model="llmSettings.temperature" :min="0" :max="2" :step="0.1" class="w-full" />
          <small>Температура для сэмплирования (выше = более случайно). По умолчанию: 0.6</small>
        </div>

        <div class="field">
          <label>Top K: {{ llmSettings.topK }}</label>
          <Slider v-model="llmSettings.topK" :min="0" :max="100" :step="1" class="w-full" />
          <small>Top-K сэмплирование (0 = отключено). По умолчанию: 40</small>
        </div>

        <div class="field">
          <label>Top P: {{ llmSettings.topP }}</label>
          <Slider v-model="llmSettings.topP" :min="0" :max="1" :step="0.05" class="w-full" />
          <small>Top-P сэмплирование (1.0 = отключено). По умолчанию: 0.9</small>
        </div>

        <div class="field">
          <label>Min P: {{ llmSettings.minP }}</label>
          <Slider v-model="llmSettings.minP" :min="0" :max="1" :step="0.05" class="w-full" />
          <small>Min-P сэмплирование (0.0 = отключено). По умолчанию: 0.1</small>
        </div>

        <div class="field">
          <label>Repeat Last N (Повтор последних N)</label>
          <InputNumber v-model="llmSettings.repeatLastN" :min="-1" :max="256" class="w-full" />
          <small>Количество токенов для штрафа за повторение (0 = отключено, -1 = ctx_size). По умолчанию: 64</small>
        </div>

        <div class="field">
          <label>Repeat Penalty (Штраф за повтор): {{ llmSettings.repeatPenalty }}</label>
          <Slider v-model="llmSettings.repeatPenalty" :min="1" :max="2" :step="0.05" class="w-full" />
          <small>Штраф за повторяющиеся последовательности токенов (1.0 = отключено). По умолчанию: 1.0</small>
        </div>

        <div class="field">
          <label>Presence Penalty (Штраф за присутствие): {{ llmSettings.presencePenalty }}</label>
          <Slider v-model="llmSettings.presencePenalty" :min="0" :max="2" :step="0.1" class="w-full" />
          <small>Штраф за присутствие (0.0 = отключено). По умолчанию: 0.0</small>
        </div>

        <div class="field">
          <label>Frequency Penalty (Штраф за частоту): {{ llmSettings.frequencyPenalty }}</label>
          <Slider v-model="llmSettings.frequencyPenalty" :min="0" :max="2" :step="0.1" class="w-full" />
          <small>Штраф за частоту (0.0 = отключено). По умолчанию: 0.0</small>
        </div>

        <div class="field">
          <label>Batch Size (Размер пакета)</label>
          <InputNumber v-model="llmSettings.batchSize" :min="1" :max="2048" :step="128" class="w-full" />
          <small>Логический максимальный размер пакета для обработки промптов. По умолчанию: 512</small>
        </div>

        <div class="field">
          <label>Custom Jinja Chat template (Пользовательский шаблон)</label>
          <Textarea v-model="llmSettings.customTemplate" rows="3" class="w-full"
                    placeholder="{% for message in messages %}...{% endfor %}" />
          <small>Пользовательский Jinja шаблон чата для модели</small>
        </div>

        <div class="field">
          <label>Override Tensor Buffer Type (Переопределение типа буфера тензора)</label>
          <InputText v-model="llmSettings.tensorBufferType" class="w-full"
                     placeholder="layers\.\d+\.ffn_.*=CPU" />
          <small>Переопределить тип буфера тензора для модели</small>
        </div>

        <div class="field">
          <label>Custom System Prompt (Дополнительный системный промпт)</label>
          <Textarea v-model="llmSettings.customSystemPrompt" rows="5" class="w-full"
                    placeholder="Введите дополнительный системный промпт, который будет добавлен к стандартному..." />
          <small>Дополнительные инструкции для ИИ, которые будут добавлены к стандартному системному промпту</small>
        </div>

        <div class="field flex align-items-center gap-2">
          <Checkbox v-model="llmSettings.disableKVOffload" inputId="kvOffload" :binary="true" />
          <label for="kvOffload">Disable KV Offload (Отключить выгрузку KV кэша на GPU)</label>
        </div>
      </div>

      <template #footer>
        <Button label="Закрыть" icon="pi pi-times" @click="showSettings = false" class="p-button-text" />
        <Button label="Сбросить по умолчанию" icon="pi pi-refresh" @click="resetSettings" severity="secondary" />
      </template>
    </Dialog>

    <!-- Tools Dialog -->
    <Dialog v-model:visible="showTools" modal header="Инструменты" :style="{ width: '500px' }">
      <div class="tools-dialog">
        <div class="field flex align-items-center gap-2 agent-mode-toggle">
          <Checkbox v-model="agentMode" inputId="agentMode" :binary="true" />
          <label for="agentMode" class="font-bold">
            🤖 Режим агента (как Claude Code)
          </label>
        </div>

        <Divider />

        <div class="field flex align-items-center gap-2">
          <Checkbox v-model="toolsConfig.mcpEnabled" inputId="mcp" :binary="true" />
          <label for="mcp">MCP (Model Context Protocol)</label>
        </div>

        <div class="field flex align-items-center gap-2">
          <Checkbox v-model="toolsConfig.agentsEnabled" inputId="agents" :binary="true" />
          <label for="agents">Агенты (AI Agents)</label>
        </div>

        <div class="field flex align-items-center gap-2">
          <Checkbox v-model="toolsConfig.searchEnabled" inputId="search" :binary="true" />
          <label for="search">Поиск в интернете (Search)</label>
        </div>

        <div class="field flex align-items-center gap-2">
          <Checkbox v-model="toolsConfig.webBrowsingEnabled" inputId="webBrowsing" :binary="true" />
          <label for="webBrowsing">Веб-браузинг (Web Browsing)</label>
        </div>

        <div class="field flex align-items-center gap-2">
          <Checkbox v-model="toolsConfig.codeInterpreterEnabled" inputId="codeInterpreter" :binary="true" />
          <label for="codeInterpreter">Выполнение кода (Code Execution)</label>
        </div>

        <Divider />

        <div class="field flex align-items-center gap-2">
          <Checkbox v-model="toolsConfig.integramDatabaseEnabled" inputId="integramDatabase" :binary="true" />
          <label for="integramDatabase">🗄️ Integram Database Access</label>
        </div>

        <div v-if="toolsConfig.integrามDatabaseEnabled" class="integram-mcp-status" style="margin-left: 30px; margin-top: 10px;">
          <div v-if="integraMCPState.isAuthenticated" class="flex align-items-center gap-2">
            <i class="pi pi-check-circle success-icon" />
            <span class="status-text">
              Подключено: {{ integraMCPState.username }}@{{ integrामMCPState.database }}
            </span>
            <Button label="Отключить" icon="pi pi-sign-out"
                    @click="handleIntegrامMCPLogout"
                    class="p-button-text p-button-sm p-button-danger" />
          </div>
          <div v-else class="flex align-items-center gap-2">
            <i class="pi pi-times-circle warning-icon" />
            <span class="status-text">Не подключено</span>
            <Button label="Войти" icon="pi pi-sign-in"
                    @click="showIntegrامMCPAuth = true; showTools = false"
                    class="p-button-text p-button-sm" />
          </div>
        </div>

        <div v-if="agentMode" class="agent-info">
          <small>
            <i class="pi pi-info-circle" />
            В режиме агента чат может выполнять поиск, генерировать и запускать код,
            устанавливать зависимости.
          </small>
        </div>
      </div>

      <template #footer>
        <Button label="Закрыть" icon="pi pi-check" @click="showTools = false" severity="success" />
      </template>
    </Dialog>

    <!-- Create Workspace Dialog -->
    <Dialog v-model:visible="showCreateWorkspaceDialog" modal header="Создать Workspace" :style="{ width: '600px' }">
      <div class="create-workspace-dialog">
        <div class="field">
          <label for="workspace-name">Название workspace</label>
          <InputText id="workspace-name" v-model="newWorkspace.name"
                     placeholder="Введите название..." class="w-full" />
        </div>

        <div class="field">
          <label for="workspace-repo">Git Repository URL (опционально)</label>
          <InputText id="workspace-repo" v-model="newWorkspace.repositoryUrl"
                     placeholder="https://github.com/user/repo.git" class="w-full" />
          <small>URL репозитория для клонирования в workspace</small>
        </div>

        <div class="field" v-if="newWorkspace.repositoryUrl">
          <label for="workspace-branch">Ветка (опционально)</label>
          <InputText id="workspace-branch" v-model="newWorkspace.branch"
                     placeholder="main" class="w-full" />
          <small>По умолчанию: main</small>
        </div>

        <div v-if="createWorkspaceError" class="error-message mt-3">
          {{ createWorkspaceError }}
        </div>
      </div>

      <template #footer>
        <Button label="Отмена" icon="pi pi-times" @click="showCreateWorkspaceDialog = false" class="p-button-text" />
        <Button label="Создать" icon="pi pi-plus" @click="handleCreateWorkspace"
                :loading="creatingWorkspace" severity="success" />
      </template>
    </Dialog>

    <!-- Integram MCP Authentication Dialog (Phase 1) -->
    <Dialog v-model:visible="showIntegrامMCPAuth" modal header="🗄️ Integram Database - Вход" :style="{ width: '500px' }">
      <div class="integram-auth-dialog">
        <div class="field">
          <label for="integram-server">Сервер</label>
          <InputText id="integram-server" v-model="integramAuthForm.serverURL"
                     placeholder="${import.meta.env.VITE_INTEGRAM_URL}" class="w-full" />
          <small>URL сервера Integram</small>
        </div>

        <div class="field">
          <label for="integram-database">База данных</label>
          <InputText id="integram-database" v-model="integramAuthForm.database"
                     placeholder="my" class="w-full" />
          <small>Название базы данных (например: my, a2025)</small>
        </div>

        <div class="field">
          <label for="integram-login">Логин</label>
          <InputText id="integram-login" v-model="integrामAuthForm.login"
                     placeholder="Введите логин" class="w-full"
                     @keyup.enter="handleIntegrامMCPAuth" />
        </div>

        <div class="field">
          <label for="integram-password">Пароль</label>
          <Password id="integram-password" v-model="integramAuthForm.password"
                    placeholder="Введите пароль" class="w-full"
                    :feedback="false" toggleMask
                    @keyup.enter="handleIntegrامMCPAuth" />
        </div>

        <div v-if="integramAuthError" class="error-message mt-3">
          <i class="pi pi-exclamation-triangle" />
          {{ integramAuthError }}
        </div>

        <div class="info-message mt-3">
          <small>
            <i class="pi pi-info-circle" />
            После входа AI-ассистент сможет работать с таблицами Integram напрямую,
            без загрузки всех данных в память. Это значительно ускоряет работу с большими базами данных.
          </small>
        </div>
      </div>

      <template #footer>
        <Button label="Отмена" icon="pi pi-times" @click="showIntegrامMCPAuth = false" class="p-button-text" />
        <Button label="Войти" icon="pi pi-sign-in" @click="handleIntegrамMCPAuth"
                :loading="integramAuthLoading" severity="success"
                :disabled="!integramAuthForm.login || !integramAuthForm.password" />
      </template>
    </Dialog>

    <!-- Agents List Dialog -->
    <Dialog v-model:visible="showAgentsList" modal header="Доступные агенты" :style="{ width: '800px' }" data-testid="agents-dialog">
      <AvailableAgentsList :toolsConfig="toolsConfig" />
    </Dialog>

    <!-- Code Execution Window -->
    <CodeExecutionWindow
      v-model="showCodeExecutionWindow"
      :executions="codeExecutions"
      @execution-complete="onExecutionComplete"
      @execution-error="onExecutionError"
    />
  </div>
</template>


<script setup>
import { ref, nextTick, onMounted, onUnmounted, computed } from 'vue'
import { useChatLogic } from '@/composables/useChatLogic'
import OverlayPanel from 'primevue/overlaypanel'

// Import components
import MarkdownRender from '@/components/MarkdownRender.vue'
import CodeExecutionWindow from '@/components/chat/CodeExecutionWindow.vue'
import ModelSelectorPopover from '@/components/ai/ModelSelectorPopover.vue'
import AgentStatusIndicator from '@/components/chat/AgentStatusIndicator.vue'
import AvailableAgentsList from '@/components/chat/AvailableAgentsList.vue'
import ChatHistoryDialog from '@/components/chat/ChatHistoryDialog.vue'

// ========== Import ALL shared logic from composable ==========
const {
  // State
  activeTabIndex,
  activeChat,
  aiChat,
  aiMessage,
  newMessage,
  aiLoading,
  aiError,
  assistantMessage,
  currentAttachments,
  selectedModel,
  selectedProvider,
  userAccessToken,
  llmSettings,
  toolsConfig,
  agentMode,
  workspaces,
  selectedWorkspace,
  loadingWorkspaces,
  creatingWorkspace,
  createWorkspaceError,
  newWorkspace,
  showHistory,
  showSettings,
  showTools,
  showDataSelector,
  showCreateWorkspaceDialog,
  showIntegraMCPAuth,
  showEditMessageDialog,
  showAgentsList,
  currentImage,
  showImageDialog,
  isRecording,
  uploadProgress,
  integraMCPState,
  integramAuthForm,
  integramAuthLoading,
  integramAuthError,
  loadingHistory,
  codeExecutions,
  showCodeExecutionWindow,
  selectedDataType,
  selectedDataItem,
  dataComment,
  loadingDataItems,
  dataItems,
  dataTypes,
  editingMessageIndex,
  editingMessageText,
  runningAgents,
  savedChats,
  newChatName,

  // General Chat state
  availableRooms,
  loadingRooms,
  loadingMessages,
  typingUsers,
  isConnected,
  typingIndicator,

  // Refs for template binding
  fileInput,
  fileInputGeneral,
  modalFileInput,
  attachmentMenu,
  attachmentMenuGeneral,
  modalAttachmentMenu,
  aiMessagesContainer,
  messagesContainer,
  modalMessagesContainer,

  // Computed
  isEditorPage,
  currentUserId,

  // Methods - Message handling
  isSystemMessage,
  scrollToBottom,
  sendMessage,
  sendAiMessage,
  copyToClipboard,
  editMessage,
  deleteMessage,
  resendMessage,
  startEditMessage,
  saveEditedMessage,
  cancelEditMessage,

  // Methods - File & Image handling
  isImage,
  getAttachmentIcon,
  getAttachmentDisplayName,
  formatFileSize,
  triggerFileUpload,
  handleFileUpload,
  triggerFileUploadGeneral,
  handleFileUploadGeneral,
  triggerModalFileUpload,
  handleModalFileUpload,
  removeCurrentAttachment,
  downloadAttachment,
  showImagePreview,

  // Methods - Voice input
  toggleVoiceInput,

  // Methods - Model & Settings
  handleModelChange,
  resetSettings,

  // Methods - Workspace
  getWorkspaceName,
  loadWorkspaces,
  handleCreateWorkspace,
  navigateToWorkspaces,

  // Methods - Data selector
  loadDataItems,
  attachDataSource,

  // Methods - Session management
  createNewChatSession,
  clearCurrentChat,

  // Methods - Chat history
  saveCurrentChat,
  loadChat,
  deleteChat,
  quickSaveChat,
  startNewChat,
  clearAllChats,

  // Methods - Integram MCP
  checkIntegraMCPConnection,
  handleIntegraMCPAuth,
  handleIntegraMCPLogout,
  testIntegraMCP,

  // Methods - General Chat
  loadRooms,
  createDefaultRoom,
  joinRoom,
  handleTyping,

  // Lifecycle
  init,
  cleanup
} = useChatLogic()

// ========== UI-Specific State & Methods (Chat.vue only) ==========
// These are NOT in composable because they're specific to sidebar UI

// Model selector overlay panel ref
const modelPanel = ref(null)

// ✅ Extract constant object outside computed to avoid recreation
const PROVIDER_NAMES = Object.freeze({
  polza: 'Полза',
  kodacode: 'KodaCode',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  yandex: 'Yandex'
})

// Current model display name for the button
const currentModelDisplayName = computed(() => {
  if (!selectedModel.value) return null

  const providerLabel = PROVIDER_NAMES[selectedProvider.value] || selectedProvider.value
  const modelName = selectedModel.value
    .replace(/^(gpt-|claude-|deepseek-|yandex-)/, '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

  return `${providerLabel}: ${modelName}`
})

// Toggle overlay panel
function toggleModelPanel(event) {
  if (modelPanel.value) {
    modelPanel.value.toggle(event)
  }
}

// Handle settings change from ModelSelector
function handleSettingsChange(settings) {
  // Sync ModelSelector settings to useChatLogic llmSettings
  if (settings.temperature !== undefined) {
    llmSettings.temperature = settings.temperature
  }
  if (settings.maxTokens !== undefined) {
    llmSettings.contextSize = settings.maxTokens
  }
  if (settings.topP !== undefined) {
    llmSettings.topP = settings.topP
  }
  console.log('[Chat.vue] Settings synced from ModelSelector:', settings)
}

// Save current chat with custom name (wrapper for ChatHistoryDialog)
function saveCurrentChatWithName(name) {
  newChatName.value = name
  saveCurrentChat()
}

// Input refs for focus management
const aiMessageInputRef = ref(null)
const generalMessageInputRef = ref(null)
const modalAiInputRef = ref(null)
const modalGeneralInputRef = ref(null)

// Helper function to focus input
const focusInput = (inputRef) => {
  nextTick(() => {
    if (inputRef.value) {
      // Handle both PrimeVue InputText and native input
      const element = inputRef.value.$el || inputRef.value
      if (element && element.focus) {
        element.focus()
      }
    }
  })
}

// Wrapper functions with focus return
const handleSendAiMessage = () => {
  sendAiMessage()
  // Focus returns to input after message is sent
  if (isModalVisible.value) {
    focusInput(modalAiInputRef)
  } else {
    focusInput(aiMessageInputRef)
  }
}

const handleSendMessage = () => {
  sendMessage()
  // Focus returns to input after message is sent
  if (isModalVisible.value) {
    focusInput(modalGeneralInputRef)
  } else {
    focusInput(generalMessageInputRef)
  }
}

// Modal visibility (specific to Chat.vue sidebar)
const isModalVisible = ref(false)

const showModal = () => {
  isModalVisible.value = true
  nextTick(() => {
    scrollToBottom(modalMessagesContainer)
  })
}

const hideModal = () => {
  isModalVisible.value = false
}

// Close sidebar chat (specific to Chat.vue)
const closeChat = () => {
  localStorage.setItem('chat', 'false')
  window.dispatchEvent(new StorageEvent('storage', {
    key: 'chat',
    newValue: 'false',
    storageArea: localStorage
  }))
}

// Transfer content to editor (specific to Chat.vue when used alongside editor)
const transferToEditor = (content) => {
  window.dispatchEvent(
    new CustomEvent('insert-ai-content', {
      detail: { content }
    })
  )
}

// Resize functionality (Chat.vue specific - sidebar width)
const chatWidth = ref(parseInt(localStorage.getItem('chatWidth')) || 320)
const isResizing = ref(false)

const startResize = (e) => {
  isResizing.value = true
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  e.preventDefault()
}

const handleResize = (e) => {
  if (!isResizing.value) return
  const newWidth = window.innerWidth - e.clientX
  if (newWidth >= 280 && newWidth <= 800) {
    chatWidth.value = newWidth
  }
}

const stopResize = () => {
  if (isResizing.value) {
    isResizing.value = false
    localStorage.setItem('chatWidth', chatWidth.value.toString())
    document.removeEventListener('mousemove', handleResize)
    document.removeEventListener('mouseup', stopResize)
  }
}

// ========== Lifecycle Hooks ==========

onMounted(() => {
  // Initialize shared chat logic
  init()
})

onUnmounted(() => {
  // Cleanup resize event listeners
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)

  // Cleanup WebSocket and other resources from composable
  if (cleanup && typeof cleanup === 'function') {
    cleanup()
  }
})
</script>

<style scoped lang="scss">
.resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: ew-resize;
  background: transparent;
  z-index: 1000;
  transition: background 0.2s;

  &:hover {
    background: var(--primary-color);
  }

  &:active {
    background: var(--primary-color);
  }
}

.quick-prompts {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--surface-border);
  
  :deep(.p-button) {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
  }
}

.message-actions, .modal-message-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.5rem;
  
  .action-buttons {
    display: flex;
    gap: 0.25rem;
  }
}

.voice-btn {
  &.recording {
    animation: pulse 1s infinite;
    color: var(--red-500) !important;
  }
}

.upload-progress {
  padding: 0.5rem;
  background: var(--surface-ground);
  border-top: 1px solid var(--surface-border);
  
  span {
    font-size: 0.75rem;
    display: block;
    text-align: center;
    margin-top: 0.25rem;
  }
}

.image-preview {
  max-width: 200px;
  max-height: 150px;
  cursor: pointer;
  border-radius: 4px;
}

.image-preview-small {
  max-width: 40px;
  max-height: 40px;
  border-radius: 4px;
}

.preview-image {
  max-width: 100%;
  max-height: 70vh;
}

.history-dialog {
  .chat-list {
    max-height: 300px;
    overflow-y: auto;
    
    .chat-item {
      display: flex;
      justify-content: between;
      align-items: center;
      padding: 0.5rem;
      border-bottom: 1px solid var(--surface-border);
      
      .chat-actions {
        display: flex;
        gap: 0.25rem;
        margin-left: auto;
      }
    }
  }
}

.card {
  display: flex;
  flex-direction: column;
}

.tabview-container {
  position: relative;
  height: 100%;
}

.expand-button-container {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 10;
  display: flex;
  gap: 0.25rem;
  
  .expand-button {
    width: 2rem;
    height: 2rem;
    padding: 0;
  }
}

.chat-container {
  display: flex;
  flex-direction: column;
  background-color: var(--surface-card);
  border-radius: 12px;
  height: 100%;
  position: relative;
}

.input-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.5rem 0.5rem;
}

.model-selector-btn-bottom {
  color: var(--primary-color) !important;

  &:hover {
    background: var(--surface-hover) !important;
  }
}

.model-overlay-panel {
  pointer-events: auto !important;
  z-index: 1100 !important;
}

.model-popover-content {
  min-width: 400px;
  max-width: 450px;
}

.popover-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--surface-border);
  gap: 0.5rem;
}

.popover-title {
  font-size: 1rem;
  flex-shrink: 0;
  font-weight: 600;
  color: var(--text-color);
}

.popover-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-wrap: nowrap;
}

/* Ensure OverlayPanel doesn't close on internal interactions */
:deep(.p-overlaypanel) {
  z-index: 1100 !important;
}

.messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-bottom: 80px;
  
  .message {
    gap: 0.5rem;
    align-items: flex-start;
    margin: 0.25rem 0.5rem;
    display: flex;
    
    &.user-message {
      align-self: flex-end;
      flex-direction: row-reverse;
    }
    
    .message-content {
      background: var(--surface-ground);
      padding: 0.5rem;
      border-radius: 12px;
      box-shadow: var(--shadow-1);
      position: relative;
      
      .attachment-info {
        .attachment-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem;
          background: var(--surface-100);
          border-radius: 4px;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
          
          &:last-child {
            margin-bottom: 0;
          }
          
          .pi-file, .pi-database { 
            color: var(--primary-color); 
          }
          
          .file-size, .api-id {
            font-size: 0.75rem;
            opacity: 0.7;
          }
        }
      }
      
      .message-text {
        margin-bottom: 0.5rem;
        white-space: pre-wrap;
      }
      
      .message-time {
        font-size: 0.75rem;
        opacity: 0.7;
      }
      
      .transfer-button {
        width: 24px;
        height: 24px;
      }
    }
    
    &.user-message .message-content {
      background: var(--primary-color);
      color: var(--primary-color-text);
    }
  }
}

.input-container {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem;
  background: var(--surface-ground);
  border-radius: 12px;
  margin-top: auto;
  box-shadow: var(--shadow-2);
  align-items: center;
  position: sticky;
  bottom: 0;
  z-index: 10;
  
  .input-field {
    flex: 1;
    min-width: 0;
    width: 100%;
    height: 35px;
  }
}

.current-attachments {
  padding: 0 0.5rem 0.5rem;
  
  .current-attachment {
    margin-bottom: 0.25rem;
    
    .attachment-info.current {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.25rem 0.5rem;
      background: var(--surface-100);
      border-radius: 4px;
      font-size: 0.875rem;
    }
  }
}

.loading-indicator {
  display: flex;
  justify-content: center;
  padding: 1rem;
}

.error-message {
  color: var(--red-500);
  padding: 0.5rem;
  background: var(--red-50);
  border-radius: 4px;
  margin: 0.5rem;
  text-align: left;
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  max-width: 100%;
  overflow-x: auto;
}

.streaming-cursor::after {
  content: '|';
  animation: blink 1s infinite;
  color: var(--primary-color);
}

.attachment-menu {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 150px;
  
  :deep(.p-button) {
    justify-content: flex-start;
  }
}

.modal-chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.modal-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 0;
  
  .modal-message {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    max-width: 85%;
    
    &.modal-user-message {
      align-self: flex-end;
      flex-direction: row-reverse;
    }
    
    .modal-message-content {
      background: var(--surface-ground);
      padding: 0.75rem 1rem;
      border-radius: 12px;
      box-shadow: var(--shadow-1);
      position: relative;
      word-break: break-word;
      max-width: 100%;
      
      .modal-attachment-info {
        .attachment-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem;
          background: var(--surface-100);
          border-radius: 4px;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
          
          &:last-child {
            margin-bottom: 0;
          }
          
          .pi-file, .pi-database { 
            color: var(--primary-color); 
          }
          
          .file-size, .api-id {
            font-size: 0.75rem;
            opacity: 0.7;
          }
        }
      }
      
      .modal-message-text {
        :deep(p) { margin: 0; }
        :deep(pre) {
          white-space: pre-wrap;
          background: var(--surface-100);
          padding: 0.5rem;
          border-radius: 4px;
          overflow-x: auto;
        }
      }
      
      .modal-message-time {
        font-size: 0.75rem;
        opacity: 0.7;
        text-align: right;
      }
    }
    
    &.modal-user-message .modal-message-content {
      background: var(--primary-color);
      color: var(--primary-color-text);
    }
  }
}

.modal-controls {
  flex-shrink: 0;
  background: var(--surface-ground);
  border-top: 1px solid var(--surface-border);
}

.model-selector-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem 0.5rem;
  border-bottom: 1px solid var(--surface-border);

  label {
    font-weight: 500;
    white-space: nowrap;
  }

  .model-dropdown {
    flex: 1;
    min-width: 0;
  }

  .settings-btn, .tools-btn {
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
  }
}

.modal-input-container {
  flex-shrink: 0;
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem 1rem 1rem;

  .modal-input-field {
    flex: 1;
    min-width: 0;
  }
}

.modal-loading-indicator {
  display: flex;
  justify-content: center;
  padding: 1rem;
}

.modal-error-message {
  color: var(--red-500);
  padding: 0.75rem;
  background: var(--red-50);
  border-radius: 6px;
  margin: 0.5rem;
  text-align: left;
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  max-width: 100%;
  overflow-x: auto;
}

.data-selector-dialog {
  .field {
    margin-bottom: 1rem;

    label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
    }
  }
}

.settings-dialog {
  max-height: 60vh;
  overflow-y: auto;

  .field {
    margin-bottom: 1.5rem;

    label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
    }

    small {
      display: block;
      margin-top: 0.25rem;
      opacity: 0.7;
      font-size: 0.75rem;
    }
  }
}

.tools-dialog {
  .field {
    margin-bottom: 1rem;

    label {
      font-weight: 500;
      cursor: pointer;
      user-select: none;
    }
  }

  .agent-mode-toggle {
    background: rgba(var(--primary-500), 0.1);
    padding: 1rem;
    border-radius: 8px;

    label {
      font-size: 1.1rem;
    }
  }

  .agent-info {
    margin-top: 1rem;
    padding: 0.75rem;
    background: var(--surface-ground);
    border-radius: 4px;
    border-left: 3px solid var(--primary-color);

    i {
      margin-right: 0.5rem;
      color: var(--primary-color);
    }
  }
}

:deep(.p-tabview) {
  height: 100%;
  display: flex;
  flex-direction: column;
  
  .p-tabview-panels {
    flex: 1;
    min-height: 0;
    position: relative;
    padding: 0 0 0;
    
    .p-tabview-panel {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
  }
  
  .p-button {
    width: 2rem;
    height: 2rem;
    padding: 0;
    
    .pi { font-size: 1rem; }
  }
  
  .p-inputtext {
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
  }
  
  .p-avatar { aspect-ratio: 1/1; flex-shrink: 0; }
  
  .p-tabview-nav { position: relative; }
  .p-tabview-nav-link { padding: 0.75rem 1rem; }
  .p-tabview-ink-bar {
    background-color: var(--primary-color);
    height: 2px;
    display: block !important;
  }
}

.modal-messages::-webkit-scrollbar,
.messages::-webkit-scrollbar {
  width: 8px;
  
  &-track { background: var(--surface-ground); }
  &-thumb {
    background: var(--surface-border);
    border-radius: 4px;
    
    &:hover { background: var(--text-color-secondary); }
  }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

@media screen and (max-width: 960px) {
  :deep(.p-dialog) { width: 75vw !important; }
  .modal-message { max-width: 90%; }
}

@media screen and (max-width: 640px) {
  :deep(.p-dialog) {
    width: 90vw !important;
    height: 90vh !important;
  }
  
  .modal-message { max-width: 95%; }
  .modal-message-content { padding: 0.5rem 0.75rem; }
  .modal-input-container { padding: 0.75rem; }
  
  .message {
    flex-direction: column;
    align-items: flex-start;
    
    &.user-message { align-items: flex-end; }
    
    .message-content { max-width: 90%; }
  }
  
}
/* Utility classes for theme-aware colors */
.status-text {
  font-size: 0.75rem;
  color: var(--text-color);
}

.success-icon {
  color: var(--green-500);
}

.warning-icon {
  color: var(--orange-500);
}

.error-icon {
  color: var(--red-500);
}

/* Session history styles */
.history-dialog {
  .chat-list {
    max-height: 400px;
    overflow-y: auto;
  }

  .chat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    border-radius: 6px;
    margin-bottom: 0.5rem;
    background: var(--surface-50);
    border: 1px solid var(--surface-200);
    transition: all 0.2s;

    &:hover {
      background: var(--surface-100);
      border-color: var(--primary-color);
    }

    .chat-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;

      strong {
        color: var(--text-color);
      }

      small {
        color: var(--text-color-secondary);
        font-size: 0.85rem;
      }
    }

    .chat-actions {
      display: flex;
      gap: 0.25rem;
    }
  }

  .text-muted {
    color: var(--text-color-secondary);
  }
}

/* Edit message dialog */
.edit-message-dialog {
  :deep(.p-inputtextarea) {
    font-family: inherit;
    font-size: 0.95rem;
  }
}

/* Message action buttons */
.message-actions {
  .action-buttons {
    display: flex;
    gap: 0.25rem;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .message:hover & .action-buttons {
    opacity: 1;
  }

  .edit-button,
  .delete-button {
    &:hover {
      background: var(--surface-100);
    }
  }

  .delete-button:hover {
    color: var(--red-500);
  }
}
</style>
