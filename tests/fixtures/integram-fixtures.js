import { test as base } from '@playwright/test';
import { IntegramAPI } from '../helpers/integram-api.js';

// Конфигурация для тестов
const INTEGRAM_CONFIG = {
  baseUrl: process.env.INTEGRAM_URL || 'https://dronedoc.ru',
  database: process.env.INTEGRAM_DB || 'a2025',
  login: process.env.INTEGRAM_LOGIN || 'dmi',
  password: process.env.INTEGRAM_PASSWORD || 'your_password',
};

/**
 * Расширенный test fixture с Integram API и аутентификацией
 */
export const test = base.extend({
  // Integram API helper
  api: async ({}, use) => {
    const api = new IntegramAPI(INTEGRAM_CONFIG.baseUrl, INTEGRAM_CONFIG.database);
    await api.authenticate(INTEGRAM_CONFIG.login, INTEGRAM_CONFIG.password);
    await use(api);
  },

  // Authenticated page для Integram
  authenticatedPage: async ({ page }, use) => {
    // Перейти на страницу логина Integram
    await page.goto(`${INTEGRAM_CONFIG.baseUrl}/app/`);

    // Аутентификация через форму если необходимо
    const loginInput = page.locator('input[name="login"]');
    if (await loginInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await loginInput.fill(INTEGRAM_CONFIG.login);
      await page.locator('input[name="password"]').fill(INTEGRAM_CONFIG.password);
      await page.locator('input[name="db"]').fill(INTEGRAM_CONFIG.database);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/.*\/app\//);
    }

    await use(page);
  },

  // Test table - создается перед тестом и удаляется после
  testTable: async ({ api }, use) => {
    const tableName = `TestTable_${Date.now()}`;
    const tableId = await api.createTable(tableName, [
      { typeId: 3, alias: 'Название' },
      { typeId: 13, alias: 'Количество' },
      { typeId: 2, alias: 'Описание' },
      { typeId: 7, alias: 'Активен' },
    ]);

    await use({ tableId, tableName });

    // Cleanup
    await api.deleteTable(tableId);
  },

  // Test table with reference - таблица со справочником
  testTableWithReference: async ({ api }, use) => {
    // Создать справочник
    const lookupName = `Lookup_${Date.now()}`;
    const lookupId = await api.createTable(lookupName, []);

    // Добавить значения в справочник
    await api.createObject(lookupId, 'Значение 1');
    await api.createObject(lookupId, 'Значение 2');
    await api.createObject(lookupId, 'Значение 3');

    // Создать основную таблицу
    const tableName = `TestTableWithRef_${Date.now()}`;
    const tableId = await api.createTable(tableName, [
      { typeId: 3, alias: 'Название' },
      { typeId: lookupId, alias: 'Справочник' },
    ]);

    await use({ tableId, tableName, lookupId, lookupName });

    // Cleanup
    await api.deleteTable(tableId);
    await api.deleteTable(lookupId);
  },

  // Parent-child tables для теста подчиненности
  parentChildTables: async ({ api }, use) => {
    // Создать родительскую таблицу
    const parentName = `ParentTable_${Date.now()}`;
    const parentId = await api.createTable(parentName, [
      { typeId: 3, alias: 'Название родителя' },
    ]);

    // Создать дочернюю таблицу (subordinate)
    const childName = `ChildTable_${Date.now()}`;
    const childId = await api.createTable(childName, [
      { typeId: 3, alias: 'Название ребенка' },
      { typeId: parentId, alias: 'Родитель' },
    ]);

    await use({ parentId, parentName, childId, childName });

    // Cleanup
    await api.deleteTable(childId);
    await api.deleteTable(parentId);
  },
});

export { expect } from '@playwright/test';
export { INTEGRAM_CONFIG };
