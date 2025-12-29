/**
 * Payment Service
 *
 * Provides payment processing services using the unified payment API
 * from Phase 3 (backend/monolith/src/api/routes/payments.js)
 *
 * Features:
 * - Create payment intents
 * - Process payments
 * - Get payment history
 * - Generate invoices
 * - Handle payment webhooks
 *
 * Issue #2786 - Phase 4: Frontend Integration
 * Issue #4962 - Extended to support agent purchases and subscriptions
 */

import axios from 'axios'
import { logger } from '@/utils/logger'

const API_BASE = import.meta.env.VITE_ORCHESTRATOR_URL || 'http://localhost:8081/api'

/**
 * Payment types supported by the system
 */
export const PaymentType = {
  TOKEN_TOPUP: 'token_topup',
  AGENT_PURCHASE: 'agent_purchase',
  AGENT_SUBSCRIPTION: 'agent_subscription'
}

/**
 * Create payment intent for token top-up
 *
 * @param {Object} paymentData - Payment data
 * @param {string} paymentData.tokenId - Token ID to top up
 * @param {number} paymentData.amount - Amount in USD
 * @param {string} paymentData.currency - Currency code (USD, EUR, RUB)
 * @param {string} paymentData.paymentMethod - Payment method (card, yookassa, stripe)
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} Payment intent with client secret
 */
export async function createPaymentIntent(paymentData, accessToken) {
  try {
    logger.info('Creating payment intent', {
      tokenId: paymentData.tokenId,
      amount: paymentData.amount,
      currency: paymentData.currency
    })

    const response = await axios.post(
      `${API_BASE}/payments/create-intent`,
      {
        tokenId: paymentData.tokenId,
        amount: paymentData.amount,
        currency: paymentData.currency || 'USD',
        paymentMethod: paymentData.paymentMethod || 'card'
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to create payment intent')
    }

    const intent = response.data.data

    logger.info('Payment intent created', {
      intentId: intent.id,
      amount: intent.amount
    })

    return intent
  } catch (error) {
    logger.error('Failed to create payment intent', {
      error: error.message,
      tokenId: paymentData.tokenId
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to create payment intent')
  }
}

/**
 * Process payment for token top-up
 *
 * @param {Object} paymentData - Payment processing data
 * @param {string} paymentData.intentId - Payment intent ID
 * @param {string} paymentData.paymentMethodId - Payment method ID (from Stripe/YooKassa)
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} Payment result
 */
export async function processPayment(paymentData, accessToken) {
  try {
    logger.info('Processing payment', {
      intentId: paymentData.intentId
    })

    const response = await axios.post(
      `${API_BASE}/payments/process`,
      {
        intentId: paymentData.intentId,
        paymentMethodId: paymentData.paymentMethodId
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Payment processing failed')
    }

    const result = response.data.data

    logger.info('Payment processed successfully', {
      paymentId: result.paymentId,
      status: result.status
    })

    return result
  } catch (error) {
    logger.error('Payment processing failed', {
      error: error.message,
      intentId: paymentData.intentId
    })
    throw new Error(error.response?.data?.error || error.message || 'Payment processing failed')
  }
}

/**
 * Get payment history for current user
 *
 * @param {Object} options - Query options
 * @param {number} [options.limit] - Number of payments to fetch
 * @param {number} [options.offset] - Offset for pagination
 * @param {string} [options.startDate] - Start date filter
 * @param {string} [options.endDate] - End date filter
 * @param {string} [options.status] - Payment status filter (succeeded, pending, failed)
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Array>} List of payments
 */
export async function getPaymentHistory(options = {}, accessToken) {
  try {
    logger.info('Fetching payment history', options)

    const response = await axios.get(`${API_BASE}/payments/history`, {
      params: {
        limit: options.limit || 50,
        offset: options.offset || 0,
        startDate: options.startDate,
        endDate: options.endDate,
        status: options.status
      },
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch payment history')
    }

    const payments = response.data.data

    logger.info('Payment history fetched', {
      count: payments.length
    })

    return payments
  } catch (error) {
    logger.error('Failed to fetch payment history', {
      error: error.message
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to fetch payment history')
  }
}

/**
 * Get specific payment details
 *
 * @param {string} paymentId - Payment ID
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} Payment details
 */
export async function getPayment(paymentId, accessToken) {
  try {
    logger.info('Fetching payment details', { paymentId })

    const response = await axios.get(`${API_BASE}/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch payment details')
    }

    const payment = response.data.data

    logger.info('Payment details fetched', {
      paymentId,
      status: payment.status
    })

    return payment
  } catch (error) {
    logger.error('Failed to fetch payment details', {
      paymentId,
      error: error.message
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to fetch payment details')
  }
}

/**
 * Generate invoice for token usage
 *
 * @param {Object} invoiceData - Invoice data
 * @param {string} invoiceData.tokenId - Token ID
 * @param {string} invoiceData.startDate - Period start date
 * @param {string} invoiceData.endDate - Period end date
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} Invoice data
 */
export async function generateInvoice(invoiceData, accessToken) {
  try {
    logger.info('Generating invoice', {
      tokenId: invoiceData.tokenId,
      startDate: invoiceData.startDate,
      endDate: invoiceData.endDate
    })

    const response = await axios.post(
      `${API_BASE}/payments/generate-invoice`,
      {
        tokenId: invoiceData.tokenId,
        startDate: invoiceData.startDate,
        endDate: invoiceData.endDate
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to generate invoice')
    }

    const invoice = response.data.data

    logger.info('Invoice generated', {
      invoiceId: invoice.id,
      totalAmount: invoice.totalAmount
    })

    return invoice
  } catch (error) {
    logger.error('Failed to generate invoice', {
      error: error.message,
      tokenId: invoiceData.tokenId
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to generate invoice')
  }
}

/**
 * Get all invoices for current user
 *
 * @param {Object} options - Query options
 * @param {number} [options.limit] - Number of invoices to fetch
 * @param {number} [options.offset] - Offset for pagination
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Array>} List of invoices
 */
export async function getInvoices(options = {}, accessToken) {
  try {
    logger.info('Fetching invoices', options)

    const response = await axios.get(`${API_BASE}/payments/invoices`, {
      params: {
        limit: options.limit || 50,
        offset: options.offset || 0
      },
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch invoices')
    }

    const invoices = response.data.data

    logger.info('Invoices fetched', {
      count: invoices.length
    })

    return invoices
  } catch (error) {
    logger.error('Failed to fetch invoices', {
      error: error.message
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to fetch invoices')
  }
}

/**
 * Get payment methods for current user
 *
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Array>} List of saved payment methods
 */
export async function getPaymentMethods(accessToken) {
  try {
    logger.info('Fetching payment methods')

    const response = await axios.get(`${API_BASE}/payments/methods`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch payment methods')
    }

    const methods = response.data.data

    logger.info('Payment methods fetched', {
      count: methods.length
    })

    return methods
  } catch (error) {
    logger.error('Failed to fetch payment methods', {
      error: error.message
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to fetch payment methods')
  }
}

/**
 * Add new payment method
 *
 * @param {Object} methodData - Payment method data
 * @param {string} methodData.type - Method type (card, bank_account)
 * @param {Object} methodData.details - Method details (depends on type)
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} Created payment method
 */
export async function addPaymentMethod(methodData, accessToken) {
  try {
    logger.info('Adding payment method', {
      type: methodData.type
    })

    const response = await axios.post(
      `${API_BASE}/payments/methods`,
      {
        type: methodData.type,
        details: methodData.details
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to add payment method')
    }

    const method = response.data.data

    logger.info('Payment method added', {
      methodId: method.id
    })

    return method
  } catch (error) {
    logger.error('Failed to add payment method', {
      error: error.message
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to add payment method')
  }
}

/**
 * Remove payment method
 *
 * @param {string} methodId - Payment method ID
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} Success result
 */
export async function removePaymentMethod(methodId, accessToken) {
  try {
    logger.info('Removing payment method', { methodId })

    const response = await axios.delete(`${API_BASE}/payments/methods/${methodId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to remove payment method')
    }

    logger.info('Payment method removed', { methodId })

    return {
      success: true
    }
  } catch (error) {
    logger.error('Failed to remove payment method', {
      methodId,
      error: error.message
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to remove payment method')
  }
}

/**
 * Get pricing information for token packages
 *
 * @returns {Promise<Array>} List of token packages with pricing
 */
export async function getTokenPackages() {
  try {
    logger.info('Fetching token packages')

    const response = await axios.get(`${API_BASE}/payments/packages`)

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch token packages')
    }

    const packages = response.data.data

    logger.info('Token packages fetched', {
      count: packages.length
    })

    return packages
  } catch (error) {
    logger.error('Failed to fetch token packages', {
      error: error.message
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to fetch token packages')
  }
}

/**
 * Create universal payment intent for any payment type
 *
 * @param {Object} paymentData - Payment data
 * @param {string} paymentData.paymentType - Type of payment (token_topup, agent_purchase, agent_subscription)
 * @param {string} paymentData.userId - User ID
 * @param {number} paymentData.amount - Amount in specified currency
 * @param {string} paymentData.currency - Currency code (USD, EUR, RUB)
 * @param {string} paymentData.paymentMethod - Payment method (card, yookassa, stripe, sbp)
 * @param {Object} paymentData.metadata - Additional metadata (depends on payment type)
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} Payment intent with client secret
 */
export async function createUniversalPaymentIntent(paymentData, accessToken) {
  try {
    const {
      paymentType,
      userId,
      amount,
      currency = 'RUB',
      paymentMethod = 'card',
      metadata = {}
    } = paymentData

    logger.info('Creating universal payment intent', {
      paymentType,
      userId,
      amount,
      currency
    })

    // Build description based on payment type
    let description = ''
    switch (paymentType) {
      case PaymentType.TOKEN_TOPUP:
        description = `Пополнение токенов: ${metadata.tokens || 'N/A'} токенов`
        break
      case PaymentType.AGENT_PURCHASE:
        description = `Покупка агента: ${metadata.agentName || 'N/A'}`
        break
      case PaymentType.AGENT_SUBSCRIPTION:
        description = `Подписка на агента: ${metadata.agentName || 'N/A'} (${metadata.billingCycle || 'месяц'})`
        break
      default:
        description = 'Платёж'
    }

    const response = await axios.post(
      `${API_BASE}/payments/create`,
      {
        userId,
        amount,
        currency,
        description,
        provider: paymentMethod === 'sbp' ? 'yookassa' : paymentMethod,
        paymentMethod,
        metadata: {
          ...metadata,
          paymentType
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to create payment intent')
    }

    const intent = response.data.data

    logger.info('Payment intent created', {
      intentId: intent.id,
      paymentType,
      amount: intent.amount
    })

    return intent
  } catch (error) {
    logger.error('Failed to create universal payment intent', {
      error: error.message,
      paymentType: paymentData.paymentType
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to create payment intent')
  }
}

/**
 * Create agent purchase payment intent
 *
 * @param {Object} purchaseData - Purchase data
 * @param {string} purchaseData.agentId - Agent ID to purchase
 * @param {string} purchaseData.agentName - Agent name for description
 * @param {string} purchaseData.userId - User ID
 * @param {number} purchaseData.price - Price in specified currency
 * @param {string} purchaseData.currency - Currency code (USD, EUR, RUB)
 * @param {string} purchaseData.paymentMethod - Payment method
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} Payment intent
 */
export async function createAgentPurchaseIntent(purchaseData, accessToken) {
  return createUniversalPaymentIntent(
    {
      paymentType: PaymentType.AGENT_PURCHASE,
      userId: purchaseData.userId,
      amount: purchaseData.price,
      currency: purchaseData.currency || 'RUB',
      paymentMethod: purchaseData.paymentMethod || 'card',
      metadata: {
        agentId: purchaseData.agentId,
        agentName: purchaseData.agentName,
        purchaseType: 'one_time'
      }
    },
    accessToken
  )
}

/**
 * Create agent subscription payment intent
 *
 * @param {Object} subscriptionData - Subscription data
 * @param {string} subscriptionData.agentId - Agent ID
 * @param {string} subscriptionData.agentName - Agent name
 * @param {string} subscriptionData.userId - User ID
 * @param {number} subscriptionData.price - Subscription price
 * @param {string} subscriptionData.currency - Currency code
 * @param {string} subscriptionData.billingCycle - Billing cycle (monthly, yearly)
 * @param {string} subscriptionData.paymentMethod - Payment method
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} Payment intent
 */
export async function createAgentSubscriptionIntent(subscriptionData, accessToken) {
  return createUniversalPaymentIntent(
    {
      paymentType: PaymentType.AGENT_SUBSCRIPTION,
      userId: subscriptionData.userId,
      amount: subscriptionData.price,
      currency: subscriptionData.currency || 'RUB',
      paymentMethod: subscriptionData.paymentMethod || 'card',
      metadata: {
        agentId: subscriptionData.agentId,
        agentName: subscriptionData.agentName,
        billingCycle: subscriptionData.billingCycle || 'monthly',
        subscriptionType: 'recurring'
      }
    },
    accessToken
  )
}

/**
 * Process agent purchase after successful payment
 *
 * @param {string} paymentId - Payment transaction ID
 * @param {string} agentId - Agent ID
 * @param {string} userId - User ID
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} Purchase confirmation
 */
export async function processAgentPurchase(paymentId, agentId, userId, accessToken) {
  try {
    logger.info('Processing agent purchase', {
      paymentId,
      agentId,
      userId
    })

    const response = await axios.post(
      `${API_BASE}/agents/purchase`,
      {
        paymentId,
        agentId,
        userId
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to process agent purchase')
    }

    logger.info('Agent purchase processed', {
      agentId,
      userId
    })

    return response.data.data
  } catch (error) {
    logger.error('Failed to process agent purchase', {
      error: error.message,
      paymentId,
      agentId
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to process agent purchase')
  }
}

/**
 * Activate agent subscription after successful payment
 *
 * @param {string} paymentId - Payment transaction ID
 * @param {string} agentId - Agent ID
 * @param {string} userId - User ID
 * @param {string} billingCycle - Billing cycle
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} Subscription activation result
 */
export async function activateAgentSubscription(paymentId, agentId, userId, billingCycle, accessToken) {
  try {
    logger.info('Activating agent subscription', {
      paymentId,
      agentId,
      userId,
      billingCycle
    })

    const response = await axios.post(
      `${API_BASE}/agents/subscribe`,
      {
        paymentId,
        agentId,
        userId,
        billingCycle
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to activate agent subscription')
    }

    logger.info('Agent subscription activated', {
      agentId,
      userId,
      billingCycle
    })

    return response.data.data
  } catch (error) {
    logger.error('Failed to activate agent subscription', {
      error: error.message,
      paymentId,
      agentId
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to activate agent subscription')
  }
}

/**
 * Get user's purchased agents
 *
 * @param {string} userId - User ID
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Array>} List of purchased agents
 */
export async function getUserPurchasedAgents(userId, accessToken) {
  try {
    logger.info('Fetching user purchased agents', { userId })

    const response = await axios.get(`${API_BASE}/agents/purchased/${userId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch purchased agents')
    }

    return response.data.data
  } catch (error) {
    logger.error('Failed to fetch purchased agents', {
      userId,
      error: error.message
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to fetch purchased agents')
  }
}

/**
 * Get user's agent subscriptions
 *
 * @param {string} userId - User ID
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Array>} List of agent subscriptions
 */
export async function getUserAgentSubscriptions(userId, accessToken) {
  try {
    logger.info('Fetching user agent subscriptions', { userId })

    const response = await axios.get(`${API_BASE}/agents/subscriptions/${userId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch agent subscriptions')
    }

    return response.data.data
  } catch (error) {
    logger.error('Failed to fetch agent subscriptions', {
      userId,
      error: error.message
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to fetch agent subscriptions')
  }
}

/**
 * Purchase agent with one-time payment (simple version from dev branch)
 *
 * @param {Object} purchaseData - Purchase data
 * @param {string} purchaseData.agentId - Agent ID to purchase
 * @param {number} purchaseData.price - Purchase price
 * @param {string} purchaseData.paymentMethod - Payment method (card, yookassa, stripe)
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} Purchase result
 */
export async function purchaseAgent(purchaseData, accessToken) {
  try {
    logger.info('Purchasing agent', {
      agentId: purchaseData.agentId,
      price: purchaseData.price,
      paymentMethod: purchaseData.paymentMethod
    })

    const response = await axios.post(
      `${API_BASE}/payments/agents/purchase`,
      {
        agentId: purchaseData.agentId,
        price: purchaseData.price,
        paymentMethod: purchaseData.paymentMethod
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Agent purchase failed')
    }

    const result = response.data.data

    logger.info('Agent purchased successfully', {
      agentId: purchaseData.agentId,
      purchaseId: result.purchaseId
    })

    return result
  } catch (error) {
    logger.error('Agent purchase failed', {
      error: error.message,
      agentId: purchaseData.agentId
    })
    throw new Error(error.response?.data?.error || error.message || 'Agent purchase failed')
  }
}

/**
 * Subscribe to agent with recurring payment (simple version from dev branch)
 *
 * @param {Object} subscriptionData - Subscription data
 * @param {string} subscriptionData.agentId - Agent ID to subscribe to
 * @param {number} subscriptionData.price - Monthly subscription price
 * @param {string} subscriptionData.paymentMethod - Payment method (card, yookassa, stripe)
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} Subscription result
 */
export async function subscribeToAgent(subscriptionData, accessToken) {
  try {
    logger.info('Subscribing to agent', {
      agentId: subscriptionData.agentId,
      price: subscriptionData.price,
      paymentMethod: subscriptionData.paymentMethod
    })

    const response = await axios.post(
      `${API_BASE}/payments/agents/subscribe`,
      {
        agentId: subscriptionData.agentId,
        price: subscriptionData.price,
        paymentMethod: subscriptionData.paymentMethod
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Agent subscription failed')
    }

    const result = response.data.data

    logger.info('Agent subscription successful', {
      agentId: subscriptionData.agentId,
      subscriptionId: result.subscriptionId
    })

    return result
  } catch (error) {
    logger.error('Agent subscription failed', {
      error: error.message,
      agentId: subscriptionData.agentId
    })
    throw new Error(error.response?.data?.error || error.message || 'Agent subscription failed')
  }
}

/**
 * Activate free agent (from dev branch)
 * Issue #5030: Now includes idempotency check
 *
 * @param {string} agentId - Agent ID to activate
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} Activation result with alreadyActivated flag
 */
export async function activateFreeAgent(agentId, accessToken) {
  try {
    logger.info('Activating free agent', { agentId })

    const response = await axios.post(
      `${API_BASE}/payments/agents/activate`,
      {
        agentId
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Agent activation failed')
    }

    const result = response.data.data
    const alreadyActivated = response.data.alreadyActivated

    if (alreadyActivated) {
      logger.info('Agent was already activated', {
        agentId,
        activationId: result.id
      })
    } else {
      logger.info('Agent activated successfully', {
        agentId,
        activationId: result.id
      })
    }

    return {
      ...result,
      alreadyActivated
    }
  } catch (error) {
    logger.error('Agent activation failed', {
      error: error.message,
      agentId
    })
    throw new Error(error.response?.data?.error || error.message || 'Agent activation failed')
  }
}

/**
 * Get user's purchased agents (simple version from dev branch)
 *
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Array>} List of purchased agents
 */
export async function getPurchasedAgents(accessToken) {
  try {
    logger.info('Fetching purchased agents')

    const response = await axios.get(`${API_BASE}/payments/agents/purchased`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch purchased agents')
    }

    const agents = response.data.data

    logger.info('Purchased agents fetched', {
      count: agents.length
    })

    return agents
  } catch (error) {
    logger.error('Failed to fetch purchased agents', {
      error: error.message
    })
    throw new Error(error.response?.data?.error || error.message || 'Failed to fetch purchased agents')
  }
}

/**
 * Cancel agent subscription (from dev branch)
 *
 * @param {string} subscriptionId - Subscription ID
 * @param {string} accessToken - User's access token (JWT)
 * @returns {Promise<Object>} Cancellation result
 */
export async function cancelAgentSubscription(subscriptionId, accessToken) {
  try {
    logger.info('Canceling agent subscription', { subscriptionId })

    const response = await axios.post(
      `${API_BASE}/payments/agents/subscriptions/${subscriptionId}/cancel`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!response.data.success) {
      throw new Error(response.data.error || 'Subscription cancellation failed')
    }

    logger.info('Subscription canceled successfully', { subscriptionId })

    return {
      success: true
    }
  } catch (error) {
    logger.error('Subscription cancellation failed', {
      subscriptionId,
      error: error.message
    })
    throw new Error(error.response?.data?.error || error.message || 'Subscription cancellation failed')
  }
}

export default {
  // Payment types
  PaymentType,

  // Existing token top-up functions
  createPaymentIntent,
  processPayment,
  getPaymentHistory,
  getPayment,
  generateInvoice,
  getInvoices,
  getPaymentMethods,
  addPaymentMethod,
  removePaymentMethod,
  getTokenPackages,

  // New universal payment functions
  createUniversalPaymentIntent,

  // Agent purchase functions (detailed versions)
  createAgentPurchaseIntent,
  processAgentPurchase,
  getUserPurchasedAgents,

  // Agent subscription functions (detailed versions)
  createAgentSubscriptionIntent,
  activateAgentSubscription,
  getUserAgentSubscriptions,

  // Agent functions (simple versions from dev branch)
  purchaseAgent,
  subscribeToAgent,
  activateFreeAgent,
  getPurchasedAgents,
  cancelAgentSubscription
}
