/**
 * Orbity Database Setup Service
 *
 * This service handles the creation of all database types and initial data
 * for the Orbity platform in INTEGRA database.
 *
 * Issue #2990 - Orbity: Stage 1 - Basic Infrastructure and INTEGRA Data Types
 *
 * Architecture:
 * - Uses IntegramClient to communicate with INTEGRA API
 * - Creates 28 types (15 main + 13 dictionaries)
 * - Initializes reference data with proper values
 * - Follows the schema defined in docs/INTEGRA/ORBITY_DATABASE_SCHEMA.md
 */

import { IntegramClient } from '../../utils/IntegramClient.js'

/**
 * INTEGRA Base Type IDs
 * These are standard type IDs in INTEGRA
 */
const BASE_TYPE_IDS = {
  SHORT: 1,      // Short string
  MEMO: 2,       // Long text
  NUMBER: 3,     // Numeric value
  DATE: 4,       // Date
  DATETIME: 5,   // Date and time
  FILE: 6,       // File attachment
  REFERENCE: 7   // Reference to another object
}

/**
 * Orbity Database Setup Service
 */
class OrbityDatabaseSetupService {
  constructor() {
    this.client = null
    this.sessionId = null
    this.database = 'orbity'
    this.createdTypes = {}
    this.logger = console
  }

  /**
   * Initialize service with authentication
   */
  async initialize(login, password) {
    try {
      this.client = new IntegramClient({
        database: this.database,
        baseURL: process.env.INTEGRAM_API_URL || 'https://dev.example.integram.io:5443/integram'
      })

      // Authenticate
      const authResult = await this.client.auth(login, password)

      if (!authResult.success) {
        throw new Error(`Authentication failed: ${authResult.error}`)
      }

      this.sessionId = authResult.sessionId
      this.logger.info(`[OrbitySetup] Authenticated successfully. Session: ${this.sessionId}`)

      return { success: true }
    } catch (error) {
      this.logger.error('[OrbitySetup] Initialization failed:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Create all Orbity types in the correct order
   */
  async setupDatabase() {
    try {
      this.logger.info('[OrbitySetup] Starting database setup...')

      // Step 1: Create all dictionary types first (no dependencies)
      await this.createDictionaries()

      // Step 2: Create main entity types
      await this.createMainEntities()

      // Step 3: Create linking tables
      await this.createLinkingTables()

      // Step 4: Initialize reference data
      await this.initializeReferenceData()

      this.logger.info('[OrbitySetup] Database setup completed successfully!')

      return {
        success: true,
        message: 'Orbity database created successfully',
        createdTypes: Object.keys(this.createdTypes).length,
        types: this.createdTypes
      }
    } catch (error) {
      this.logger.error('[OrbitySetup] Setup failed:', error)
      return {
        success: false,
        error: error.message,
        createdTypes: this.createdTypes
      }
    }
  }

  /**
   * Step 1: Create dictionary types
   */
  async createDictionaries() {
    this.logger.info('[OrbitySetup] Creating dictionaries...')

    const dictionaries = [
      { name: 'СтатусыПользователей', description: 'User status dictionary' },
      { name: 'КатегорииНавыков', description: 'Skill categories' },
      { name: 'УровниНавыков', description: 'Skill levels' },
      { name: 'Роли', description: 'User roles' },
      { name: 'СтатусыПроектов', description: 'Project statuses' },
      { name: 'ТипыЗадач', description: 'Task types' },
      { name: 'СтатусыЗадач', description: 'Task statuses' },
      { name: 'СтатусыКонтроля', description: 'Control statuses' },
      { name: 'СтатусыНаставничества', description: 'Mentorship statuses' },
      { name: 'ТипыТранзакций', description: 'Transaction types' },
      { name: 'СтатусыТранзакций', description: 'Transaction statuses' },
      { name: 'СтатусыУлучшений', description: 'Improvement statuses' }
    ]

    for (const dict of dictionaries) {
      const typeId = await this.createType(dict.name, BASE_TYPE_IDS.SHORT)
      this.createdTypes[dict.name] = typeId
      this.logger.info(`  ✓ Created: ${dict.name} (ID: ${typeId})`)
    }
  }

  /**
   * Step 2: Create main entity types with their requisites
   */
  async createMainEntities() {
    this.logger.info('[OrbitySetup] Creating main entities...')

    // Пользователи (Users)
    const usersId = await this.createType('Пользователи', BASE_TYPE_IDS.SHORT)
    this.createdTypes['Пользователи'] = usersId
    await this.addRequisite(usersId, 'ФИО', BASE_TYPE_IDS.SHORT, true)
    await this.addRequisite(usersId, 'Email', BASE_TYPE_IDS.SHORT, true)
    await this.addRequisite(usersId, 'Телефон', BASE_TYPE_IDS.SHORT, false)
    await this.addRequisite(usersId, 'ДатаРегистрации', BASE_TYPE_IDS.DATE, true)
    await this.addReferenceRequisite(usersId, 'Статус', this.createdTypes['СтатусыПользователей'], true)
    await this.addRequisite(usersId, 'Фото', BASE_TYPE_IDS.FILE, false)
    this.logger.info(`  ✓ Created: Пользователи with requisites`)

    // КатегорииНавыков fields
    const categoryId = this.createdTypes['КатегорииНавыков']
    await this.addRequisite(categoryId, 'Название', BASE_TYPE_IDS.SHORT, true)
    await this.addRequisite(categoryId, 'Описание', BASE_TYPE_IDS.MEMO, false)
    await this.addRequisite(categoryId, 'Иконка', BASE_TYPE_IDS.SHORT, false)
    this.logger.info(`  ✓ Updated: КатегорииНавыков with requisites`)

    // Навыки (Skills)
    const skillsId = await this.createType('Навыки', BASE_TYPE_IDS.SHORT)
    this.createdTypes['Навыки'] = skillsId
    await this.addRequisite(skillsId, 'Название', BASE_TYPE_IDS.SHORT, true)
    await this.addRequisite(skillsId, 'Описание', BASE_TYPE_IDS.MEMO, false)
    await this.addRequisite(skillsId, 'БазоваяСтавка', BASE_TYPE_IDS.NUMBER, true)
    await this.addReferenceRequisite(skillsId, 'Категория', categoryId, true)
    this.logger.info(`  ✓ Created: Навыки with requisites`)

    // УровниНавыков fields
    const levelsId = this.createdTypes['УровниНавыков']
    await this.addRequisite(levelsId, 'Название', BASE_TYPE_IDS.SHORT, true)
    await this.addRequisite(levelsId, 'Описание', BASE_TYPE_IDS.MEMO, false)
    await this.addRequisite(levelsId, 'КоэффициентВремени', BASE_TYPE_IDS.NUMBER, true)
    await this.addRequisite(levelsId, 'КоэффициентОплаты', BASE_TYPE_IDS.NUMBER, true)
    this.logger.info(`  ✓ Updated: УровниНавыков with requisites`)

    // Роли fields
    const rolesId = this.createdTypes['Роли']
    await this.addRequisite(rolesId, 'Название', BASE_TYPE_IDS.SHORT, true)
    await this.addRequisite(rolesId, 'Описание', BASE_TYPE_IDS.MEMO, false)
    await this.addRequisite(rolesId, 'Приоритет', BASE_TYPE_IDS.NUMBER, true)
    this.logger.info(`  ✓ Updated: Роли with requisites`)

    // Проекты (Projects)
    const projectsId = await this.createType('Проекты', BASE_TYPE_IDS.SHORT)
    this.createdTypes['Проекты'] = projectsId
    await this.addRequisite(projectsId, 'Название', BASE_TYPE_IDS.SHORT, true)
    await this.addRequisite(projectsId, 'Описание', BASE_TYPE_IDS.MEMO, false)
    await this.addReferenceRequisite(projectsId, 'Заказчик', usersId, true)
    await this.addReferenceRequisite(projectsId, 'Статус', this.createdTypes['СтатусыПроектов'], true)
    await this.addRequisite(projectsId, 'ДатаНачала', BASE_TYPE_IDS.DATE, true)
    await this.addRequisite(projectsId, 'ДатаОкончания', BASE_TYPE_IDS.DATE, false)
    await this.addRequisite(projectsId, 'Бюджет', BASE_TYPE_IDS.NUMBER, false)
    this.logger.info(`  ✓ Created: Проекты with requisites`)

    // ТипыЗадач fields
    const taskTypesId = this.createdTypes['ТипыЗадач']
    await this.addRequisite(taskTypesId, 'Название', BASE_TYPE_IDS.SHORT, true)
    await this.addRequisite(taskTypesId, 'Описание', BASE_TYPE_IDS.MEMO, false)
    this.logger.info(`  ✓ Updated: ТипыЗадач with requisites`)

    // Задачи (Tasks)
    const tasksId = await this.createType('Задачи', BASE_TYPE_IDS.SHORT)
    this.createdTypes['Задачи'] = tasksId
    await this.addReferenceRequisite(tasksId, 'Проект', projectsId, true)
    await this.addRequisite(tasksId, 'Название', BASE_TYPE_IDS.SHORT, true)
    await this.addRequisite(tasksId, 'Описание', BASE_TYPE_IDS.MEMO, false)
    await this.addReferenceRequisite(tasksId, 'ТипЗадачи', taskTypesId, true)
    await this.addReferenceRequisite(tasksId, 'ТребуемыеНавыки', skillsId, true, true) // multiselect
    await this.addRequisite(tasksId, 'ПлановоеВремя', BASE_TYPE_IDS.NUMBER, false)
    await this.addReferenceRequisite(tasksId, 'Статус', this.createdTypes['СтатусыЗадач'], true)
    await this.addRequisite(tasksId, 'Приоритет', BASE_TYPE_IDS.NUMBER, true)
    this.logger.info(`  ✓ Created: Задачи with requisites`)
  }

  /**
   * Step 3: Create linking tables
   */
  async createLinkingTables() {
    this.logger.info('[OrbitySetup] Creating linking tables...')

    // ПользователиРоли
    const userRolesId = await this.createType('ПользователиРоли', BASE_TYPE_IDS.SHORT)
    this.createdTypes['ПользователиРоли'] = userRolesId
    await this.addReferenceRequisite(userRolesId, 'Пользователь', this.createdTypes['Пользователи'], true)
    await this.addReferenceRequisite(userRolesId, 'Роль', this.createdTypes['Роли'], true)
    await this.addRequisite(userRolesId, 'ДатаНазначения', BASE_TYPE_IDS.DATE, true)
    this.logger.info(`  ✓ Created: ПользователиРоли`)

    // НавыкиПользователей
    const userSkillsId = await this.createType('НавыкиПользователей', BASE_TYPE_IDS.SHORT)
    this.createdTypes['НавыкиПользователей'] = userSkillsId
    await this.addReferenceRequisite(userSkillsId, 'Пользователь', this.createdTypes['Пользователи'], true)
    await this.addReferenceRequisite(userSkillsId, 'Навык', this.createdTypes['Навыки'], true)
    await this.addReferenceRequisite(userSkillsId, 'Уровень', this.createdTypes['УровниНавыков'], true)
    await this.addRequisite(userSkillsId, 'КоличествоВыполнений', BASE_TYPE_IDS.NUMBER, true)
    await this.addRequisite(userSkillsId, 'ДатаПолучения', BASE_TYPE_IDS.DATE, true)
    this.logger.info(`  ✓ Created: НавыкиПользователей`)

    // ВыполнениеЗадач
    const taskExecutionId = await this.createType('ВыполнениеЗадач', BASE_TYPE_IDS.SHORT)
    this.createdTypes['ВыполнениеЗадач'] = taskExecutionId
    await this.addReferenceRequisite(taskExecutionId, 'Задача', this.createdTypes['Задачи'], true)
    await this.addReferenceRequisite(taskExecutionId, 'Исполнитель', this.createdTypes['Пользователи'], true)
    await this.addReferenceRequisite(taskExecutionId, 'Наставник', this.createdTypes['Пользователи'], false)
    await this.addRequisite(taskExecutionId, 'ДатаНачала', BASE_TYPE_IDS.DATETIME, true)
    await this.addRequisite(taskExecutionId, 'ДатаОкончания', BASE_TYPE_IDS.DATETIME, false)
    await this.addRequisite(taskExecutionId, 'ФактическоеВремя', BASE_TYPE_IDS.NUMBER, false)
    await this.addReferenceRequisite(taskExecutionId, 'СтатусКонтроля', this.createdTypes['СтатусыКонтроля'], false)
    this.logger.info(`  ✓ Created: ВыполнениеЗадач`)

    // СвязиНаставничества
    const mentorshipId = await this.createType('СвязиНаставничества', BASE_TYPE_IDS.SHORT)
    this.createdTypes['СвязиНаставничества'] = mentorshipId
    await this.addReferenceRequisite(mentorshipId, 'Наставник', this.createdTypes['Пользователи'], true)
    await this.addReferenceRequisite(mentorshipId, 'Стажер', this.createdTypes['Пользователи'], true)
    await this.addReferenceRequisite(mentorshipId, 'Навык', this.createdTypes['Навыки'], true)
    await this.addRequisite(mentorshipId, 'ДатаНачала', BASE_TYPE_IDS.DATE, true)
    await this.addRequisite(mentorshipId, 'ДатаОкончания', BASE_TYPE_IDS.DATE, false)
    await this.addReferenceRequisite(mentorshipId, 'Статус', this.createdTypes['СтатусыНаставничества'], true)
    await this.addRequisite(mentorshipId, 'КоличествоЗанятий', BASE_TYPE_IDS.NUMBER, true)
    this.logger.info(`  ✓ Created: СвязиНаставничества`)

    // Ставки
    const ratesId = await this.createType('Ставки', BASE_TYPE_IDS.SHORT)
    this.createdTypes['Ставки'] = ratesId
    await this.addReferenceRequisite(ratesId, 'Пользователь', this.createdTypes['Пользователи'], true)
    await this.addRequisite(ratesId, 'Ставка', BASE_TYPE_IDS.NUMBER, true)
    await this.addRequisite(ratesId, 'ДатаУстановки', BASE_TYPE_IDS.DATE, true)
    await this.addRequisite(ratesId, 'ПричинаИзменения', BASE_TYPE_IDS.MEMO, false)
    this.logger.info(`  ✓ Created: Ставки`)

    // Транзакции
    const transactionsId = await this.createType('Транзакции', BASE_TYPE_IDS.SHORT)
    this.createdTypes['Транзакции'] = transactionsId
    await this.addReferenceRequisite(transactionsId, 'Пользователь', this.createdTypes['Пользователи'], true)
    await this.addRequisite(transactionsId, 'Сумма', BASE_TYPE_IDS.NUMBER, true)
    await this.addReferenceRequisite(transactionsId, 'Тип', this.createdTypes['ТипыТранзакций'], true)
    await this.addRequisite(transactionsId, 'Дата', BASE_TYPE_IDS.DATETIME, true)
    await this.addReferenceRequisite(transactionsId, 'Статус', this.createdTypes['СтатусыТранзакций'], true)
    await this.addReferenceRequisite(transactionsId, 'СвязаннаяЗадача', this.createdTypes['Задачи'], false)
    this.logger.info(`  ✓ Created: Транзакции`)

    // ВидеоИнструкции
    const videosId = await this.createType('ВидеоИнструкции', BASE_TYPE_IDS.SHORT)
    this.createdTypes['ВидеоИнструкции'] = videosId
    await this.addReferenceRequisite(videosId, 'Навык', this.createdTypes['Навыки'], true)
    await this.addRequisite(videosId, 'Название', BASE_TYPE_IDS.SHORT, true)
    await this.addRequisite(videosId, 'Описание', BASE_TYPE_IDS.MEMO, false)
    await this.addRequisite(videosId, 'URLВидео', BASE_TYPE_IDS.SHORT, true)
    await this.addRequisite(videosId, 'Длительность', BASE_TYPE_IDS.NUMBER, false)
    await this.addReferenceRequisite(videosId, 'Автор', this.createdTypes['Пользователи'], true)
    this.logger.info(`  ✓ Created: ВидеоИнструкции`)

    // ТехнологическиеУлучшения
    const improvementsId = await this.createType('ТехнологическиеУлучшения', BASE_TYPE_IDS.SHORT)
    this.createdTypes['ТехнологическиеУлучшения'] = improvementsId
    await this.addReferenceRequisite(improvementsId, 'Автор', this.createdTypes['Пользователи'], true)
    await this.addReferenceRequisite(improvementsId, 'Навык', this.createdTypes['Навыки'], true)
    await this.addRequisite(improvementsId, 'Описание', BASE_TYPE_IDS.MEMO, true)
    await this.addRequisite(improvementsId, 'УлучшениеНорматива', BASE_TYPE_IDS.NUMBER, false)
    await this.addReferenceRequisite(improvementsId, 'Статус', this.createdTypes['СтатусыУлучшений'], true)
    await this.addRequisite(improvementsId, 'ДатаСоздания', BASE_TYPE_IDS.DATE, true)
    await this.addRequisite(improvementsId, 'КоличествоПрименений', BASE_TYPE_IDS.NUMBER, true)
    this.logger.info(`  ✓ Created: ТехнологическиеУлучшения`)
  }

  /**
   * Step 4: Initialize reference data
   */
  async initializeReferenceData() {
    this.logger.info('[OrbitySetup] Initializing reference data...')

    // Initialize dictionaries with default values
    await this.initUserStatuses()
    await this.initSkillLevels()
    await this.initRoles()
    await this.initProjectStatuses()
    await this.initTaskTypes()
    await this.initTaskStatuses()
    await this.initControlStatuses()
    await this.initMentorshipStatuses()
    await this.initTransactionTypes()
    await this.initTransactionStatuses()
    await this.initImprovementStatuses()

    this.logger.info('[OrbitySetup] Reference data initialized')
  }

  /**
   * Helper: Create a type
   */
  async createType(name, baseTypeId) {
    try {
      const result = await this.client.createType(name, baseTypeId)
      if (result && result.id) {
        return result.id
      }
      throw new Error(`Failed to create type ${name}`)
    } catch (error) {
      this.logger.error(`Error creating type ${name}:`, error)
      throw error
    }
  }

  /**
   * Helper: Add a requisite (field) to a type
   */
  async addRequisite(typeId, name, requisiteTypeId, required = false) {
    try {
      const result = await this.client.addRequisite(typeId, requisiteTypeId)
      if (result && result.id) {
        // Save requisite name
        await this.client.saveAlias(result.id, name)

        // Set required flag if needed
        if (required) {
          await this.client.toggleRequired(result.id)
        }

        return result.id
      }
      throw new Error(`Failed to add requisite ${name}`)
    } catch (error) {
      this.logger.error(`Error adding requisite ${name}:`, error)
      throw error
    }
  }

  /**
   * Helper: Add a reference requisite
   */
  async addReferenceRequisite(typeId, name, refTypeId, required = false, multiselect = false) {
    try {
      // First add requisite
      const requisiteId = await this.addRequisite(typeId, name, BASE_TYPE_IDS.SHORT, required)

      // Convert to reference
      await this.client.createReference(requisiteId)

      // Set reference type
      await this.client.setReferenceType(requisiteId, refTypeId)

      // Enable multiselect if needed
      if (multiselect) {
        await this.client.toggleMultiselect(requisiteId)
      }

      return requisiteId
    } catch (error) {
      this.logger.error(`Error adding reference requisite ${name}:`, error)
      throw error
    }
  }

  /**
   * Initialize user statuses
   */
  async initUserStatuses() {
    const typeId = this.createdTypes['СтатусыПользователей']
    const statuses = ['Активен', 'Заблокирован', 'На модерации']

    for (const status of statuses) {
      await this.client.createObject(typeId, status)
    }
  }

  /**
   * Initialize skill levels
   */
  async initSkillLevels() {
    const typeId = this.createdTypes['УровниНавыков']
    const levels = [
      { name: 'Стажер', timeCoeff: 2.0, payCoeff: 0.5 },
      { name: 'Специалист', timeCoeff: 1.0, payCoeff: 1.0 },
      { name: 'Мастер', timeCoeff: 0.7, payCoeff: 1.5 }
    ]

    for (const level of levels) {
      await this.client.createObject(typeId, level.name, null, {
        'КоэффициентВремени': level.timeCoeff,
        'КоэффициентОплаты': level.payCoeff
      })
    }
  }

  /**
   * Initialize roles
   */
  async initRoles() {
    const typeId = this.createdTypes['Роли']
    const roles = [
      { name: 'Заказчик', priority: 1 },
      { name: 'Исполнитель', priority: 2 },
      { name: 'Наставник', priority: 3 },
      { name: 'Руководитель', priority: 4 }
    ]

    for (const role of roles) {
      await this.client.createObject(typeId, role.name, null, {
        'Приоритет': role.priority
      })
    }
  }

  /**
   * Initialize project statuses
   */
  async initProjectStatuses() {
    const typeId = this.createdTypes['СтатусыПроектов']
    const statuses = ['Новый', 'В работе', 'Завершен', 'Отменен']

    for (const status of statuses) {
      await this.client.createObject(typeId, status)
    }
  }

  /**
   * Initialize task types
   */
  async initTaskTypes() {
    const typeId = this.createdTypes['ТипыЗадач']
    const types = ['Разработка', 'Дизайн', 'Тестирование', 'Документация', 'Консультация']

    for (const type of types) {
      await this.client.createObject(typeId, type)
    }
  }

  /**
   * Initialize task statuses
   */
  async initTaskStatuses() {
    const typeId = this.createdTypes['СтатусыЗадач']
    const statuses = ['Новая', 'Назначена', 'В работе', 'На проверке', 'Завершена', 'Отклонена']

    for (const status of statuses) {
      await this.client.createObject(typeId, status)
    }
  }

  /**
   * Initialize control statuses
   */
  async initControlStatuses() {
    const typeId = this.createdTypes['СтатусыКонтроля']
    const statuses = ['Ожидает проверки', 'Пройден', 'Не пройден']

    for (const status of statuses) {
      await this.client.createObject(typeId, status)
    }
  }

  /**
   * Initialize mentorship statuses
   */
  async initMentorshipStatuses() {
    const typeId = this.createdTypes['СтатусыНаставничества']
    const statuses = ['Активно', 'Завершено', 'Приостановлено']

    for (const status of statuses) {
      await this.client.createObject(typeId, status)
    }
  }

  /**
   * Initialize transaction types
   */
  async initTransactionTypes() {
    const typeId = this.createdTypes['ТипыТранзакций']
    const types = ['Оплата за работу', 'Пассивный доход', 'Вывод средств', 'Пополнение']

    for (const type of types) {
      await this.client.createObject(typeId, type)
    }
  }

  /**
   * Initialize transaction statuses
   */
  async initTransactionStatuses() {
    const typeId = this.createdTypes['СтатусыТранзакций']
    const statuses = ['Ожидает обработки', 'Обработана', 'Отменена']

    for (const status of statuses) {
      await this.client.createObject(typeId, status)
    }
  }

  /**
   * Initialize improvement statuses
   */
  async initImprovementStatuses() {
    const typeId = this.createdTypes['СтатусыУлучшений']
    const statuses = ['На рассмотрении', 'Одобрено', 'Внедрено', 'Отклонено']

    for (const status of statuses) {
      await this.client.createObject(typeId, status)
    }
  }

  /**
   * Stage 6: Add quality control fields to ВыполнениеЗадач
   *
   * Adds 3-level quality control fields:
   * - Level 1 (Self-control): executor checks their own work
   * - Level 2 (Mentor/peer control): mentor or peer review
   * - Level 3 (Customer control): customer approval
   */
  async setupStage6QualityControl() {
    try {
      this.logger.info('[OrbitySetup] Adding Stage 6 quality control fields...')

      // Get ВыполнениеЗадач type ID
      const dict = await this.client.getDictionary()
      const taskExecutionType = dict.types.find(t => t.name === 'ВыполнениеЗадач')

      if (!taskExecutionType) {
        throw new Error('ВыполнениеЗадач type not found. Please run initial setup first.')
      }

      const taskExecutionId = taskExecutionType.id
      const usersTypeId = dict.types.find(t => t.name === 'Пользователи')?.id
      const controlStatusesTypeId = dict.types.find(t => t.name === 'СтатусыКонтроля')?.id

      if (!usersTypeId || !controlStatusesTypeId) {
        throw new Error('Required types not found. Please run initial setup first.')
      }

      // Add Level 1 Quality Control fields
      await this.addReferenceRequisite(taskExecutionId, 'КонтрольУровень1Статус', controlStatusesTypeId, false)
      await this.addRequisite(taskExecutionId, 'КонтрольУровень1Комментарий', BASE_TYPE_IDS.MEMO, false)
      await this.addRequisite(taskExecutionId, 'КонтрольУровень1Дата', BASE_TYPE_IDS.DATETIME, false)
      await this.addReferenceRequisite(taskExecutionId, 'КонтрольУровень1Проверяющий', usersTypeId, false)
      this.logger.info('  ✓ Added Level 1 quality control fields')

      // Add Level 2 Quality Control fields
      await this.addReferenceRequisite(taskExecutionId, 'КонтрольУровень2Статус', controlStatusesTypeId, false)
      await this.addRequisite(taskExecutionId, 'КонтрольУровень2Комментарий', BASE_TYPE_IDS.MEMO, false)
      await this.addRequisite(taskExecutionId, 'КонтрольУровень2Дата', BASE_TYPE_IDS.DATETIME, false)
      await this.addReferenceRequisite(taskExecutionId, 'КонтрольУровень2Проверяющий', usersTypeId, false)
      this.logger.info('  ✓ Added Level 2 quality control fields')

      // Add Level 3 Quality Control fields
      await this.addReferenceRequisite(taskExecutionId, 'КонтрольУровень3Статус', controlStatusesTypeId, false)
      await this.addRequisite(taskExecutionId, 'КонтрольУровень3Комментарий', BASE_TYPE_IDS.MEMO, false)
      await this.addRequisite(taskExecutionId, 'КонтрольУровень3Дата', BASE_TYPE_IDS.DATETIME, false)
      await this.addReferenceRequisite(taskExecutionId, 'КонтрольУровень3Проверяющий', usersTypeId, false)
      this.logger.info('  ✓ Added Level 3 quality control fields')

      // Add result documentation fields
      await this.addRequisite(taskExecutionId, 'ФотоРезультата', BASE_TYPE_IDS.FILE, false)
      this.logger.info('  ✓ Added photo/video result field')

      // Add quality rating field (1-5)
      await this.addRequisite(taskExecutionId, 'ОценкаКачества', BASE_TYPE_IDS.NUMBER, false)
      this.logger.info('  ✓ Added quality rating field')

      this.logger.info('[OrbitySetup] Stage 6 quality control fields added successfully!')

      return {
        success: true,
        message: 'Stage 6 quality control fields added to ВыполнениеЗадач'
      }
    } catch (error) {
      this.logger.error('[OrbitySetup] Stage 6 setup failed:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Stage 6: Create ЕжедневныеОтчеты table
   *
   * Daily reports for project managers
   */
  async setupStage6DailyReports() {
    try {
      this.logger.info('[OrbitySetup] Creating ЕжедневныеОтчеты table...')

      const dict = await this.client.getDictionary()
      const projectsTypeId = dict.types.find(t => t.name === 'Проекты')?.id
      const tasksTypeId = dict.types.find(t => t.name === 'Задачи')?.id

      if (!projectsTypeId || !tasksTypeId) {
        throw new Error('Required types not found. Please run initial setup first.')
      }

      // Create ЕжедневныеОтчеты type
      const reportsId = await this.createType('ЕжедневныеОтчеты', BASE_TYPE_IDS.SHORT)
      this.createdTypes['ЕжедневныеОтчеты'] = reportsId

      // Add fields
      await this.addReferenceRequisite(reportsId, 'Проект', projectsTypeId, true)
      await this.addRequisite(reportsId, 'Дата', BASE_TYPE_IDS.DATE, true)
      await this.addRequisite(reportsId, 'Содержание', BASE_TYPE_IDS.MEMO, false) // HTML content
      await this.addReferenceRequisite(reportsId, 'ВыполненныеЗадачи', tasksTypeId, false, true) // multiselect
      await this.addRequisite(reportsId, 'ПрогрессПроекта', BASE_TYPE_IDS.NUMBER, false) // percentage
      await this.addRequisite(reportsId, 'Проблемы', BASE_TYPE_IDS.MEMO, false)
      await this.addRequisite(reportsId, 'Прогноз', BASE_TYPE_IDS.MEMO, false)
      await this.addRequisite(reportsId, 'ОтправленЗаказчику', BASE_TYPE_IDS.NUMBER, false) // 0 or 1 (boolean)

      this.logger.info('  ✓ Created ЕжедневныеОтчеты table')

      this.logger.info('[OrbitySetup] Daily reports table created successfully!')

      return {
        success: true,
        message: 'Daily reports table created',
        typeId: reportsId
      }
    } catch (error) {
      this.logger.error('[OrbitySetup] Daily reports setup failed:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Get setup status
   */
  async getSetupStatus() {
    try {
      // Check if types exist by getting dictionary
      const dict = await this.client.getDictionary()

      const expectedTypes = [
        'Пользователи', 'Роли', 'ПользователиРоли',
        'КатегорииНавыков', 'Навыки', 'УровниНавыков', 'НавыкиПользователей',
        'Проекты', 'Задачи', 'ВыполнениеЗадач',
        'СвязиНаставничества', 'Ставки', 'Транзакции',
        'ВидеоИнструкции', 'ТехнологическиеУлучшения'
      ]

      const foundTypes = []
      const missingTypes = []

      for (const typeName of expectedTypes) {
        const found = dict.types.find(t => t.name === typeName)
        if (found) {
          foundTypes.push(typeName)
        } else {
          missingTypes.push(typeName)
        }
      }

      return {
        isSetup: missingTypes.length === 0,
        foundTypes: foundTypes.length,
        totalTypes: expectedTypes.length,
        missingTypes
      }
    } catch (error) {
      this.logger.error('[OrbitySetup] Status check failed:', error)
      return {
        isSetup: false,
        error: error.message
      }
    }
  }
}

export { OrbityDatabaseSetupService }
