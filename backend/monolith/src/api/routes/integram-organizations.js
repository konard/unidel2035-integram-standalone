/**
 * Integram Organizations API Routes
 *
 * RESTful API for managing organizations in Integram database.
 * Used by INN Analytics Agent to save FNS company data.
 *
 * Table: Организация (ID: 197000)
 */

import express from 'express'
import { body, param, query, validationResult } from 'express-validator'
import { IntegramClient } from '../../services/integram/integram-client.js'

const router = express.Router()

// Integram configuration
const INTEGRAM_CONFIG = {
  serverURL: 'https://example.integram.io',
  database: 'my'
}

// Table and requisite IDs for Организация (197000)
const ORGANIZATION_TYPE_ID = 197000

// Requisite IDs mapping
const REQUISITE_IDS = {
  description: '197002',      // Описание организации
  title: '197004',            // Заголовок
  date: '197006',             // Дата
  icon: '197017',             // Иконка
  user: '198172',             // User (reference)
  inn: '198195',              // ИНН
  ogrn: '198239',             // ОГРН
  oktmo: '198256',            // ОКТМО
  okfs: '198257',             // ОКФС
  okogu: '198258',            // ОКОГУ
  citizenship: '198259',      // Гражданство
  ogrnip: '198265',           // ОГРНИП
  kpp: '198266',              // КПП
  shortName: '198267',        // Краткое наименование
  fullAddress: '198268',      // Полный адрес
  postalCode: '198269',       // Почтовый индекс
  registrationDate: '198270', // Дата регистрации
  authorizedCapital: '198271', // Уставный капитал
  ceoName: '198272',          // ФИО руководителя
  ceoPosition: '198273',      // Должность руководителя
  ceoInn: '198274',           // ИНН руководителя
  fnsStatus: '198277',        // Статус ФНС (reference → 198196)
  gender: '198290',           // Пол (reference → 198235)
  legalForm: '198291',        // Правовая форма
  okvedActivity: '198294',    // Вид деятельности ОКВЭД (reference → 198200)
  industry: '209388',         // Отрасль (reference → 209386) - для Customer Journey
  monthlySalaries: '209399',  // Ежемесячные затраты на зарплаты - для Customer Journey
  employeeCount: '209401'     // Количество сотрудников - для Customer Journey
}

// Status mapping: FNS API status → Integram object ID
const STATUS_MAPPING = {
  'active': '198202',         // Действующее
  'liquidated': '198203',     // Ликвидировано
  'liquidating': '198204',    // В стадии ликвидации
  'reorganizing': '198205',   // Реорганизовано
  'bankrupt': '198206'        // Банкротство
}

/**
 * Validation middleware
 */
const validate = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    })
  }
  next()
}

/**
 * Get Integram client with authentication from request
 */
const getIntegramClient = (req) => {
  const token = req.cookies?.token || req.headers['x-integram-token']
  const xsrf = req.cookies?.xsrf || req.headers['x-integram-xsrf']

  if (!token || !xsrf) {
    return null
  }

  const client = new IntegramClient(INTEGRAM_CONFIG.serverURL, INTEGRAM_CONFIG.database)
  client.setAuth(token, xsrf)
  return client
}

/**
 * Format date for Integram API (DD.MM.YYYY)
 */
const formatDateForIntegram = (date) => {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''

  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()

  return `${day}.${month}.${year}`
}

/**
 * Map FNS company data to Integram requisites
 */
const mapCompanyToRequisites = (companyData, rawData = {}) => {
  const requisites = {}

  // Basic info
  if (companyData.inn) {
    requisites[REQUISITE_IDS.inn] = companyData.inn
  }

  if (companyData.ogrn) {
    requisites[REQUISITE_IDS.ogrn] = companyData.ogrn
  }

  if (companyData.kpp) {
    requisites[REQUISITE_IDS.kpp] = companyData.kpp
  }

  if (companyData.shortName) {
    requisites[REQUISITE_IDS.shortName] = companyData.shortName
  }

  // Address info
  if (companyData.address) {
    requisites[REQUISITE_IDS.fullAddress] = companyData.address
  }

  if (companyData.postalCode) {
    requisites[REQUISITE_IDS.postalCode] = companyData.postalCode
  }

  // Registration date
  if (companyData.registrationDate) {
    requisites[REQUISITE_IDS.registrationDate] = formatDateForIntegram(companyData.registrationDate)
  }

  // Financial data
  if (companyData.financial?.authorizedCapital) {
    requisites[REQUISITE_IDS.authorizedCapital] = String(companyData.financial.authorizedCapital)
  }

  // Leadership
  if (companyData.ceo) {
    requisites[REQUISITE_IDS.ceoName] = companyData.ceo
  }

  if (companyData.ceoPosition) {
    requisites[REQUISITE_IDS.ceoPosition] = companyData.ceoPosition
  }

  // Legal form
  if (companyData.legalForm) {
    requisites[REQUISITE_IDS.legalForm] = companyData.legalForm
  }

  // FNS Status (reference field)
  if (companyData.status && STATUS_MAPPING[companyData.status]) {
    requisites[REQUISITE_IDS.fnsStatus] = STATUS_MAPPING[companyData.status]
  }

  // OKVED (primary activity code)
  if (companyData.okved && companyData.okved.length > 0) {
    const primaryOkved = companyData.okved.find(o => o.isPrimary) || companyData.okved[0]
    if (primaryOkved) {
      requisites[REQUISITE_IDS.description] = `${primaryOkved.code} - ${primaryOkved.name}`
    }
  }

  // Use fields from companyData if available (already parsed)
  if (companyData.oktmo) {
    requisites[REQUISITE_IDS.oktmo] = companyData.oktmo
  }

  if (companyData.okfs) {
    requisites[REQUISITE_IDS.okfs] = companyData.okfs
  }

  if (companyData.okogu) {
    requisites[REQUISITE_IDS.okogu] = companyData.okogu
  }

  if (companyData.ogrnip) {
    requisites[REQUISITE_IDS.ogrnip] = companyData.ogrnip
  }

  if (companyData.ceoInn) {
    requisites[REQUISITE_IDS.ceoInn] = companyData.ceoInn
  }

  if (companyData.citizenship) {
    requisites[REQUISITE_IDS.citizenship] = companyData.citizenship
  }

  // Extract additional data from raw response if available (fallback)
  if (rawData?.registry?.items?.[0]) {
    const item = rawData.registry.items[0]

    if (!requisites[REQUISITE_IDS.ogrnip] && item.ОГРНИП) {
      requisites[REQUISITE_IDS.ogrnip] = item.ОГРНИП
    }

    if (!requisites[REQUISITE_IDS.oktmo] && item.ОКТМО) {
      requisites[REQUISITE_IDS.oktmo] = item.ОКТМО
    }

    if (!requisites[REQUISITE_IDS.okfs] && item.ОКФС?.Код) {
      requisites[REQUISITE_IDS.okfs] = item.ОКФС.Код
    }

    if (!requisites[REQUISITE_IDS.okogu] && item.ОКОГУ?.Код) {
      requisites[REQUISITE_IDS.okogu] = item.ОКОГУ.Код
    }

    if (!requisites[REQUISITE_IDS.ceoInn] && item.Руководитель?.ИНН) {
      requisites[REQUISITE_IDS.ceoInn] = item.Руководитель.ИНН
    }

    if (!requisites[REQUISITE_IDS.citizenship] && item.Гражданство?.Наим) {
      requisites[REQUISITE_IDS.citizenship] = item.Гражданство.Наим
    }
  }

  // Set current date
  requisites[REQUISITE_IDS.date] = formatDateForIntegram(new Date())

  // Default icon for organization
  requisites[REQUISITE_IDS.icon] = '🏢'

  // Title = company name
  if (companyData.name) {
    requisites[REQUISITE_IDS.title] = companyData.name
  }

  return requisites
}

/**
 * GET /api/integram/organizations
 * List organizations from Integram
 */
router.get('/', async (req, res) => {
  try {
    const client = getIntegramClient(req)
    if (!client) {
      return res.status(401).json({
        success: false,
        error: 'Integram authentication required'
      })
    }

    const { offset = 0, limit = 50 } = req.query

    const result = await client.getObjectList(ORGANIZATION_TYPE_ID, {
      offset: parseInt(offset),
      limit: parseInt(limit)
    })

    const organizations = result.object || []

    res.json({
      success: true,
      data: organizations,
      total: organizations.length
    })
  } catch (error) {
    console.error('[Integram Organizations API] List error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * GET /api/integram/organizations/search
 * Search organization by INN
 */
router.get(
  '/search',
  [query('inn').isString().notEmpty().withMessage('INN is required')],
  validate,
  async (req, res) => {
    try {
      const client = getIntegramClient(req)
      if (!client) {
        return res.status(401).json({
          success: false,
          error: 'Integram authentication required'
        })
      }

      const { inn } = req.query

      // Get all organizations and filter by INN
      const result = await client.getObjectList(ORGANIZATION_TYPE_ID, {
        offset: 0,
        limit: 1000
      })

      const organizations = result.object || []
      const reqs = result.reqs || {}

      // Find organization with matching INN
      const matching = organizations.filter(org => {
        const orgReqs = reqs[org.id] || {}
        return orgReqs[REQUISITE_IDS.inn] === inn
      })

      res.json({
        success: true,
        data: matching,
        found: matching.length > 0
      })
    } catch (error) {
      console.error('[Integram Organizations API] Search error:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }
)

/**
 * GET /api/integram/organizations/:id
 * Get organization by ID
 */
router.get(
  '/:id',
  [param('id').isNumeric().withMessage('Invalid organization ID')],
  validate,
  async (req, res) => {
    try {
      const client = getIntegramClient(req)
      if (!client) {
        return res.status(401).json({
          success: false,
          error: 'Integram authentication required'
        })
      }

      const { id } = req.params

      const result = await client.getObjectEditData(id)

      res.json({
        success: true,
        data: result
      })
    } catch (error) {
      console.error('[Integram Organizations API] Get error:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }
)

/**
 * POST /api/integram/organizations
 * Create new organization from FNS data
 */
router.post(
  '/',
  [
    body('name').isString().notEmpty().withMessage('Organization name is required'),
    body('companyData').isObject().withMessage('Company data is required'),
    body('rawData').optional().isObject()
  ],
  validate,
  async (req, res) => {
    try {
      const client = getIntegramClient(req)
      if (!client) {
        return res.status(401).json({
          success: false,
          error: 'Integram authentication required'
        })
      }

      const { name, companyData, rawData, userId } = req.body

      // Check for duplicates
      if (companyData.inn) {
        const searchResult = await client.getObjectList(ORGANIZATION_TYPE_ID, {
          offset: 0,
          limit: 1000
        })

        const organizations = searchResult.object || []
        const reqs = searchResult.reqs || {}

        const existing = organizations.find(org => {
          const orgReqs = reqs[org.id] || {}
          return orgReqs[REQUISITE_IDS.inn] === companyData.inn
        })

        if (existing) {
          return res.status(409).json({
            success: false,
            error: 'organization_exists',
            message: `Организация с ИНН ${companyData.inn} уже существует`,
            existingId: existing.id
          })
        }
      }

      // Map company data to requisites
      const requisites = mapCompanyToRequisites(companyData, rawData)

      // Add user ID if provided
      if (userId) {
        requisites[REQUISITE_IDS.user] = userId
      }

      // Create organization in Integram
      const result = await client.createObject(ORGANIZATION_TYPE_ID, name, requisites)

      res.status(201).json({
        success: true,
        data: result,
        message: 'Организация успешно создана'
      })
    } catch (error) {
      console.error('[Integram Organizations API] Create error:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }
)

/**
 * PUT /api/integram/organizations/:id
 * Update existing organization
 */
router.put(
  '/:id',
  [
    param('id').isNumeric().withMessage('Invalid organization ID'),
    body('name').optional().isString(),
    body('companyData').optional().isObject(),
    body('rawData').optional().isObject(),
    body('requisites').optional().isObject()
  ],
  validate,
  async (req, res) => {
    try {
      const client = getIntegramClient(req)
      if (!client) {
        return res.status(401).json({
          success: false,
          error: 'Integram authentication required'
        })
      }

      const { id } = req.params
      const { name, companyData, rawData, requisites: directRequisites } = req.body

      let requisites = directRequisites || {}

      // If companyData provided, map it to requisites
      if (companyData) {
        requisites = { ...requisites, ...mapCompanyToRequisites(companyData, rawData) }
      }

      // Update object in Integram
      const result = await client.saveObject(id, ORGANIZATION_TYPE_ID, name, requisites)

      res.json({
        success: true,
        data: result,
        message: 'Организация успешно обновлена'
      })
    } catch (error) {
      console.error('[Integram Organizations API] Update error:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }
)

/**
 * DELETE /api/integram/organizations/:id
 * Delete organization
 */
router.delete(
  '/:id',
  [param('id').isNumeric().withMessage('Invalid organization ID')],
  validate,
  async (req, res) => {
    try {
      const client = getIntegramClient(req)
      if (!client) {
        return res.status(401).json({
          success: false,
          error: 'Integram authentication required'
        })
      }

      const { id } = req.params

      const result = await client.deleteObject(id)

      res.json({
        success: true,
        data: result,
        message: 'Организация успешно удалена'
      })
    } catch (error) {
      console.error('[Integram Organizations API] Delete error:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }
)

/**
 * GET /api/integram/organizations/statuses
 * Get available FNS statuses from справочник
 */
router.get('/meta/statuses', async (req, res) => {
  try {
    const client = getIntegramClient(req)
    if (!client) {
      return res.status(401).json({
        success: false,
        error: 'Integram authentication required'
      })
    }

    // Get statuses from справочник (198196)
    const result = await client.getObjectList(198196, {})

    const statuses = (result.object || []).map(obj => ({
      id: obj.id,
      name: obj.val,
      apiKey: Object.entries(STATUS_MAPPING).find(([, v]) => v === obj.id)?.[0] || null
    }))

    res.json({
      success: true,
      data: statuses
    })
  } catch (error) {
    console.error('[Integram Organizations API] Get statuses error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * GET /api/integram/organizations/user/:userId
 * Get organization for a specific user (for Customer Journey)
 */
router.get(
  '/user/:userId',
  [param('userId').isString().notEmpty().withMessage('User ID is required')],
  validate,
  async (req, res) => {
    try {
      const client = getIntegramClient(req)
      if (!client) {
        return res.status(401).json({
          success: false,
          error: 'Integram authentication required'
        })
      }

      const { userId } = req.params

      // Get all organizations and filter by user field
      const result = await client.getObjectList(ORGANIZATION_TYPE_ID, {
        offset: 0,
        limit: 1000
      })

      const organizations = result.object || []
      const reqs = result.reqs || {}

      // Find organization with matching user ID
      const matching = organizations.filter(org => {
        const orgReqs = reqs[org.id] || {}
        return orgReqs[REQUISITE_IDS.user] === userId
      })

      if (matching.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No organization found for this user'
        })
      }

      // Return the first matching organization with full requisites
      const org = matching[0]
      const orgReqs = reqs[org.id] || {}

      res.json({
        success: true,
        data: {
          id: org.id,
          name: org.val,
          employeeCount: orgReqs[REQUISITE_IDS.employeeCount] || null,
          monthlySalaries: orgReqs[REQUISITE_IDS.monthlySalaries] || null,
          industry: orgReqs[REQUISITE_IDS.industry] || null,
          requisites: orgReqs
        }
      })
    } catch (error) {
      console.error('[Integram Organizations API] Get by user error:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }
)

/**
 * GET /api/integram/industries
 * Get list of industries from справочник (209386)
 */
router.get('/meta/industries', async (req, res) => {
  try {
    const client = getIntegramClient(req)
    if (!client) {
      return res.status(401).json({
        success: false,
        error: 'Integram authentication required'
      })
    }

    const INDUSTRY_TYPE_ID = 209386

    const result = await client.getObjectList(INDUSTRY_TYPE_ID, {
      offset: 0,
      limit: 1000
    })

    const industries = (result.object || []).map(obj => ({
      id: obj.id,
      name: obj.val
    }))

    res.json({
      success: true,
      data: industries
    })
  } catch (error) {
    console.error('[Integram Organizations API] Get industries error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * GET /api/integram/industries/search
 * Search industry by name
 */
router.get(
  '/meta/industries/search',
  [query('name').isString().notEmpty().withMessage('Industry name is required')],
  validate,
  async (req, res) => {
    try {
      const client = getIntegramClient(req)
      if (!client) {
        return res.status(401).json({
          success: false,
          error: 'Integram authentication required'
        })
      }

      const { name } = req.query
      const INDUSTRY_TYPE_ID = 209386

      const result = await client.getObjectList(INDUSTRY_TYPE_ID, {
        offset: 0,
        limit: 1000
      })

      const industries = result.object || []
      const found = industries.find(ind => ind.val === name)

      if (!found) {
        return res.status(404).json({
          success: false,
          error: 'Industry not found'
        })
      }

      res.json({
        success: true,
        data: {
          id: found.id,
          name: found.val
        }
      })
    } catch (error) {
      console.error('[Integram Organizations API] Search industry error:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }
)

export default router

export {
  ORGANIZATION_TYPE_ID,
  REQUISITE_IDS,
  STATUS_MAPPING,
  mapCompanyToRequisites
}
