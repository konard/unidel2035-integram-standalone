import { computed, reactive } from 'vue';

// Инициализация темы из localStorage
const getInitialDarkTheme = () => {
  if (typeof window === 'undefined') return true; // Для SSR - темная тема по умолчанию
  const savedTheme = localStorage.getItem('darkTheme');
  return savedTheme ? JSON.parse(savedTheme) : true; // Темная тема по умолчанию
};

const layoutConfig = reactive({
    preset: 'Aura',
    primary: 'cyan',
    surface: 'neutral',
    darkTheme: getInitialDarkTheme(),
    menuMode: 'static'
});

// Инициализация состояния свернутого меню из localStorage
const getInitialSidebarCollapsed = () => {
  if (typeof window === 'undefined') return true; // По умолчанию свернуто
  const savedState = localStorage.getItem('sidebarCollapsed');
  return savedState ? JSON.parse(savedState) : true; // По умолчанию свернуто (только иконки)
};

const layoutState = reactive({
    staticMenuDesktopInactive: false,
    overlayMenuActive: false,
    profileSidebarVisible: false,
    configSidebarVisible: false,
    staticMenuMobileActive: false,
    menuHoverActive: false,
    activeMenuItem: null,
    sidebarCollapsed: getInitialSidebarCollapsed()
});

// Применяем начальную тему
if (typeof window !== 'undefined') {
  document.documentElement.classList.toggle('app-dark', layoutConfig.darkTheme);
}

export function useLayout() {
    const setActiveMenuItem = (item) => {
        // Handle null/undefined items safely
        if (item === null || item === undefined) {
            layoutState.activeMenuItem = null;
            return;
        }
        // Handle ref objects (check if item has a value property)
        layoutState.activeMenuItem = (item && typeof item === 'object' && 'value' in item) ? item.value : item;
    };

    const toggleDarkMode = () => {
        if (!document.startViewTransition) {
            executeDarkModeToggle();

            return;
        }

        document.startViewTransition(() => executeDarkModeToggle(event));
    };

   
    const executeDarkModeToggle = () => {
        layoutConfig.darkTheme = !layoutConfig.darkTheme;
        
        if (typeof window !== 'undefined') {
            localStorage.setItem('darkTheme', JSON.stringify(layoutConfig.darkTheme));
            document.documentElement.classList.toggle('app-dark', layoutConfig.darkTheme);
        }
    };

    const toggleMenu = () => {
        if (layoutConfig.menuMode === 'overlay') {
            layoutState.overlayMenuActive = !layoutState.overlayMenuActive;
        }

        if (window.innerWidth > 991) {
            layoutState.staticMenuDesktopInactive = !layoutState.staticMenuDesktopInactive;
        } else {
            layoutState.staticMenuMobileActive = !layoutState.staticMenuMobileActive;
        }
    };

    const toggleSidebarCollapse = () => {
        layoutState.sidebarCollapsed = !layoutState.sidebarCollapsed;
        // Async localStorage to prevent UI blocking
        if (typeof window !== 'undefined') {
            const value = layoutState.sidebarCollapsed;
            queueMicrotask(() => {
                localStorage.setItem('sidebarCollapsed', JSON.stringify(value));
            });
        }
    };

    const isSidebarActive = computed(() => layoutState.overlayMenuActive || layoutState.staticMenuMobileActive);

    const isDarkTheme = computed(() => layoutConfig.darkTheme);

    const getPrimary = computed(() => layoutConfig.primary);

    const getSurface = computed(() => layoutConfig.surface);

    return {
        layoutConfig,
        layoutState,
        toggleMenu,
        toggleSidebarCollapse,
        isSidebarActive,
        isDarkTheme,
        getPrimary,
        getSurface,
        setActiveMenuItem,
        toggleDarkMode
    };
}
