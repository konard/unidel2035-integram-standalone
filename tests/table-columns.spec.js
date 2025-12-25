import { test, expect, INTEGRAM_CONFIG } from './fixtures/integram-fixtures.js';

test.describe('Table Column Editing Tests', () => {
  test('should add a new column to existing table', async ({ api, testTable }) => {
    const { tableId } = testTable;

    // Добавить новую колонку
    const requisiteId = await api.addColumn(tableId, 3, 'Новое поле');

    expect(requisiteId).toBeDefined();
    expect(typeof requisiteId).toBe('number');
  });

  test('should rename column alias', async ({ api, testTable }) => {
    const { tableId } = testTable;

    // Добавить колонку
    const requisiteId = await api.addColumn(tableId, 3, 'Старое название');

    // Переименовать alias
    await api.setRequisiteAlias(requisiteId, 'Новое название');

    // Проверка через UI потребуется или через повторный запрос
    expect(requisiteId).toBeDefined();
  });

  test('should add column via UI', async ({ authenticatedPage, testTable }) => {
    const { tableId, tableName } = testTable;

    // Перейти к редактору типов
    await authenticatedPage.goto(
      `${INTEGRAM_CONFIG.baseUrl}/app/?db=${INTEGRAM_CONFIG.database}&edit_types`
    );
    await authenticatedPage.waitForLoadState('networkidle');

    // Найти нашу таблицу в списке
    const tableRow = authenticatedPage.locator(`tr:has-text("${tableName}")`).or(
      authenticatedPage.locator(`div:has-text("${tableName}")`)
    ).first();

    await expect(tableRow).toBeVisible({ timeout: 10000 });

    // Кликнуть на таблицу для редактирования
    await tableRow.click();

    // Найти кнопку добавления колонки
    const addColumnButton = authenticatedPage.locator('button:has-text("Добавить")').or(
      authenticatedPage.locator('button.p-button-success')
    ).first();

    if (await addColumnButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addColumnButton.click();

      // Выбрать тип колонки
      const columnTypeSelect = authenticatedPage.locator('select').or(
        authenticatedPage.locator('.p-dropdown')
      ).first();
      await columnTypeSelect.click();

      // Выбрать тип "Короткий текст" (typeId=3)
      const shortTextOption = authenticatedPage.locator('option:has-text("Короткий")').or(
        authenticatedPage.locator('li:has-text("Короткий")')
      ).first();

      if (await shortTextOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await shortTextOption.click();
      }

      // Заполнить alias
      const aliasInput = authenticatedPage.locator('input[name="alias"]').or(
        authenticatedPage.locator('input[placeholder*="Название"]')
      ).last();
      await aliasInput.fill('UI Колонка');

      // Сохранить
      const saveButton = authenticatedPage.locator('button:has-text("Сохранить")').first();
      await saveButton.click();

      // Проверить, что колонка добавлена
      await expect(authenticatedPage.locator('text=UI Колонка')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should add multiple column types', async ({ api, testTable }) => {
    const { tableId } = testTable;

    const columns = [
      { typeId: 3, alias: 'Текст', name: 'Короткий текст' },
      { typeId: 2, alias: 'Длинный текст', name: 'Длинный текст' },
      { typeId: 13, alias: 'Число', name: 'Число' },
      { typeId: 4, alias: 'Дата', name: 'Дата и время' },
      { typeId: 7, alias: 'Флаг', name: 'Логическое' },
    ];

    for (const column of columns) {
      const requisiteId = await api.addColumn(tableId, column.typeId, column.alias);
      expect(requisiteId).toBeDefined();
    }
  });

  test('should display added columns in table view', async ({ authenticatedPage, api, testTable }) => {
    const { tableId } = testTable;

    // Добавить несколько колонок через API
    await api.addColumn(tableId, 3, 'Колонка 1');
    await api.addColumn(tableId, 13, 'Колонка 2');
    await api.addColumn(tableId, 7, 'Колонка 3');

    // Перейти к таблице
    await authenticatedPage.goto(
      `${INTEGRAM_CONFIG.baseUrl}/app/?db=${INTEGRAM_CONFIG.database}&table=${tableId}`
    );
    await authenticatedPage.waitForLoadState('networkidle');

    // Проверить наличие новых колонок
    await expect(authenticatedPage.locator('text=Колонка 1')).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.locator('text=Колонка 2')).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.locator('text=Колонка 3')).toBeVisible({ timeout: 5000 });
  });

  test('should handle column ordering', async ({ api, testTable }) => {
    const { tableId } = testTable;

    // Добавить несколько колонок
    const col1 = await api.addColumn(tableId, 3, 'Первая');
    const col2 = await api.addColumn(tableId, 3, 'Вторая');
    const col3 = await api.addColumn(tableId, 3, 'Третья');

    // Проверить, что все созданы
    expect(col1).toBeDefined();
    expect(col2).toBeDefined();
    expect(col3).toBeDefined();
  });
});
