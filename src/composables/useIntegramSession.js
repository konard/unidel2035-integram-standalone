/**
 * useIntegramSession Composable
 *
 * Provides reactive access to Integram session state
 * Manages authentication, database selection, and user information
 */

import { ref, computed } from 'vue';
import integramApiClient from '@/services/integramApiClient';

const isAuthenticated = ref(false);
const currentDatabase = ref(null);
const userInfo = ref(null);

export function useIntegramSession() {
  /**
   * Initialize session from stored credentials
   */
  function initializeSession() {
    const restored = integramApiClient.tryRestoreSession();
    if (restored) {
      isAuthenticated.value = integramApiClient.isAuthenticated();
      currentDatabase.value = integramApiClient.getDatabase();
      userInfo.value = integramApiClient.getAuthInfo();
    }
  }

  /**
   * Login with credentials
   */
  async function login(serverURL, database, username, password) {
    try {
      await integramApiClient.authenticate(serverURL, database, username, password);
      isAuthenticated.value = true;
      currentDatabase.value = database;
      userInfo.value = integramApiClient.getAuthInfo();
      integramApiClient.saveSession();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Logout and clear session
   */
  async function logout() {
    await integramApiClient.logout();
    isAuthenticated.value = false;
    currentDatabase.value = null;
    userInfo.value = null;
    localStorage.removeItem('integram_session');
  }

  /**
   * Switch to a different database
   */
  function switchDatabase(databaseName) {
    integramApiClient.switchDatabase(databaseName);
    currentDatabase.value = databaseName;
    userInfo.value = integramApiClient.getAuthInfo();
  }

  // Initialize on first use
  if (!isAuthenticated.value) {
    initializeSession();
  }

  return {
    isAuthenticated: computed(() => isAuthenticated.value),
    currentDatabase: computed(() => currentDatabase.value),
    userInfo: computed(() => userInfo.value),
    login,
    logout,
    switchDatabase,
    initializeSession
  };
}

export default useIntegramSession;
