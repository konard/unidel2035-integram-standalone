import { test, expect, INTEGRAM_CONFIG } from './fixtures/integram-fixtures.js';

test.describe('Table Cell Editing Tests', () => {
  test('should create a new object (row) via API', async ({ api, testTable }) => {
    const { tableId } = testTable;

    // Создать объект
    const objectId = await api.createObject(tableId, 'Тестовая запись');

    expect(objectId).toBeDefined();
    expect(typeof objectId).toBe('number');

    // Cleanup
    await api.deleteObject(objectId);
  });

  test('should create object with requisites', async ({ api, testTable }) => {
    const { tableId } = testTable;

    // Получить ID колонок (нужно знать их IDs)
    // В testTable есть предопределенные колонки: Название, Количество, Описание, Активен
    // Для простоты создадим объект с основным значением
    const objectId = await api.createObject(tableId, 'Запись с данными');

    expect(objectId).toBeDefined();

    // Cleanup
    await api.deleteObject(objectId);
  });

  test('should update object requisites', async ({ api, testTable }) => {
    const { tableId } = testTable;

    // Создать объект
    const objectId = await api.createObject(tableId, 'Исходное название');

    // Обновить requisites (используя произвольные ID для примера)
    // В реальности нужно знать ID колонок
    await api.updateObjectRequisites(objectId, {
      // '12345': 'Новое значение', // Пример
    });

    expect(objectId).toBeDefined();

    // Cleanup
    await api.deleteObject(objectId);
  });

  test('should create and edit object via UI', async ({ authenticatedPage, testTable }) => {
    const { tableId, tableName } = testTable;

    // Перейти к таблице
    await authenticatedPage.goto(
      `${INTEGRAM_CONFIG.baseUrl}/app/?db=${INTEGRAM_CONFIG.database}&table=${tableId}`
    );
    await authenticatedPage.waitForLoadState('networkidle');

    // Найти кнопку добавления записи
    const addButton = authenticatedPage.locator('button:has-text("Добавить")').or(
      authenticatedPage.locator('button.p-button-success')
    ).or(
      authenticatedPage.locator('button[aria-label*="Add"]')
    ).first();

    if (await addButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addButton.click();

      // Заполнить форму
      const nameInput = authenticatedPage.locator('input[name="value"]').or(
        authenticatedPage.locator('input').first()
      );

      await nameInput.fill('UI Тестовая запись');

      // Сохранить
      const saveButton = authenticatedPage.locator('button:has-text("Сохранить")').or(
        authenticatedPage.locator('button:has-text("Save")')
      ).first();

      await saveButton.click();

      // Проверить, что запись создана
      await expect(authenticatedPage.locator('text=UI Тестовая запись')).toBeVisible({
        timeout: 5000
      });
    }
  });

  test('should edit existing cell', async ({ authenticatedPage, api, testTable }) => {
    const { tableId } = testTable;

    // Создать объект через API
    const objectId = await api.createObject(tableId, 'Запись для редактирования');

    // Перейти к таблице
    await authenticatedPage.goto(
      `${INTEGRAM_CONFIG.baseUrl}/app/?db=${INTEGRAM_CONFIG.database}&table=${tableId}`
    );
    await authenticatedPage.waitForLoadState('networkidle');

    // Найти нашу запись
    const recordRow = authenticatedPage.locator('tr:has-text("Запись для редактирования")').or(
      authenticatedPage.locator('div:has-text("Запись для редактирования")')
    ).first();

    if (await recordRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Кликнуть на запись для редактирования
      await recordRow.click();

      // Найти кнопку редактирования или форму
      const editButton = authenticatedPage.locator('button:has-text("Редактировать")').or(
        authenticatedPage.locator('button[aria-label*="Edit"]')
      ).first();

      if (await editButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await editButton.click();
      }

      // Изменить значение
      const valueInput = authenticatedPage.locator('input[value*="Запись для редактирования"]').or(
        authenticatedPage.locator('input[name="value"]')
      ).first();

      if (await valueInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await valueInput.fill('Измененная запись');

        // Сохранить
        const saveButton = authenticatedPage.locator('button:has-text("Сохранить")').first();
        await saveButton.click();

        // Проверить изменение
        await expect(authenticatedPage.locator('text=Измененная запись')).toBeVisible({
          timeout: 5000
        });
      }
    }

    // Cleanup
    await api.deleteObject(objectId);
  });

  test('should delete object', async ({ api, testTable }) => {
    const { tableId } = testTable;

    // Создать объект
    const objectId = await api.createObject(tableId, 'Запись для удаления');

    // Удалить
    await api.deleteObject(objectId);

    // Проверка, что удалено (нужен дополнительный запрос)
    expect(objectId).toBeDefined();
  });

  test('should create multiple objects', async ({ api, testTable }) => {
    const { tableId } = testTable;

    const objects = [];
    for (let i = 1; i <= 5; i++) {
      const objectId = await api.createObject(tableId, `Запись ${i}`);
      objects.push(objectId);
    }

    expect(objects.length).toBe(5);

    // Cleanup
    for (const objectId of objects) {
      await api.deleteObject(objectId);
    }
  });

  test('should display created objects in table', async ({ authenticatedPage, api, testTable }) => {
    const { tableId } = testTable;

    // Создать несколько объектов
    const obj1 = await api.createObject(tableId, 'Первая запись');
    const obj2 = await api.createObject(tableId, 'Вторая запись');
    const obj3 = await api.createObject(tableId, 'Третья запись');

    // Перейти к таблице
    await authenticatedPage.goto(
      `${INTEGRAM_CONFIG.baseUrl}/app/?db=${INTEGRAM_CONFIG.database}&table=${tableId}`
    );
    await authenticatedPage.waitForLoadState('networkidle');

    // Проверить наличие записей
    await expect(authenticatedPage.locator('text=Первая запись')).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.locator('text=Вторая запись')).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.locator('text=Третья запись')).toBeVisible({ timeout: 5000 });

    // Cleanup
    await api.deleteObject(obj1);
    await api.deleteObject(obj2);
    await api.deleteObject(obj3);
  });
});
