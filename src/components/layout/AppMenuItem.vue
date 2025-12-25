<script setup>
import { useLayout } from '@/layout/composables/layout';
import { onBeforeMount, ref, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { isGroupCollapsed, toggleGroupCollapsed } from '@/services/menuStateService';
import { logger } from '@/utils/logger';
import { useRoutePrefetch } from '@/composables/useRoutePrefetch';

const route = useRoute();
const router = useRouter();
const { onLinkHover, onLinkLeave } = useRoutePrefetch();

const { layoutState, setActiveMenuItem, toggleMenu } = useLayout();

const props = defineProps({
    item: {
        type: Object,
        default: () => ({})
    },
    index: {
        type: Number,
        default: 0
    },
    root: {
        type: Boolean,
        default: true
    },
    parentItemKey: {
        type: String,
        default: null
    },
    searchQuery: {
        type: String,
        default: ''
    },
    collapsed: {
        type: Boolean,
        default: false
    }
});

const emit = defineEmits(['rename', 'duplicate', 'toggle-visibility', 'delete', 'add-child', 'drag-drop', 'toggle-collapsed']);

const isActiveMenu = ref(false);
const itemKey = ref(null);
const menuRef = ref();
const isEditing = ref(false);
const editedLabel = ref('');
const isDragging = ref(false);
const isDragOver = ref(false);
const submenuOverlay = ref();

// Typeahead navigation variables
let typeaheadBuffer = '';
let typeaheadTimeout = null;

onBeforeMount(() => {
    itemKey.value = props.parentItemKey ? props.parentItemKey + '-' + props.index : String(props.index);

    const activeItem = layoutState.activeMenuItem;

    // For root items (groups), check if they're collapsed in localStorage
    if (props.root && props.item.items && props.item.items.length > 0) {
        const collapsed = isGroupCollapsed(props.item.label);
        isActiveMenu.value = !collapsed;
    } else {
        isActiveMenu.value = props.root || (activeItem === itemKey.value || activeItem ? activeItem.startsWith(itemKey.value + '-') : false);
    }
});

watch(
    () => layoutState.activeMenuItem,
    (newVal) => {
        // For root items (groups), check persisted collapsed state
        if (props.root && props.item.items && props.item.items.length > 0) {
            const collapsed = isGroupCollapsed(props.item.label);
            isActiveMenu.value = !collapsed;
        } else {
            isActiveMenu.value = props.root || (newVal === itemKey.value || (newVal ? newVal.startsWith(itemKey.value + '-') : false));
        }
    }
);

// Auto-expand when searching and item has children that match
watch(
    () => props.searchQuery,
    (newQuery) => {
        if (newQuery && newQuery.trim() !== '' && props.item.items && props.item.items.length > 0) {
            // Auto-expand sections with matching items
            isActiveMenu.value = true;
        } else if (!newQuery || newQuery.trim() === '') {
            // Restore to saved state when search is cleared
            if (props.root && props.item.items && props.item.items.length > 0) {
                // For root groups, restore from localStorage
                const collapsed = isGroupCollapsed(props.item.label);
                isActiveMenu.value = !collapsed;
            } else {
                // For non-root items, check active route
                const activeItem = layoutState.activeMenuItem;
                isActiveMenu.value = activeItem === itemKey.value || (activeItem ? activeItem.startsWith(itemKey.value + '-') : false);
            }
        }
    }
);

// Highlight matching text
const highlightMatch = (text, query) => {
    if (!query || query.trim() === '' || !text) return text;

    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark class="search-highlight">$1</mark>');
};

const highlightedLabel = computed(() => {
    return highlightMatch(props.item.label, props.searchQuery);
});

function itemClick(event, item) {
    if (item.disabled) {
        event.preventDefault();
        return;
    }

    // In collapsed mode, if item has subitems, show overlay instead of toggling
    if (props.collapsed && item.items && item.items.length > 0) {
        event.preventDefault();
        submenuOverlay.value?.toggle(event);
        return;
    }

    // For router-link items, prevent default and navigate
    if (item.to && !item.items) {
        event.preventDefault();
        router.push(item.to);

        if (layoutState.staticMenuMobileActive || layoutState.overlayMenuActive) {
            toggleMenu();
        }

        const foundItemKey = itemKey.value;
        setActiveMenuItem(foundItemKey);
        return;
    }

    if ((item.to || item.url) && (layoutState.staticMenuMobileActive || layoutState.overlayMenuActive)) {
        toggleMenu();
    }

    if (item.command) {
        item.command({ originalEvent: event, item: item });
    }

    // For root items with children (groups), persist collapsed state
    if (props.root && item.items && item.items.length > 0) {
        const newCollapsedState = toggleGroupCollapsed(item.label);
        isActiveMenu.value = !newCollapsedState;
        emit('toggle-collapsed', { item, collapsed: newCollapsedState });
    }

    // Calculate foundItemKey safely - always use .value for refs
    const foundItemKey = item.items ? (isActiveMenu.value ? props.parentItemKey : itemKey.value) : itemKey.value;

    setActiveMenuItem(foundItemKey);
}

function onSubmenuItemClick(event, child) {
    // Prevent default behavior
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    // Close the overlay
    submenuOverlay.value?.hide();

    // Navigate if item has a route
    if (child.to) {
        router.push(child.to);
    }

    // Toggle menu if on mobile
    if (layoutState.staticMenuMobileActive || layoutState.overlayMenuActive) {
        toggleMenu();
    }
}

function checkActiveRoute(item) {
    if (!item.to) return false;

    // Normalize paths (remove trailing slashes)
    const currentPath = route.path.replace(/\/$/, '') || '/';
    const itemPath = item.to.replace(/\/$/, '') || '/';

    // Exact match
    if (currentPath === itemPath) {
        return true;
    }

    // For "/workspaces" - only match exactly, not "/workspace/xxx"
    if (itemPath === '/workspaces') {
        return currentPath === '/workspaces';
    }

    // For "/workspace/xxx" - match exact workspace
    if (itemPath.startsWith('/workspace/') && currentPath.startsWith('/workspace/')) {
        return currentPath === itemPath;
    }

    return false;
}

// Drag and drop handlers
function isDraggable() {
    // Exclude "Страницы" section (it's dynamic)
    if (props.item.label === 'Страницы') {
        return false;
    }
    // Allow dragging:
    // - Root sections (for section reordering)
    // - Menu items with 'to' property
    // - Groups with children (for group reordering)
    return true;
}

function onDragStart(event) {
    if (!isDraggable()) {
        event.preventDefault();
        return;
    }

    isDragging.value = true;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify({
        index: props.index,
        parentItemKey: props.parentItemKey
    }));
}

function onDragOver(event) {
    if (!isDraggable()) {
        return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    isDragOver.value = true;
}

function onDragLeave() {
    isDragOver.value = false;
}

function onDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!isDraggable()) {
        return;
    }

    isDragOver.value = false;

    try {
        const draggedData = JSON.parse(event.dataTransfer.getData('text/plain'));

        emit('drag-drop', {
            draggedIndex: draggedData.index,
            draggedParentKey: draggedData.parentItemKey,
            targetIndex: props.index,
            targetParentKey: props.parentItemKey
        });
    } catch (error) {
        logger.error('Error parsing drag data:', error);
    }
}

function onDragEnd() {
    isDragging.value = false;
    isDragOver.value = false;
}

// Context menu functionality
const contextMenuItems = computed(() => {
    const items = [];

    if (!props.root) {
        items.push(
            {
                label: 'Переименовать',
                icon: 'pi pi-pencil',
                command: () => startRename()
            },
            {
                label: 'Дублировать',
                icon: 'pi pi-copy',
                command: () => emit('duplicate', props.item)
            }
        );

        // Add "Add child" option for groups (items without 'to' but with 'items' array)
        if (!props.item.to) {
            items.push({
                label: 'Добавить подпункт',
                icon: 'pi pi-plus',
                command: () => emit('add-child', props.item)
            });
        }

        items.push(
            { separator: true },
            {
                label: props.item.visible !== false ? 'Скрыть' : 'Показать',
                icon: props.item.visible !== false ? 'pi pi-eye-slash' : 'pi pi-eye',
                command: () => emit('toggle-visibility', props.item)
            },
            { separator: true },
            {
                label: 'Удалить',
                icon: 'pi pi-trash',
                command: () => emit('delete', props.item)
            }
        );

        // Add "Copy link" for items with 'to' property
        if (props.item.to) {
            items.splice(items.length - 2, 0, {
                label: 'Копировать ссылку',
                icon: 'pi pi-link',
                command: () => copyLink()
            });
        }
    }

    return items;
});

const onRightClick = (event) => {
    if (!props.root) {
        event.preventDefault();
        menuRef.value.show(event);
    }
};

const startRename = () => {
    isEditing.value = true;
    editedLabel.value = props.item.label;
};

const saveRename = () => {
    if (editedLabel.value && editedLabel.value !== props.item.label) {
        emit('rename', { item: props.item, newLabel: editedLabel.value });
    }
    isEditing.value = false;
};

const cancelRename = () => {
    isEditing.value = false;
    editedLabel.value = '';
};

const copyLink = () => {
    if (props.item.to) {
        navigator.clipboard.writeText(props.item.to);
    }
};

// Accessibility: Get all focusable menu items
function getAllFocusableItems() {
    return Array.from(
        document.querySelectorAll('.layout-menu a[tabindex="0"]:not([style*="display: none"])')
    );
}

// Accessibility: Navigate to previous menu item
function focusPreviousItem() {
    const allItems = getAllFocusableItems();
    const currentIndex = allItems.indexOf(document.activeElement);
    if (currentIndex > 0) {
        allItems[currentIndex - 1].focus();
    }
}

// Accessibility: Navigate to next menu item
function focusNextItem() {
    const allItems = getAllFocusableItems();
    const currentIndex = allItems.indexOf(document.activeElement);
    if (currentIndex < allItems.length - 1) {
        allItems[currentIndex + 1].focus();
    }
}

// Accessibility: Navigate to first menu item
function focusFirstItem() {
    const allItems = getAllFocusableItems();
    if (allItems.length > 0) {
        allItems[0].focus();
    }
}

// Accessibility: Navigate to last menu item
function focusLastItem() {
    const allItems = getAllFocusableItems();
    if (allItems.length > 0) {
        allItems[allItems.length - 1].focus();
    }
}

// Accessibility: Navigate to parent item
function focusParentItem() {
    if (props.parentItemKey) {
        const parent = document.querySelector(`[data-key="${props.parentItemKey}"]`);
        if (parent) {
            parent.focus();
        }
    }
}

// Accessibility: Keyboard navigation handler
function onKeyDown(event) {
    switch (event.key) {
        case 'ArrowUp':
            event.preventDefault();
            focusPreviousItem();
            break;

        case 'ArrowDown':
            event.preventDefault();
            focusNextItem();
            break;

        case 'ArrowRight':
            if (props.item.items && !isActiveMenu.value) {
                event.preventDefault();
                setActiveMenuItem(itemKey.value);
            }
            break;

        case 'ArrowLeft':
            if (isActiveMenu.value && props.item.items) {
                event.preventDefault();
                setActiveMenuItem(props.parentItemKey);
            } else if (props.parentItemKey) {
                event.preventDefault();
                focusParentItem();
            }
            break;

        case 'Home':
            event.preventDefault();
            focusFirstItem();
            break;

        case 'End':
            event.preventDefault();
            focusLastItem();
            break;

        case ' ':
            if (props.item.items) {
                event.preventDefault();
                itemClick(event, props.item);
            }
            break;

        case 'Escape':
            if (isActiveMenu.value) {
                event.preventDefault();
                setActiveMenuItem(props.parentItemKey);
            }
            break;
    }
}

// Accessibility: Typeahead navigation handler
function onKeyPress(event) {
    // Ignore modifiers and special keys
    if (event.ctrlKey || event.metaKey || event.altKey || event.key.length > 1) {
        return;
    }

    clearTimeout(typeaheadTimeout);
    typeaheadBuffer += event.key.toLowerCase();

    // Find next item starting with typed characters
    const allItems = getAllFocusableItems();
    const currentIndex = allItems.indexOf(document.activeElement);

    // Search from current position to end
    for (let i = currentIndex + 1; i < allItems.length; i++) {
        const text = allItems[i].textContent.trim().toLowerCase();
        if (text.startsWith(typeaheadBuffer)) {
            allItems[i].focus();
            return;
        }
    }

    // If not found, search from beginning to current position
    for (let i = 0; i <= currentIndex; i++) {
        const text = allItems[i].textContent.trim().toLowerCase();
        if (text.startsWith(typeaheadBuffer)) {
            allItems[i].focus();
            return;
        }
    }

    // Clear buffer after 1 second
    typeaheadTimeout = setTimeout(() => {
        typeaheadBuffer = '';
    }, 1000);
}
</script>

<template>
    <li
        :class="{
            'layout-root-menuitem': root,
            'active-menuitem': isActiveMenu,
            'menu-item-dragging': isDragging,
            'menu-item-drag-over': isDragOver
        }"
        :role="root ? 'none' : 'treeitem'"
        :aria-expanded="item.items ? isActiveMenu : undefined"
        :draggable="isDraggable()"
        @dragstart="onDragStart"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
        @dragend="onDragEnd"
        @contextmenu="onRightClick"
    >
        <!-- Root section title (visible only when expanded) - clickable to collapse/expand -->
        <div
            v-if="root && item.visible !== false && !collapsed"
            class="layout-menuitem-root-text"
            :class="{ 'collapsible-group': item.items && item.items.length > 0 }"
            @click="item.items && item.items.length > 0 ? itemClick($event, item) : null"
            role="button"
            :aria-expanded="item.items ? isActiveMenu : undefined"
            :tabindex="item.items && item.items.length > 0 ? 0 : -1"
            @keydown.enter="item.items && item.items.length > 0 ? itemClick($event, item) : null"
            @keydown.space.prevent="item.items && item.items.length > 0 ? itemClick($event, item) : null"
        >
            <i v-if="isDraggable()" class="pi pi-bars drag-handle"></i>
            <span v-html="highlightedLabel"></span>
            <i v-if="item.items && item.items.length > 0" class="pi pi-fw layout-group-toggler" :class="isActiveMenu ? 'pi-chevron-down' : 'pi-chevron-right'"></i>
        </div>
        <!-- Root section as clickable icon (visible when collapsed) -->
        <a v-if="root && item.visible !== false && collapsed && item.icon"
           :href="item.url"
           @click="itemClick($event, item, index)"
           @keydown="onKeyDown"
           @keypress="onKeyPress"
           :class="item.class"
           :target="item.target"
           tabindex="0"
           :data-key="itemKey"
           :data-parent="parentItemKey"
           :aria-label="item.label"
           v-tooltip.right="item.label">
            <i :class="item.icon" class="layout-menuitem-icon"></i>
        </a>
        <!-- Regular menu item (non-root or root with children when expanded) -->
        <a v-if="!root && (!item.to || item.items) && item.visible !== false" :href="item.url" @click="itemClick($event, item, index)" @keydown="onKeyDown" @keypress="onKeyPress" :class="item.class" :target="item.target" tabindex="0" :data-key="itemKey" :data-parent="parentItemKey" :aria-label="item.label" v-tooltip.right="collapsed ? item.label : null">
            <i v-if="isDraggable() && !collapsed" class="pi pi-bars drag-handle"></i>
            <i v-if="item.icon" :class="item.icon" class="layout-menuitem-icon"></i>
            <span v-if="!isEditing && !collapsed" class="layout-menuitem-text" v-html="highlightedLabel"></span>
            <InputText
                v-else-if="isEditing && !collapsed"
                v-model="editedLabel"
                @blur="saveRename"
                @keyup.enter="saveRename"
                @keyup.esc="cancelRename"
                autofocus
                class="layout-menuitem-text p-inputtext-sm"
                style="width: 100%; max-width: 200px;"
            />
            <i class="pi pi-fw pi-angle-down layout-submenu-toggler" v-if="item.items && !collapsed"></i>
        </a>
        <router-link v-if="item.to && !item.items && item.visible !== false" @click="itemClick($event, item, index)" @keydown="onKeyDown" @keypress="onKeyPress" @mouseenter="onLinkHover(item.to)" @mouseleave="onLinkLeave(item.to)" :class="[item.class, { 'active-route': checkActiveRoute(item) }]" tabindex="0" :to="item.to" :data-key="itemKey" :data-parent="parentItemKey" :aria-label="item.label" :aria-current="checkActiveRoute(item) ? 'page' : undefined" v-tooltip.right="collapsed ? item.label : null">
            <i v-if="!root && isDraggable() && !collapsed" class="pi pi-bars drag-handle"></i>
            <i v-if="item.icon" :class="item.icon" class="layout-menuitem-icon"></i>
            <span v-if="!isEditing && !collapsed" class="layout-menuitem-text" v-html="highlightedLabel"></span>
            <InputText
                v-else-if="isEditing && !collapsed"
                v-model="editedLabel"
                @blur="saveRename"
                @keyup.enter="saveRename"
                @keyup.esc="cancelRename"
                autofocus
                class="layout-menuitem-text p-inputtext-sm"
                style="width: 100%; max-width: 200px;"
            />
            <i class="pi pi-fw pi-angle-down layout-submenu-toggler" v-if="item.items && !collapsed"></i>
        </router-link>
        <Transition v-if="item.items && item.visible !== false && !collapsed" name="layout-submenu">
            <ul v-show="isActiveMenu" class="layout-submenu" role="group">
                <app-menu-item
                    v-for="(child, i) in item.items"
                    :key="child"
                    :index="i"
                    :item="child"
                    :parentItemKey="itemKey"
                    :root="false"
                    :search-query="searchQuery"
                    :collapsed="collapsed"
                    @rename="(data) => $emit('rename', data)"
                    @duplicate="(item) => $emit('duplicate', item)"
                    @toggle-visibility="(item) => $emit('toggle-visibility', item)"
                    @delete="(item) => $emit('delete', item)"
                    @add-child="(item) => $emit('add-child', item)"
                    @drag-drop="(event) => $emit('drag-drop', event)"
                ></app-menu-item>
            </ul>
        </Transition>
        <ContextMenu v-if="!root" ref="menuRef" :model="contextMenuItems" />

        <!-- Submenu overlay for collapsed sidebar -->
        <OverlayPanel v-if="item.items && item.items.length > 0 && collapsed" ref="submenuOverlay" :dismissable="true" :showCloseIcon="false">
            <div class="submenu-overlay-content">
                <div class="submenu-overlay-header">
                    <i v-if="item.icon" :class="item.icon" class="mr-2"></i>
                    <span class="font-semibold">{{ item.label }}</span>
                </div>
                <div class="submenu-overlay-items">
                    <template v-for="(child, idx) in item.items" :key="idx">
                        <!-- Regular menu item without subitems -->
                        <div
                            v-if="child.visible !== false && !child.items"
                            class="submenu-overlay-item"
                            @click="onSubmenuItemClick($event, child)"
                            @mouseenter="child.to && onLinkHover(child.to)"
                            @mouseleave="child.to && onLinkLeave(child.to)"
                            role="menuitem"
                            tabindex="0"
                        >
                            <i v-if="child.icon" :class="child.icon" class="mr-2"></i>
                            <span>{{ child.label }}</span>
                        </div>
                        <!-- Parent item with subitems -->
                        <div v-else-if="child.visible !== false && child.items" class="submenu-overlay-group">
                            <div class="submenu-overlay-group-label">
                                <i v-if="child.icon" :class="child.icon" class="mr-2"></i>
                                <span>{{ child.label }}</span>
                            </div>
                            <div class="submenu-overlay-group-items">
                                <div
                                    v-for="(grandchild, gidx) in child.items"
                                    :key="gidx"
                                    v-show="grandchild.visible !== false"
                                    class="submenu-overlay-item submenu-overlay-item-nested"
                                    @click="onSubmenuItemClick($event, grandchild)"
                                    @mouseenter="grandchild.to && onLinkHover(grandchild.to)"
                                    @mouseleave="grandchild.to && onLinkLeave(grandchild.to)"
                                    role="menuitem"
                                    tabindex="0"
                                >
                                    <i v-if="grandchild.icon" :class="grandchild.icon" class="mr-2"></i>
                                    <span>{{ grandchild.label }}</span>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </OverlayPanel>
    </li>
</template>

<style lang="scss" scoped>
.drag-handle {
    opacity: 0;
    transition: opacity 0.2s;
    cursor: grab;
    margin-right: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-color-secondary);
}

// Show drag handle on hover for regular menu items
a:hover .drag-handle,
.router-link-active .drag-handle {
    opacity: 0.6;
}

li:hover .drag-handle {
    opacity: 1;
}

// Show drag handle on hover for root sections
.layout-menuitem-root-text {
    display: flex;
    align-items: center;
    cursor: move;

    .drag-handle {
        margin-right: 0.5rem;
    }
}

.layout-root-menuitem:hover .layout-menuitem-root-text .drag-handle {
    opacity: 0.8;
}

// Collapsible group styling
.collapsible-group {
    cursor: pointer;
    user-select: none;
    padding: 0.5rem 0.75rem;
    margin: 0 -0.75rem;
    border-radius: 6px;
    transition: background-color 0.2s ease;

    &:hover {
        background-color: var(--surface-hover);
    }

    &:focus {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
    }

    &:active {
        background-color: var(--surface-200);
    }
}

.layout-group-toggler {
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--text-color-secondary);
    transition: transform 0.2s ease;
}

.drag-handle:active {
    cursor: grabbing;
}

.menu-item-dragging {
    opacity: 0.5;
    background-color: var(--surface-100);
}

.menu-item-drag-over {
    border-top: 2px solid var(--primary-color);
    padding-top: 2px;
}

// Better visual feedback for collapsible groups
.layout-submenu-toggler {
    transition: transform 0.2s;
}

.active-menuitem > a .layout-submenu-toggler,
.active-menuitem > .router-link-active .layout-submenu-toggler {
    transform: rotate(180deg);
}

:deep(.search-highlight) {
    background-color: #ffd54f;
    color: #000;
    padding: 0 2px;
    border-radius: 2px;
    font-weight: 600;
}

// Submenu overlay styling
.submenu-overlay-content {
    min-width: 200px;
    max-width: 350px;
    max-height: 80vh;
    overflow-y: auto;
}

.submenu-overlay-header {
    display: flex;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--surface-border);
    margin-bottom: 0.5rem;
    font-size: 1rem;
    color: var(--text-color);
}

.submenu-overlay-items {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.submenu-overlay-item {
    display: flex;
    align-items: center;
    padding: 0.75rem 1rem;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.2s;
    color: var(--text-color);

    &:hover {
        background-color: var(--surface-hover);
    }

    &:focus {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
    }

    i {
        font-size: 1rem;
        color: var(--text-color-secondary);
    }
}

.submenu-overlay-item-nested {
    padding-left: 2rem;
    font-size: 0.9rem;
}

.submenu-overlay-group {
    margin: 0.5rem 0;
}

.submenu-overlay-group-label {
    display: flex;
    align-items: center;
    padding: 0.5rem 1rem;
    font-weight: 600;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-color-secondary);
}

.submenu-overlay-group-items {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

// Removed center alignment - menu items should be left-aligned

</style>
