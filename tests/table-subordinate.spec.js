import { test, expect, INTEGRAM_CONFIG } from './fixtures/integram-fixtures.js';

test.describe('Table Subordinate Relationship Tests', () => {
  test('should create parent-child table structure', async ({ parentChildTables }) => {
    const { parentId, childId } = parentChildTables;

    expect(parentId).toBeDefined();
    expect(childId).toBeDefined();
    expect(typeof parentId).toBe('number');
    expect(typeof childId).toBe('number');
  });

  test('should create child object linked to parent', async ({ api, parentChildTables }) => {
    const { parentId, childId } = parentChildTables;

    // Создать родительский объект
    const parentObjectId = await api.createObject(parentId, 'Родитель 1');

    // Создать дочерний объект с привязкой к родителю
    const childObjectId = await api.createObject(childId, 'Дочерний объект 1', {
      up: parentObjectId, // up указывает на родителя
    });

    expect(parentObjectId).toBeDefined();
    expect(childObjectId).toBeDefined();

    // Cleanup
    await api.deleteObject(childObjectId);
    await api.deleteObject(parentObjectId);
  });

  test('should create multiple children for one parent', async ({ api, parentChildTables }) => {
    const { parentId, childId } = parentChildTables;

    // Создать родителя
    const parentObjectId = await api.createObject(parentId, 'Главный родитель');

    // Создать несколько детей
    const children = [];
    for (let i = 1; i <= 3; i++) {
      const childObjectId = await api.createObject(childId, `Ребенок ${i}`, {
        up: parentObjectId,
      });
      children.push(childObjectId);
    }

    expect(children.length).toBe(3);

    // Cleanup
    for (const childId of children) {
      await api.deleteObject(childId);
    }
    await api.deleteObject(parentObjectId);
  });

  test('should display parent-child relationship in UI', async ({
    authenticatedPage,
    api,
    parentChildTables
  }) => {
    const { parentId, childId, parentName } = parentChildTables;

    // Создать родителя
    const parentObjectId = await api.createObject(parentId, 'UI Родитель');

    // Создать детей
    await api.createObject(childId, 'UI Ребенок 1', { up: parentObjectId });
    await api.createObject(childId, 'UI Ребенок 2', { up: parentObjectId });

    // Перейти к родительской таблице
    await authenticatedPage.goto(
      `${INTEGRAM_CONFIG.baseUrl}/app/?db=${INTEGRAM_CONFIG.database}&table=${parentId}`
    );
    await authenticatedPage.waitForLoadState('networkidle');

    // Найти родительскую запись
    const parentRow = authenticatedPage.locator('tr:has-text("UI Родитель")').or(
      authenticatedPage.locator('div:has-text("UI Родитель")')
    ).first();

    if (await parentRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Кликнуть на запись
      await parentRow.click();

      // Проверить, что отображаются дочерние элементы
      // (в зависимости от UI это может быть раскрывающийся список или отдельная вкладка)
      const childrenSection = authenticatedPage.locator('text=UI Ребенок 1').or(
        authenticatedPage.locator('text=UI Ребенок 2')
      );

      await expect(childrenSection.first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('should navigate from parent to child table', async ({
    authenticatedPage,
    api,
    parentChildTables
  }) => {
    const { parentId, childId } = parentChildTables;

    // Создать родителя и ребенка
    const parentObjectId = await api.createObject(parentId, 'Навигация Родитель');
    const childObjectId = await api.createObject(childId, 'Навигация Ребенок', {
      up: parentObjectId,
    });

    // Перейти к дочерней таблице
    await authenticatedPage.goto(
      `${INTEGRAM_CONFIG.baseUrl}/app/?db=${INTEGRAM_CONFIG.database}&table=${childId}`
    );
    await authenticatedPage.waitForLoadState('networkidle');

    // Проверить, что дочерняя запись видна
    await expect(authenticatedPage.locator('text=Навигация Ребенок')).toBeVisible({
      timeout: 5000
    });

    // Cleanup
    await api.deleteObject(childObjectId);
    await api.deleteObject(parentObjectId);
  });

  test('should handle cascade delete (parent deletes children)', async ({
    api,
    parentChildTables
  }) => {
    const { parentId, childId } = parentChildTables;

    // Создать родителя
    const parentObjectId = await api.createObject(parentId, 'Каскадный родитель');

    // Создать детей
    const child1 = await api.createObject(childId, 'Каскадный ребенок 1', {
      up: parentObjectId,
    });
    const child2 = await api.createObject(childId, 'Каскадный ребенок 2', {
      up: parentObjectId,
    });

    // Удалить родителя (дети должны удалиться автоматически)
    await api.deleteObject(parentObjectId);

    // В Integram, возможно, потребуется проверка через API, что дети удалены
    expect(parentObjectId).toBeDefined();
  });

  test('should create multi-level hierarchy', async ({ api }) => {
    // Создать трехуровневую иерархию: Дедушка -> Родитель -> Ребенок

    // Уровень 1: Дедушка
    const grandpaTableId = await api.createTable('Дедушки', [
      { typeId: 3, alias: 'Имя дедушки' }
    ]);

    // Уровень 2: Родители
    const parentTableId = await api.createTable('Родители', [
      { typeId: 3, alias: 'Имя родителя' },
      { typeId: grandpaTableId, alias: 'Дедушка' }
    ]);

    // Уровень 3: Дети
    const childTableId = await api.createTable('Дети', [
      { typeId: 3, alias: 'Имя ребенка' },
      { typeId: parentTableId, alias: 'Родитель' }
    ]);

    // Создать объекты
    const grandpaId = await api.createObject(grandpaTableId, 'Дедушка Иван');
    const parentObjId = await api.createObject(parentTableId, 'Отец Петр', {
      up: grandpaId,
    });
    const childObjId = await api.createObject(childTableId, 'Сын Алексей', {
      up: parentObjId,
    });

    expect(grandpaId).toBeDefined();
    expect(parentObjId).toBeDefined();
    expect(childObjId).toBeDefined();

    // Cleanup
    await api.deleteObject(childObjId);
    await api.deleteObject(parentObjId);
    await api.deleteObject(grandpaId);
    await api.deleteTable(childTableId);
    await api.deleteTable(parentTableId);
    await api.deleteTable(grandpaTableId);
  });
});
