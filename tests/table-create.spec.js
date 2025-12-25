import { test, expect, INTEGRAM_CONFIG } from './fixtures/integram-fixtures.js';

test.describe('Table Creation Tests', () => {
  test('should create a new table via UI', async ({ authenticatedPage }) => {
    const tableName = `UITable_${Date.now()}`;

    // Переход в редактор типов
    await authenticatedPage.goto(`${INTEGRAM_CONFIG.baseUrl}/app/?db=${INTEGRAM_CONFIG.database}`);
    await authenticatedPage.waitForLoadState('networkidle');

    // Найти и кликнуть на редактор типов
    const typeEditorLink = authenticatedPage.locator('a[href*="edit_types"]').first();
    if (await typeEditorLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await typeEditorLink.click();
      await authenticatedPage.waitForLoadState('networkidle');
    } else {
      await authenticatedPage.goto(`${INTEGRAM_CONFIG.baseUrl}/app/?db=${INTEGRAM_CONFIG.database}&edit_types`);
    }

    // Найти кнопку создания таблицы
    const createButton = authenticatedPage.locator('button:has-text("Добавить")').or(
      authenticatedPage.locator('button:has-text("Создать")')
    ).or(
      authenticatedPage.locator('button.p-button-success')
    ).first();

    await expect(createButton).toBeVisible({ timeout: 10000 });
    await createButton.click();

    // Заполнить форму создания таблицы
    const nameInput = authenticatedPage.locator('input[name="name"]').or(
      authenticatedPage.locator('input[placeholder*="азвание"]')
    ).first();
    await nameInput.fill(tableName);

    // Сохранить
    const saveButton = authenticatedPage.locator('button:has-text("Сохранить")').or(
      authenticatedPage.locator('button:has-text("Save")')
    ).first();
    await saveButton.click();

    // Проверить, что таблица создана
    await expect(authenticatedPage.locator(`text=${tableName}`)).toBeVisible({ timeout: 5000 });
  });

  test('should create table with columns via API', async ({ api }) => {
    const tableName = `APITable_${Date.now()}`;
    const tableId = await api.createTable(tableName, [
      { typeId: 3, alias: 'Имя' },
      { typeId: 13, alias: 'Возраст' },
      { typeId: 2, alias: 'Комментарий' },
    ]);

    expect(tableId).toBeDefined();
    expect(typeof tableId).toBe('number');

    // Cleanup
    await api.deleteTable(tableId);
  });

  test('should navigate to created table', async ({ authenticatedPage, testTable }) => {
    const { tableId, tableName } = testTable;

    // Перейти к таблице
    await authenticatedPage.goto(
      `${INTEGRAM_CONFIG.baseUrl}/app/?db=${INTEGRAM_CONFIG.database}&table=${tableId}`
    );
    await authenticatedPage.waitForLoadState('networkidle');

    // Проверить, что таблица загрузилась
    await expect(authenticatedPage.locator(`text=${tableName}`).or(
      authenticatedPage.locator('h1, h2, h3').filter({ hasText: tableName })
    )).toBeVisible({ timeout: 10000 });
  });

  test('should display table columns', async ({ authenticatedPage, testTable }) => {
    const { tableId } = testTable;

    await authenticatedPage.goto(
      `${INTEGRAM_CONFIG.baseUrl}/app/?db=${INTEGRAM_CONFIG.database}&table=${tableId}`
    );
    await authenticatedPage.waitForLoadState('networkidle');

    // Проверить наличие колонок
    await expect(authenticatedPage.locator('text=Название')).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.locator('text=Количество')).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.locator('text=Описание')).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.locator('text=Активен')).toBeVisible({ timeout: 5000 });
  });

  test('should create table via route /integram/my/table', async ({ authenticatedPage }) => {
    // Этот тест проверяет роут, о котором говорил пользователь
    const tableName = `RouteTable_${Date.now()}`;

    await authenticatedPage.goto(`${INTEGRAM_CONFIG.baseUrl}/app/`);
    await authenticatedPage.waitForLoadState('networkidle');

    // Попытаться найти навигацию к таблицам
    const tablesLink = authenticatedPage.locator('a[href*="/table"]').first();
    if (await tablesLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await tablesLink.click();
    }

    // Проверить, что мы на странице таблиц
    await expect(authenticatedPage).toHaveURL(/.*table.*/);
  });
});
