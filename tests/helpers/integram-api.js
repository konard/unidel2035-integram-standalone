/**
 * Integram API Helper для тестов
 * Предоставляет методы для работы с Integram API напрямую
 */

export class IntegramAPI {
  constructor(baseUrl, database) {
    this.baseUrl = baseUrl;
    this.database = database;
    this.token = null;
    this.xsrfToken = null;
  }

  /**
   * Аутентификация в Integram
   */
  async authenticate(login, password) {
    const response = await fetch(`${this.baseUrl}/app/?_auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        db: this.database,
        login: login,
        password: password,
      }),
    });

    const cookies = response.headers.get('set-cookie');
    if (cookies) {
      const tokenMatch = cookies.match(/token=([^;]+)/);
      const xsrfMatch = cookies.match(/xsrf=([^;]+)/);

      if (tokenMatch) this.token = tokenMatch[1];
      if (xsrfMatch) this.xsrfToken = xsrfMatch[1];
    }

    return response.ok;
  }

  /**
   * Создать таблицу
   */
  async createTable(tableName, columns = []) {
    const response = await fetch(`${this.baseUrl}/app/?db=${this.database}&_d_save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': `token=${this.token}; xsrf=${this.xsrfToken}`,
        'X-XSRF-TOKEN': this.xsrfToken,
      },
      body: new URLSearchParams({
        name: tableName,
        base_id: '3', // Базовый тип для таблиц
        un: '0', // Not unique
      }),
    });

    const data = await response.json();
    const tableId = data.id;

    // Добавить колонки
    for (const column of columns) {
      await this.addColumn(tableId, column.typeId, column.alias);
    }

    return tableId;
  }

  /**
   * Добавить колонку в таблицу
   */
  async addColumn(tableId, requisiteTypeId, alias) {
    const response = await fetch(`${this.baseUrl}/app/?db=${this.database}&_d_add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': `token=${this.token}; xsrf=${this.xsrfToken}`,
        'X-XSRF-TOKEN': this.xsrfToken,
      },
      body: new URLSearchParams({
        id: tableId.toString(),
        t: requisiteTypeId.toString(),
      }),
    });

    const data = await response.json();
    const requisiteId = data.id;

    // Установить alias
    if (alias) {
      await this.setRequisiteAlias(requisiteId, alias);
    }

    return requisiteId;
  }

  /**
   * Установить alias для колонки
   */
  async setRequisiteAlias(requisiteId, alias) {
    await fetch(`${this.baseUrl}/app/?db=${this.database}&_d_alias`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': `token=${this.token}; xsrf=${this.xsrfToken}`,
        'X-XSRF-TOKEN': this.xsrfToken,
      },
      body: new URLSearchParams({
        id: requisiteId.toString(),
        alias: alias,
      }),
    });
  }

  /**
   * Удалить таблицу
   */
  async deleteTable(tableId) {
    await fetch(`${this.baseUrl}/app/?db=${this.database}&_d_del`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': `token=${this.token}; xsrf=${this.xsrfToken}`,
        'X-XSRF-TOKEN': this.xsrfToken,
      },
      body: new URLSearchParams({
        id: tableId.toString(),
      }),
    });
  }

  /**
   * Создать объект (запись)
   */
  async createObject(typeId, value, requisites = {}) {
    const params = new URLSearchParams({
      id: typeId.toString(),
      value: value,
      up: '1', // Independent object
    });

    const response = await fetch(`${this.baseUrl}/app/?db=${this.database}&_m_save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': `token=${this.token}; xsrf=${this.xsrfToken}`,
        'X-XSRF-TOKEN': this.xsrfToken,
      },
      body: params,
    });

    const data = await response.json();
    const objectId = data.id;

    // Установить requisites если есть
    if (Object.keys(requisites).length > 0) {
      await this.updateObjectRequisites(objectId, requisites);
    }

    return objectId;
  }

  /**
   * Обновить requisites объекта
   */
  async updateObjectRequisites(objectId, requisites) {
    const params = new URLSearchParams({
      id: objectId.toString(),
    });

    for (const [reqId, value] of Object.entries(requisites)) {
      params.append(reqId, value);
    }

    await fetch(`${this.baseUrl}/app/?db=${this.database}&_m_set`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': `token=${this.token}; xsrf=${this.xsrfToken}`,
        'X-XSRF-TOKEN': this.xsrfToken,
      },
      body: params,
    });
  }

  /**
   * Удалить объект
   */
  async deleteObject(objectId) {
    await fetch(`${this.baseUrl}/app/?db=${this.database}&_m_del`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': `token=${this.token}; xsrf=${this.xsrfToken}`,
        'X-XSRF-TOKEN': this.xsrfToken,
      },
      body: new URLSearchParams({
        id: objectId.toString(),
      }),
    });
  }
}
