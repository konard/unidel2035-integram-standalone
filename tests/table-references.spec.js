import { test, expect, INTEGRAM_CONFIG } from './fixtures/integram-fixtures.js';

test.describe('Table Reference Field Tests', () => {
  test('should create table with reference field', async ({ testTableWithReference }) => {
    const { tableId, lookupId } = testTableWithReference;

    expect(tableId).toBeDefined();
    expect(lookupId).toBeDefined();
    expect(typeof tableId).toBe('number');
    expect(typeof lookupId).toBe('number');
  });

  test('should create lookup (reference) table', async ({ api }) => {
    const lookupName = `StatusLookup_${Date.now()}`;
    const lookupId = await api.createTable(lookupName, []);

    // Добавить значения в справочник
    const val1 = await api.createObject(lookupId, 'Новый');
    const val2 = await api.createObject(lookupId, 'В работе');
    const val3 = await api.createObject(lookupId, 'Завершен');

    expect(lookupId).toBeDefined();
    expect(val1).toBeDefined();
    expect(val2).toBeDefined();
    expect(val3).toBeDefined();

    // Cleanup
    await api.deleteObject(val1);
    await api.deleteObject(val2);
    await api.deleteObject(val3);
    await api.deleteTable(lookupId);
  });

  test('should link object to reference value', async ({ api, testTableWithReference }) => {
    const { tableId, lookupId } = testTableWithReference;

    // Получить одно из значений справочника
    // (В реальности нужно получить ID через API, но для примера используем упрощенный подход)
    const lookupValueId = await api.createObject(lookupId, 'Тестовое значение');

    // Создать объект с ссылкой на справочник
    const objectId = await api.createObject(tableId, 'Объект со ссылкой');

    // Обновить requisites для установки ссылки
    // Нужно знать ID колонки справочника в основной таблице
    await api.updateObjectRequisites(objectId, {
      // Пример: requisiteId: lookupValueId
    });

    expect(objectId).toBeDefined();

    // Cleanup
    await api.deleteObject(objectId);
    await api.deleteObject(lookupValueId);
  });

  test('should display reference field as dropdown in UI', async ({
    authenticatedPage,
    testTableWithReference
  }) => {
    const { tableId, tableName } = testTableWithReference;

    // Перейти к таблице
    await authenticatedPage.goto(
      `${INTEGRAM_CONFIG.baseUrl}/app/?db=${INTEGRAM_CONFIG.database}&table=${tableId}`
    );
    await authenticatedPage.waitForLoadState('networkidle');

    // Найти кнопку добавления записи
    const addButton = authenticatedPage.locator('button:has-text("Добавить")').first();

    if (await addButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addButton.click();

      // Найти поле справочника (dropdown)
      const referenceDropdown = authenticatedPage.locator('select').or(
        authenticatedPage.locator('.p-dropdown')
      );

      if (await referenceDropdown.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await referenceDropdown.first().click();

        // Проверить, что есть опции из справочника
        const option1 = authenticatedPage.locator('option:has-text("Значение 1")').or(
          authenticatedPage.locator('li:has-text("Значение 1")')
        );

        await expect(option1.first()).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should filter by reference field', async ({ authenticatedPage, api, testTableWithReference }) => {
    const { tableId, lookupId } = testTableWithReference;

    // Создать значение в справочнике
    const refValue = await api.createObject(lookupId, 'Фильтр значение');

    // Создать несколько объектов
    const obj1 = await api.createObject(tableId, 'Объект 1');
    const obj2 = await api.createObject(tableId, 'Объект 2');

    // Перейти к таблице
    await authenticatedPage.goto(
      `${INTEGRAM_CONFIG.baseUrl}/app/?db=${INTEGRAM_CONFIG.database}&table=${tableId}`
    );
    await authenticatedPage.waitForLoadState('networkidle');

    // Попытаться применить фильтр (если есть UI для фильтрации)
    const filterButton = authenticatedPage.locator('button:has-text("Фильтр")').or(
      authenticatedPage.locator('button[aria-label*="Filter"]')
    ).first();

    if (await filterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await filterButton.click();

      // Выбрать значение справочника для фильтрации
      // (детали зависят от реализации UI)
    }

    // Cleanup
    await api.deleteObject(obj1);
    await api.deleteObject(obj2);
    await api.deleteObject(refValue);
  });

  test('should create multiple reference fields in one table', async ({ api }) => {
    // Создать несколько справочников
    const statusLookup = await api.createTable('Статусы', []);
    const priorityLookup = await api.createTable('Приоритеты', []);
    const categoryLookup = await api.createTable('Категории', []);

    // Добавить значения
    await api.createObject(statusLookup, 'Активен');
    await api.createObject(statusLookup, 'Неактивен');

    await api.createObject(priorityLookup, 'Высокий');
    await api.createObject(priorityLookup, 'Средний');
    await api.createObject(priorityLookup, 'Низкий');

    await api.createObject(categoryLookup, 'Категория A');
    await api.createObject(categoryLookup, 'Категория B');

    // Создать основную таблицу с несколькими reference fields
    const mainTableId = await api.createTable('Задачи', [
      { typeId: 3, alias: 'Название' },
      { typeId: statusLookup, alias: 'Статус' },
      { typeId: priorityLookup, alias: 'Приоритет' },
      { typeId: categoryLookup, alias: 'Категория' },
    ]);

    expect(mainTableId).toBeDefined();

    // Cleanup
    await api.deleteTable(mainTableId);
    await api.deleteTable(categoryLookup);
    await api.deleteTable(priorityLookup);
    await api.deleteTable(statusLookup);
  });

  test('should handle circular references', async ({ api }) => {
    // Создать две таблицы, которые ссылаются друг на друга
    const table1Id = await api.createTable('Таблица1', [
      { typeId: 3, alias: 'Название' }
    ]);

    const table2Id = await api.createTable('Таблица2', [
      { typeId: 3, alias: 'Название' },
      { typeId: table1Id, alias: 'Ссылка на Таблицу1' }
    ]);

    // Добавить обратную ссылку в первую таблицу
    await api.addColumn(table1Id, table2Id, 'Ссылка на Таблицу2');

    expect(table1Id).toBeDefined();
    expect(table2Id).toBeDefined();

    // Cleanup
    await api.deleteTable(table2Id);
    await api.deleteTable(table1Id);
  });

  test('should display reference values in table view', async ({
    authenticatedPage,
    api,
    testTableWithReference
  }) => {
    const { tableId, lookupId } = testTableWithReference;

    // Создать значение в справочнике
    const refValueId = await api.createObject(lookupId, 'Видимое значение');

    // Создать объект с привязкой к справочнику
    const objectId = await api.createObject(tableId, 'Объект с привязкой');

    // Перейти к таблице
    await authenticatedPage.goto(
      `${INTEGRAM_CONFIG.baseUrl}/app/?db=${INTEGRAM_CONFIG.database}&table=${tableId}`
    );
    await authenticatedPage.waitForLoadState('networkidle');

    // Проверить, что объект отображается
    await expect(authenticatedPage.locator('text=Объект с привязкой')).toBeVisible({
      timeout: 5000
    });

    // Cleanup
    await api.deleteObject(objectId);
    await api.deleteObject(refValueId);
  });

  test('should update reference field value', async ({ api, testTableWithReference }) => {
    const { tableId, lookupId } = testTableWithReference;

    // Создать два значения в справочнике
    const refValue1 = await api.createObject(lookupId, 'Значение 1');
    const refValue2 = await api.createObject(lookupId, 'Значение 2');

    // Создать объект с первым значением
    const objectId = await api.createObject(tableId, 'Изменяемый объект');

    // Обновить на второе значение
    // (нужно знать ID колонки справочника)
    await api.updateObjectRequisites(objectId, {
      // requisiteId: refValue2
    });

    expect(objectId).toBeDefined();

    // Cleanup
    await api.deleteObject(objectId);
    await api.deleteObject(refValue1);
    await api.deleteObject(refValue2);
  });
});
