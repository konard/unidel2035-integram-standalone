// russian-payment-tools.js - MCP инструменты для работы с российскими платежными системами
// Поддерживаемые системы: Lava.ru, Robokassa, ЮKassa, Tinkoff Kassa

const axios = require('axios');
const crypto = require('crypto');
const logger = require('../../utils/logger');

/**
 * Базовый класс для работы с платежными системами
 */
class PaymentProviderBase {
  constructor(config) {
    this.config = config;
    this.accountId = config.accountId;
  }

  async request(method, url, data = null, headers = {}) {
    try {
      const response = await axios({
        method,
        url,
        data,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      });
      return response.data;
    } catch (error) {
      logger.error(`API request failed for ${this.constructor.name}:`, error.message);
      throw error;
    }
  }
}

/**
 * Lava.ru API Integration
 * https://lava.ru/api
 */
class LavaPaymentProvider extends PaymentProviderBase {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey;
    this.shopId = config.shopId;
    this.baseUrl = 'https://api.lava.ru/v1';
  }

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
    };
  }

  async getBalance() {
    const data = await this.request('GET', `${this.baseUrl}/shops/${this.shopId}/balance`, null, this.getHeaders());
    return {
      available: data.balance,
      currency: data.currency || 'RUB',
      pending: data.pending || 0,
    };
  }

  async getTransactions({ startDate, endDate, limit = 100 }) {
    const params = new URLSearchParams({
      shop_id: this.shopId,
      limit: limit.toString(),
    });

    if (startDate) {
      params.append('date_from', new Date(startDate).toISOString());
    }
    if (endDate) {
      params.append('date_to', new Date(endDate).toISOString());
    }

    const data = await this.request('GET', `${this.baseUrl}/invoices?${params}`, null, this.getHeaders());

    return data.invoices?.map(invoice => ({
      id: invoice.id,
      amount: invoice.amount,
      currency: invoice.currency || 'RUB',
      status: invoice.status,
      description: invoice.description,
      createdAt: invoice.created_at,
      paidAt: invoice.paid_at,
      customer: invoice.customer,
      type: 'lava',
    })) || [];
  }

  async getPayouts({ startDate, endDate, limit = 100 }) {
    const params = new URLSearchParams({
      shop_id: this.shopId,
      limit: limit.toString(),
    });

    if (startDate) {
      params.append('date_from', new Date(startDate).toISOString());
    }
    if (endDate) {
      params.append('date_to', new Date(endDate).toISOString());
    }

    const data = await this.request('GET', `${this.baseUrl}/payouts?${params}`, null, this.getHeaders());

    return data.payouts?.map(payout => ({
      id: payout.id,
      amount: payout.amount,
      currency: payout.currency || 'RUB',
      status: payout.status,
      createdAt: payout.created_at,
      completedAt: payout.completed_at,
      type: 'lava',
    })) || [];
  }
}

/**
 * Robokassa API Integration
 * https://docs.robokassa.ru/
 */
class RobokassaPaymentProvider extends PaymentProviderBase {
  constructor(config) {
    super(config);
    this.merchantLogin = config.merchantLogin;
    this.password1 = config.password1; // для генерации подписи инвойсов
    this.password2 = config.password2; // для Result URL
    this.testMode = config.testMode || false;
    this.baseUrl = this.testMode ? 'https://auth.robokassa.ru/Merchant' : 'https://auth.robokassa.ru/Merchant';
  }

  generateSignature(params) {
    const str = params.join(':');
    // Security: Using SHA-256 instead of MD5 (CWE-327)
    // MD5 is cryptographically broken and unsuitable for security-critical operations
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  async getBalance() {
    // Robokassa не предоставляет прямого API для получения баланса
    // Используем OpState для проверки последних операций
    logger.warn('Robokassa does not provide direct balance API');
    return {
      available: 0,
      currency: 'RUB',
      pending: 0,
      note: 'Balance API not available for Robokassa',
    };
  }

  async getTransactions({ startDate, endDate, limit = 100 }) {
    // Используем OpStateExt для получения списка операций
    const params = {
      MerchantLogin: this.merchantLogin,
      Language: 'ru',
    };

    if (startDate) {
      params.DateFrom = new Date(startDate).toISOString().split('T')[0];
    }
    if (endDate) {
      params.DateTo = new Date(endDate).toISOString().split('T')[0];
    }

    // Генерация подписи для запроса
    const signatureParams = [this.merchantLogin, params.DateFrom || '', params.DateTo || '', this.password2];
    params.Signature = this.generateSignature(signatureParams);

    try {
      const queryString = new URLSearchParams(params).toString();
      const data = await this.request('GET', `${this.baseUrl}/WebService/Service.asmx/OpStateExt?${queryString}`);

      // Парсинг XML ответа (упрощенная версия)
      // В реальном приложении нужно использовать XML парсер
      logger.info('Robokassa transaction data received');

      return [];
    } catch (error) {
      logger.error('Failed to get Robokassa transactions:', error);
      return [];
    }
  }

  async getPayouts({ startDate, endDate, limit = 100 }) {
    // Robokassa в основном принимает платежи, выплаты делаются вручную
    logger.info('Robokassa payouts are managed manually');
    return [];
  }
}

/**
 * ЮKassa (YooKassa) API Integration
 * https://yookassa.ru/developers/api
 */
class YooKassaPaymentProvider extends PaymentProviderBase {
  constructor(config) {
    super(config);
    this.shopId = config.shopId;
    this.secretKey = config.secretKey;
    this.baseUrl = 'https://api.yookassa.ru/v3';
  }

  getHeaders() {
    const auth = Buffer.from(`${this.shopId}:${this.secretKey}`).toString('base64');
    return {
      'Authorization': `Basic ${auth}`,
      'Idempotence-Key': crypto.randomUUID(),
    };
  }

  async getBalance() {
    // ЮKassa не предоставляет API для баланса, но можно получить через личный кабинет
    logger.warn('YooKassa does not provide direct balance API');
    return {
      available: 0,
      currency: 'RUB',
      pending: 0,
      note: 'Balance API not available for YooKassa',
    };
  }

  async getTransactions({ startDate, endDate, limit = 100 }) {
    const params = {
      limit: Math.min(limit, 100),
    };

    if (startDate) {
      params.created_at = params.created_at || {};
      params.created_at.gte = new Date(startDate).toISOString();
    }
    if (endDate) {
      params.created_at = params.created_at || {};
      params.created_at.lte = new Date(endDate).toISOString();
    }

    const data = await this.request('GET', `${this.baseUrl}/payments?${new URLSearchParams(params)}`, null, this.getHeaders());

    return data.items?.map(payment => ({
      id: payment.id,
      amount: payment.amount.value,
      currency: payment.amount.currency,
      status: payment.status,
      description: payment.description,
      createdAt: payment.created_at,
      paidAt: payment.captured_at,
      customer: payment.metadata?.customer,
      type: 'yookassa',
    })) || [];
  }

  async getPayouts({ startDate, endDate, limit = 100 }) {
    const params = {
      limit: Math.min(limit, 100),
    };

    if (startDate) {
      params.created_at = params.created_at || {};
      params.created_at.gte = new Date(startDate).toISOString();
    }
    if (endDate) {
      params.created_at = params.created_at || {};
      params.created_at.lte = new Date(endDate).toISOString();
    }

    const data = await this.request('GET', `${this.baseUrl}/payouts?${new URLSearchParams(params)}`, null, this.getHeaders());

    return data.items?.map(payout => ({
      id: payout.id,
      amount: payout.amount.value,
      currency: payout.amount.currency,
      status: payout.status,
      createdAt: payout.created_at,
      completedAt: payout.deal?.completed_at,
      type: 'yookassa',
    })) || [];
  }

  async getRefunds({ startDate, endDate, limit = 100 }) {
    const params = {
      limit: Math.min(limit, 100),
    };

    if (startDate) {
      params.created_at = params.created_at || {};
      params.created_at.gte = new Date(startDate).toISOString();
    }
    if (endDate) {
      params.created_at = params.created_at || {};
      params.created_at.lte = new Date(endDate).toISOString();
    }

    const data = await this.request('GET', `${this.baseUrl}/refunds?${new URLSearchParams(params)}`, null, this.getHeaders());

    return data.items?.map(refund => ({
      id: refund.id,
      amount: refund.amount.value,
      currency: refund.amount.currency,
      status: refund.status,
      paymentId: refund.payment_id,
      createdAt: refund.created_at,
      type: 'yookassa',
    })) || [];
  }
}

/**
 * Tinkoff Kassa API Integration
 * https://www.tinkoff.ru/kassa/develop/api/
 */
class TinkoffKassaPaymentProvider extends PaymentProviderBase {
  constructor(config) {
    super(config);
    this.terminalKey = config.terminalKey;
    this.password = config.password;
    this.baseUrl = 'https://securepay.tinkoff.ru/v2';
  }

  generateToken(params) {
    // Генерация токена для подписи запроса
    const values = { ...params, Password: this.password };
    const sortedKeys = Object.keys(values).sort();
    const concatenated = sortedKeys.map(key => values[key]).join('');
    return crypto.createHash('sha256').update(concatenated).digest('hex');
  }

  async makeRequest(endpoint, params = {}) {
    const requestParams = {
      TerminalKey: this.terminalKey,
      ...params,
    };
    requestParams.Token = this.generateToken(requestParams);

    return await this.request('POST', `${this.baseUrl}/${endpoint}`, requestParams);
  }

  async getBalance() {
    // Tinkoff Kassa не предоставляет прямого API для баланса
    logger.warn('Tinkoff Kassa does not provide direct balance API');
    return {
      available: 0,
      currency: 'RUB',
      pending: 0,
      note: 'Balance API not available for Tinkoff Kassa',
    };
  }

  async getTransactions({ startDate, endDate, limit = 100 }) {
    // Используем GetCardList и GetState для получения транзакций
    // Это упрощенная реализация, в реальности нужно делать множественные запросы

    try {
      // Tinkoff не предоставляет прямого метода для списка всех транзакций
      // Нужно использовать webhook уведомления или хранить PaymentId локально
      logger.warn('Tinkoff Kassa requires payment IDs to fetch transaction details');
      return [];
    } catch (error) {
      logger.error('Failed to get Tinkoff transactions:', error);
      return [];
    }
  }

  async getPayouts({ startDate, endDate, limit = 100 }) {
    // Tinkoff Kassa выплаты происходят автоматически на расчетный счет
    logger.info('Tinkoff Kassa payouts are automatic to settlement account');
    return [];
  }

  async getPaymentState(paymentId) {
    const data = await this.makeRequest('GetState', { PaymentId: paymentId });

    if (data.Success) {
      return {
        id: data.PaymentId,
        amount: data.Amount / 100, // Копейки в рубли
        currency: 'RUB',
        status: data.Status,
        orderId: data.OrderId,
        createdAt: data.CreatedDate,
        type: 'tinkoff',
      };
    }

    return null;
  }
}

/**
 * Главный класс MCP инструментов для российских платежных систем
 */
class RussianPaymentMCPTools {
  constructor() {
    this.providers = new Map();
  }

  /**
   * Инициализация провайдеров платежных систем
   */
  initializeProviders(configs) {
    configs.forEach((config, index) => {
      try {
        let provider;
        const accountId = `account_${index + 1}`;

        switch (config.type) {
          case 'lava':
            provider = new LavaPaymentProvider({ ...config, accountId });
            break;
          case 'robokassa':
            provider = new RobokassaPaymentProvider({ ...config, accountId });
            break;
          case 'yookassa':
            provider = new YooKassaPaymentProvider({ ...config, accountId });
            break;
          case 'tinkoff':
            provider = new TinkoffKassaPaymentProvider({ ...config, accountId });
            break;
          default:
            throw new Error(`Unknown payment provider type: ${config.type}`);
        }

        this.providers.set(accountId, {
          provider,
          type: config.type,
          name: config.name || config.type,
        });

        logger.info(`Initialized ${config.type} provider as ${accountId}`);
      } catch (error) {
        logger.error(`Failed to initialize provider ${index + 1}:`, error);
      }
    });
  }

  /**
   * Получить определения MCP инструментов
   */
  getToolsDefinition() {
    return [
      {
        name: 'payment-sync-accounts',
        description: 'Синхронизировать все платежные аккаунты и получить список',
        inputSchema: {
          type: 'object',
          properties: {
            forceRefresh: {
              type: 'boolean',
              description: 'Принудительное обновление кеша',
              default: false,
            },
          },
        },
      },
      {
        name: 'payment-get-balance',
        description: 'Получить баланс платежного аккаунта',
        inputSchema: {
          type: 'object',
          properties: {
            accountId: {
              type: 'string',
              description: 'ID аккаунта (account_1, account_2 и т.д.)',
            },
          },
          required: ['accountId'],
        },
      },
      {
        name: 'payment-list-transactions',
        description: 'Получить список транзакций (платежей)',
        inputSchema: {
          type: 'object',
          properties: {
            accountId: {
              type: 'string',
              description: 'ID аккаунта',
            },
            startDate: {
              type: 'string',
              description: 'Дата начала (YYYY-MM-DD)',
            },
            endDate: {
              type: 'string',
              description: 'Дата окончания (YYYY-MM-DD)',
            },
            limit: {
              type: 'number',
              description: 'Максимальное количество записей',
              default: 100,
            },
          },
          required: ['accountId'],
        },
      },
      {
        name: 'payment-list-payouts',
        description: 'Получить список выплат на расчетный счет',
        inputSchema: {
          type: 'object',
          properties: {
            accountId: {
              type: 'string',
              description: 'ID аккаунта',
            },
            startDate: {
              type: 'string',
              description: 'Дата начала',
            },
            endDate: {
              type: 'string',
              description: 'Дата окончания',
            },
            limit: {
              type: 'number',
              default: 100,
            },
          },
          required: ['accountId'],
        },
      },
      {
        name: 'payment-get-refunds',
        description: 'Получить список возвратов (только для YooKassa)',
        inputSchema: {
          type: 'object',
          properties: {
            accountId: {
              type: 'string',
              description: 'ID аккаунта',
            },
            startDate: {
              type: 'string',
              description: 'Дата начала',
            },
            endDate: {
              type: 'string',
              description: 'Дата окончания',
            },
            limit: {
              type: 'number',
              default: 100,
            },
          },
          required: ['accountId'],
        },
      },
    ];
  }

  /**
   * Выполнить MCP инструмент
   */
  async executeTool(name, args) {
    const toolHandlers = {
      'payment-sync-accounts': () => this.syncAccounts(args),
      'payment-get-balance': () => this.getBalance(args),
      'payment-list-transactions': () => this.listTransactions(args),
      'payment-list-payouts': () => this.listPayouts(args),
      'payment-get-refunds': () => this.getRefunds(args),
    };

    const handler = toolHandlers[name];
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }

    return handler();
  }

  /**
   * Синхронизация всех аккаунтов
   */
  async syncAccounts({ forceRefresh = false }) {
    const results = [];

    for (const [accountId, { provider, type, name }] of this.providers.entries()) {
      try {
        const balance = await provider.getBalance();

        results.push({
          accountId,
          type,
          name,
          balance: balance.available,
          currency: balance.currency,
          pending: balance.pending,
          note: balance.note,
          synced: new Date().toISOString(),
        });

        logger.info(`Synced account ${accountId} (${type})`);
      } catch (error) {
        logger.error(`Failed to sync account ${accountId}:`, error);
        results.push({
          accountId,
          type,
          error: error.message,
        });
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `Синхронизировано ${results.length} платежных аккаунтов:\n\n${JSON.stringify(results, null, 2)}`,
        },
      ],
    };
  }

  /**
   * Получить баланс аккаунта
   */
  async getBalance({ accountId }) {
    const account = this.providers.get(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    const balance = await account.provider.getBalance();

    return {
      content: [
        {
          type: 'text',
          text: `Баланс аккаунта ${accountId} (${account.type}):\n\n${JSON.stringify(balance, null, 2)}`,
        },
      ],
    };
  }

  /**
   * Получить список транзакций
   */
  async listTransactions({ accountId, startDate, endDate, limit = 100 }) {
    const account = this.providers.get(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    const transactions = await account.provider.getTransactions({
      startDate,
      endDate,
      limit,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Найдено ${transactions.length} транзакций для ${accountId} (${account.type}):\n\n${JSON.stringify(transactions, null, 2)}`,
        },
      ],
      transactions,
    };
  }

  /**
   * Получить список выплат
   */
  async listPayouts({ accountId, startDate, endDate, limit = 100 }) {
    const account = this.providers.get(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    const payouts = await account.provider.getPayouts({
      startDate,
      endDate,
      limit,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Найдено ${payouts.length} выплат для ${accountId} (${account.type}):\n\n${JSON.stringify(payouts, null, 2)}`,
        },
      ],
      payouts,
    };
  }

  /**
   * Получить список возвратов (только YooKassa)
   */
  async getRefunds({ accountId, startDate, endDate, limit = 100 }) {
    const account = this.providers.get(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    if (account.type !== 'yookassa') {
      return {
        content: [
          {
            type: 'text',
            text: `Возвраты доступны только для YooKassa. Аккаунт ${accountId} имеет тип ${account.type}`,
          },
        ],
        refunds: [],
      };
    }

    const refunds = await account.provider.getRefunds({
      startDate,
      endDate,
      limit,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Найдено ${refunds.length} возвратов для ${accountId}:\n\n${JSON.stringify(refunds, null, 2)}`,
        },
      ],
      refunds,
    };
  }
}

module.exports = RussianPaymentMCPTools;
