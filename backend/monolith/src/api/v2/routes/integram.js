/**
 * API v2 Integram Routes
 *
 * Современные endpoints для работы с Integram в формате JSON:API
 */

const express = require('express');
const router = express.Router();
const { createResource, createPaginationLinks } = require('../middleware/jsonapi');

/**
 * GET /api/v2/integram/databases/:database/types
 * Получить список таблиц (dictionary)
 */
router.get('/databases/:database/types', async (req, res) => {
  try {
    const { database } = req.params;

    // TODO: Интеграция с существующим Integram API
    // Пока возвращаем mock данные для демонстрации формата

    const mockTypes = [
      {
        typeId: 'type_clients',
        typeName: 'Клиенты',
        typeAlias: 'clients',
        description: 'Справочник клиентов компании',
        icon: 'users',
        color: '#3B82F6',
        objectCount: 150,
        isSystem: false,
        isDeleted: false,
        permissions: {
          canRead: true,
          canCreate: true,
          canUpdate: true,
          canDelete: false
        }
      },
      {
        typeId: 'type_projects',
        typeName: 'Проекты',
        typeAlias: 'projects',
        description: 'Список проектов',
        icon: 'briefcase',
        color: '#10B981',
        objectCount: 45,
        isSystem: false,
        isDeleted: false,
        permissions: {
          canRead: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true
        }
      }
    ];

    const data = mockTypes.map(type =>
      createResource('integram-type', type.typeId, type, {
        links: {
          self: `/api/v2/integram/databases/${database}/types/${type.typeId}`,
          metadata: `/api/v2/integram/databases/${database}/types/${type.typeId}/metadata`,
          objects: `/api/v2/integram/databases/${database}/types/${type.typeId}/objects`
        },
        meta: {
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-12-20T15:30:00Z'
        }
      })
    );

    res.jsonApi.success(data, {
      meta: {
        total: mockTypes.length,
        database: database,
        requestId: req.id
      },
      links: {
        self: `/api/v2/integram/databases/${database}/types`
      }
    });
  } catch (error) {
    res.jsonApi.error({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      title: 'Failed to fetch types',
      detail: error.message
    }, 500);
  }
});

/**
 * GET /api/v2/integram/databases/:database/types/:typeId/metadata
 * Получить структуру таблицы
 */
router.get('/databases/:database/types/:typeId/metadata', async (req, res) => {
  try {
    const { database, typeId } = req.params;

    // Mock данные для демонстрации
    const mockMetadata = {
      typeInfo: {
        typeId: typeId,
        typeName: 'Клиенты',
        typeAlias: 'clients'
      },
      requisites: [
        {
          requisiteId: 'req_name',
          requisiteName: 'Название',
          requisiteAlias: 'name',
          dataType: 'string',
          isRequired: true,
          isUnique: false,
          isIndexed: true,
          defaultValue: null,
          constraints: {
            minLength: 1,
            maxLength: 255,
            pattern: null
          },
          uiSettings: {
            order: 1,
            visible: true,
            editable: true,
            width: 'medium'
          }
        },
        {
          requisiteId: 'req_email',
          requisiteName: 'Email',
          requisiteAlias: 'email',
          dataType: 'email',
          isRequired: true,
          isUnique: true,
          isIndexed: true,
          defaultValue: null,
          constraints: {
            pattern: '^[^@]+@[^@]+\\.[^@]+$'
          },
          uiSettings: {
            order: 2,
            visible: true,
            editable: true,
            width: 'medium'
          }
        },
        {
          requisiteId: 'req_status',
          requisiteName: 'Статус',
          requisiteAlias: 'status',
          dataType: 'reference',
          isRequired: true,
          isUnique: false,
          isIndexed: true,
          defaultValue: 'active',
          constraints: {
            referenceType: 'type_statuses',
            allowedValues: ['active', 'inactive', 'suspended']
          },
          uiSettings: {
            order: 3,
            visible: true,
            editable: true,
            width: 'small'
          }
        }
      ],
      subordinates: [
        {
          typeId: 'type_contacts',
          typeName: 'Контакты',
          linkRequisiteId: 'req_client_id'
        }
      ]
    };

    const data = createResource('integram-type-metadata', typeId, mockMetadata, {
      links: {
        self: `/api/v2/integram/databases/${database}/types/${typeId}/metadata`,
        objects: `/api/v2/integram/databases/${database}/types/${typeId}/objects`
      },
      meta: {
        requisiteCount: mockMetadata.requisites.length,
        subordinateCount: mockMetadata.subordinates.length
      }
    });

    res.jsonApi.success(data);
  } catch (error) {
    res.jsonApi.error({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      title: 'Failed to fetch type metadata',
      detail: error.message
    }, 500);
  }
});

/**
 * GET /api/v2/integram/databases/:database/types/:typeId/objects
 * Получить список объектов с фильтрацией и пагинацией
 */
router.get('/databases/:database/types/:typeId/objects', async (req, res) => {
  try {
    const { database, typeId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const sort = req.query.sort || '-updatedAt';

    // Mock данные
    const mockObjects = [
      {
        objectId: 'obj_client_001',
        typeId: typeId,
        requisites: {
          req_name: 'ООО "Ромашка"',
          req_email: 'info@romashka.ru',
          req_status: 'active',
          req_created_at: '2025-01-15T10:00:00Z',
          req_updated_at: '2025-12-20T15:30:00Z'
        },
        displayName: 'ООО "Ромашка"',
        isDeleted: false
      },
      {
        objectId: 'obj_client_002',
        typeId: typeId,
        requisites: {
          req_name: 'ООО "Василёк"',
          req_email: 'info@vasilek.ru',
          req_status: 'active',
          req_created_at: '2025-02-10T12:00:00Z',
          req_updated_at: '2025-12-21T10:15:00Z'
        },
        displayName: 'ООО "Василёк"',
        isDeleted: false
      }
    ];

    const total = mockObjects.length;

    const data = mockObjects.map(obj =>
      createResource('integram-object', obj.objectId, obj, {
        relationships: {
          type: {
            data: { type: 'integram-type', id: typeId }
          }
        },
        links: {
          self: `/api/v2/integram/databases/${database}/objects/${obj.objectId}`
        },
        meta: {
          version: 1,
          createdAt: obj.requisites.req_created_at,
          updatedAt: obj.requisites.req_updated_at,
          createdBy: 'user_admin',
          updatedBy: 'user_manager'
        }
      })
    );

    const baseUrl = `/api/v2/integram/databases/${database}/types/${typeId}/objects`;

    res.jsonApi.success(data, {
      meta: {
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        },
        sort,
        filter: req.query.filter || {}
      },
      links: createPaginationLinks(baseUrl, page, limit, total)
    });
  } catch (error) {
    res.jsonApi.error({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      title: 'Failed to fetch objects',
      detail: error.message
    }, 500);
  }
});

/**
 * POST /api/v2/integram/databases/:database/types/:typeId/objects
 * Создать новый объект
 */
router.post('/databases/:database/types/:typeId/objects', async (req, res) => {
  try {
    const { database, typeId } = req.params;
    const { data: requestData } = req.body;

    if (!requestData || requestData.type !== 'integram-object') {
      return res.jsonApi.error({
        status: 400,
        code: 'INVALID_REQUEST',
        title: 'Invalid request format',
        detail: 'Request data must have type "integram-object"'
      }, 400);
    }

    const requisites = requestData.attributes?.requisites;
    if (!requisites) {
      return res.jsonApi.error({
        status: 422,
        code: 'VALIDATION_ERROR',
        title: 'Validation error',
        detail: 'Requisites are required',
        source: {
          pointer: '/data/attributes/requisites'
        }
      }, 422);
    }

    // Mock создание объекта
    const newObjectId = `obj_${typeId}_${Date.now()}`;
    const now = new Date().toISOString();

    const newObject = {
      objectId: newObjectId,
      typeId: typeId,
      requisites: {
        ...requisites,
        req_created_at: now,
        req_updated_at: now
      },
      displayName: requisites.req_name || 'Новый объект',
      isDeleted: false
    };

    const data = createResource('integram-object', newObject.objectId, newObject, {
      links: {
        self: `/api/v2/integram/databases/${database}/objects/${newObject.objectId}`
      },
      meta: {
        version: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: 'user_current'
      }
    });

    const location = `/api/v2/integram/databases/${database}/objects/${newObject.objectId}`;

    res.jsonApi.created(data, location, {
      meta: {
        requestId: req.id,
        timestamp: now
      }
    });
  } catch (error) {
    res.jsonApi.error({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      title: 'Failed to create object',
      detail: error.message
    }, 500);
  }
});

/**
 * GET /api/v2/integram/databases/:database/objects/:objectId
 * Получить объект по ID
 */
router.get('/databases/:database/objects/:objectId', async (req, res) => {
  try {
    const { database, objectId } = req.params;

    // Mock данные
    const mockObject = {
      objectId: objectId,
      typeId: 'type_clients',
      requisites: {
        req_name: 'ООО "Ромашка"',
        req_email: 'info@romashka.ru',
        req_status: 'active',
        req_created_at: '2025-01-15T10:00:00Z',
        req_updated_at: '2025-12-20T15:30:00Z'
      },
      displayName: 'ООО "Ромашка"',
      isDeleted: false
    };

    const data = createResource('integram-object', mockObject.objectId, mockObject, {
      links: {
        self: `/api/v2/integram/databases/${database}/objects/${objectId}`
      },
      meta: {
        version: 3,
        createdAt: mockObject.requisites.req_created_at,
        updatedAt: mockObject.requisites.req_updated_at
      }
    });

    res.jsonApi.success(data);
  } catch (error) {
    res.jsonApi.error({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      title: 'Failed to fetch object',
      detail: error.message
    }, 500);
  }
});

/**
 * PATCH /api/v2/integram/databases/:database/objects/:objectId
 * Обновить объект
 */
router.patch('/databases/:database/objects/:objectId', async (req, res) => {
  try {
    const { database, objectId } = req.params;
    const { data: requestData } = req.body;

    if (!requestData || requestData.type !== 'integram-object') {
      return res.jsonApi.error({
        status: 400,
        code: 'INVALID_REQUEST',
        title: 'Invalid request format',
        detail: 'Request data must have type "integram-object"'
      }, 400);
    }

    const requisites = requestData.attributes?.requisites;

    // Mock обновление
    const now = new Date().toISOString();
    const updatedObject = {
      objectId: objectId,
      typeId: 'type_clients',
      requisites: {
        req_name: 'ООО "Ромашка"',
        req_email: 'info@romashka.ru',
        req_status: 'active',
        req_created_at: '2025-01-15T10:00:00Z',
        req_updated_at: now,
        ...requisites
      },
      displayName: requisites?.req_name || 'ООО "Ромашка"',
      isDeleted: false
    };

    const data = createResource('integram-object', updatedObject.objectId, updatedObject, {
      links: {
        self: `/api/v2/integram/databases/${database}/objects/${objectId}`
      },
      meta: {
        version: 4,
        createdAt: updatedObject.requisites.req_created_at,
        updatedAt: now
      }
    });

    res.jsonApi.success(data);
  } catch (error) {
    res.jsonApi.error({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      title: 'Failed to update object',
      detail: error.message
    }, 500);
  }
});

/**
 * DELETE /api/v2/integram/databases/:database/objects/:objectId
 * Удалить объект
 */
router.delete('/databases/:database/objects/:objectId', async (req, res) => {
  try {
    const { database, objectId } = req.params;

    // Mock удаление
    console.log(`Deleting object ${objectId} from database ${database}`);

    res.jsonApi.noContent();
  } catch (error) {
    res.jsonApi.error({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      title: 'Failed to delete object',
      detail: error.message
    }, 500);
  }
});

module.exports = router;
