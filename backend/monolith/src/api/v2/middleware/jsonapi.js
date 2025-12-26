/**
 * JSON:API 1.1 Middleware
 *
 * Обеспечивает соответствие всех ответов стандарту JSON:API 1.1
 * https://jsonapi.org/format/
 */

/**
 * Успешный JSON:API ответ
 */
function successResponse(data, options = {}) {
  const {
    included = null,
    meta = {},
    links = {},
    jsonapi = { version: '1.1', meta: { apiVersion: '2.0.0', implementation: 'integram-standalone' } }
  } = options;

  const response = {
    jsonapi,
    data
  };

  if (included && included.length > 0) {
    response.included = included;
  }

  if (Object.keys(meta).length > 0) {
    response.meta = {
      ...meta,
      timestamp: new Date().toISOString()
    };
  }

  if (Object.keys(links).length > 0) {
    response.links = links;
  }

  return response;
}

/**
 * Ошибка JSON:API
 */
function errorResponse(errors, options = {}) {
  const {
    meta = {},
    jsonapi = { version: '1.1' }
  } = options;

  // Нормализовать errors в массив
  const errorsArray = Array.isArray(errors) ? errors : [errors];

  const response = {
    jsonapi,
    errors: errorsArray.map(error => ({
      id: error.id || `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: String(error.status || error.statusCode || 500),
      code: error.code || 'INTERNAL_SERVER_ERROR',
      title: error.title || error.message || 'Internal Server Error',
      detail: error.detail || error.message,
      ...(error.source && { source: error.source }),
      ...(error.meta && { meta: error.meta })
    }))
  };

  if (Object.keys(meta).length > 0) {
    response.meta = {
      ...meta,
      timestamp: new Date().toISOString()
    };
  }

  return response;
}

/**
 * Middleware для добавления JSON:API helper методов в response
 */
function jsonApiMiddleware(req, res, next) {
  // Добавить helper методы в response объект
  res.jsonApi = {
    success: (data, options = {}) => {
      res.setHeader('Content-Type', 'application/vnd.api+json');
      return res.json(successResponse(data, options));
    },

    error: (errors, statusCode = 500, options = {}) => {
      res.setHeader('Content-Type', 'application/vnd.api+json');
      res.status(statusCode);
      return res.json(errorResponse(errors, options));
    },

    created: (data, location, options = {}) => {
      res.setHeader('Content-Type', 'application/vnd.api+json');
      if (location) {
        res.setHeader('Location', location);
      }
      res.status(201);
      return res.json(successResponse(data, options));
    },

    noContent: () => {
      res.status(204).end();
    }
  };

  // Проверить Content-Type для POST/PATCH/PUT
  if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
    const contentType = req.get('Content-Type');
    if (contentType && !contentType.includes('application/vnd.api+json') && !contentType.includes('application/json')) {
      return res.jsonApi.error({
        status: 415,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        title: 'Unsupported Media Type',
        detail: 'Content-Type must be application/vnd.api+json or application/json'
      }, 415);
    }
  }

  next();
}

/**
 * Error handler для JSON:API формата
 */
function jsonApiErrorHandler(err, req, res, next) {
  console.error('JSON:API Error:', err);

  // Определить статус код
  const statusCode = err.statusCode || err.status || 500;

  // Определить код ошибки
  let errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  if (statusCode === 400) errorCode = err.code || 'BAD_REQUEST';
  if (statusCode === 401) errorCode = err.code || 'UNAUTHORIZED';
  if (statusCode === 403) errorCode = err.code || 'FORBIDDEN';
  if (statusCode === 404) errorCode = err.code || 'NOT_FOUND';
  if (statusCode === 422) errorCode = err.code || 'VALIDATION_ERROR';
  if (statusCode === 429) errorCode = err.code || 'RATE_LIMIT_EXCEEDED';

  const error = {
    status: statusCode,
    code: errorCode,
    title: err.title || err.message || 'An error occurred',
    detail: err.detail || err.message,
    source: err.source,
    meta: err.meta
  };

  res.jsonApi.error(error, statusCode, {
    meta: {
      requestId: req.id || req.headers['x-request-id']
    }
  });
}

/**
 * Создать resource объект
 */
function createResource(type, id, attributes, options = {}) {
  const resource = {
    type,
    id: String(id)
  };

  if (attributes) {
    resource.attributes = attributes;
  }

  if (options.relationships) {
    resource.relationships = options.relationships;
  }

  if (options.links) {
    resource.links = options.links;
  }

  if (options.meta) {
    resource.meta = options.meta;
  }

  return resource;
}

/**
 * Создать relationship объект
 */
function createRelationship(type, id, options = {}) {
  const relationship = {
    data: id ? { type, id: String(id) } : null
  };

  if (options.links) {
    relationship.links = options.links;
  }

  if (options.meta) {
    relationship.meta = options.meta;
  }

  return relationship;
}

/**
 * Создать pagination links
 */
function createPaginationLinks(baseUrl, page, limit, total) {
  const totalPages = Math.ceil(total / limit);
  const links = {
    self: `${baseUrl}?page=${page}&limit=${limit}`,
    first: `${baseUrl}?page=1&limit=${limit}`,
    last: `${baseUrl}?page=${totalPages}&limit=${limit}`
  };

  if (page > 1) {
    links.prev = `${baseUrl}?page=${page - 1}&limit=${limit}`;
  } else {
    links.prev = null;
  }

  if (page < totalPages) {
    links.next = `${baseUrl}?page=${page + 1}&limit=${limit}`;
  } else {
    links.next = null;
  }

  return links;
}

module.exports = {
  jsonApiMiddleware,
  jsonApiErrorHandler,
  successResponse,
  errorResponse,
  createResource,
  createRelationship,
  createPaginationLinks
};
