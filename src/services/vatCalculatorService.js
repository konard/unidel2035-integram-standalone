/**
 * VAT Calculator Service
 * Calculates Russian VAT (НДС) - 20% rate
 *
 * Supports:
 * - Calculate VAT from amount (начислить НДС)
 * - Extract VAT from amount (выделить НДС)
 * - Different VAT rates (20%, 10%, 0%)
 */

const VAT_RATES = {
  standard: 20,   // Стандартная ставка
  reduced: 10,    // Пониженная (продукты, детские товары)
  zero: 0         // Нулевая (экспорт)
}

/**
 * Calculate VAT to add on top of amount (начислить НДС)
 * Formula: amount * rate / 100
 * @param {number} amount - Base amount without VAT
 * @param {number} rate - VAT rate (default 20%)
 * @returns {Object} Calculation result
 */
export function calculateVatOn(amount, rate = VAT_RATES.standard) {
  const vat = amount * rate / 100
  const total = amount + vat

  return {
    success: true,
    operation: 'add',
    baseAmount: amount,
    vatRate: rate,
    vatAmount: Math.round(vat * 100) / 100,
    totalAmount: Math.round(total * 100) / 100
  }
}

/**
 * Extract VAT from amount that includes VAT (выделить НДС)
 * Formula: amount * rate / (100 + rate)
 * @param {number} amountWithVat - Amount including VAT
 * @param {number} rate - VAT rate (default 20%)
 * @returns {Object} Calculation result
 */
export function extractVatFrom(amountWithVat, rate = VAT_RATES.standard) {
  const vat = amountWithVat * rate / (100 + rate)
  const baseAmount = amountWithVat - vat

  return {
    success: true,
    operation: 'extract',
    totalAmount: amountWithVat,
    vatRate: rate,
    vatAmount: Math.round(vat * 100) / 100,
    baseAmount: Math.round(baseAmount * 100) / 100
  }
}

/**
 * Parse VAT request from user message
 * Supports various formats:
 * - "ндс 100000" or "ндс на 100000" - add VAT
 * - "ндс из 120000" or "выделить ндс 120000" - extract VAT
 * - "ндс 10% 100000" - specific rate
 * @param {string} message - User message
 * @returns {Object|null} Parsed request or null
 */
export function parseVatRequest(message) {
  const normalizedMessage = message.toLowerCase().trim()

  // Patterns for extracting VAT (выделить)
  const extractPatterns = [
    /(?:выдел\w*|вычесть|извлечь)\s*ндс\s*(?:из\s*)?(\d+(?:[.,]\d+)?)/i,
    /ндс\s*из\s*(\d+(?:[.,]\d+)?)/i,
    /из\s*(\d+(?:[.,]\d+)?)\s*(?:выдел\w*|вычесть)?\s*ндс/i
  ]

  // Patterns for adding VAT (начислить)
  const addPatterns = [
    /(?:начисл\w*|добав\w*|прибав\w*)\s*ндс\s*(?:на\s*|к\s*)?(\d+(?:[.,]\d+)?)/i,
    /ндс\s*(?:на\s*)?(\d+(?:[.,]\d+)?)/i,
    /(\d+(?:[.,]\d+)?)\s*(?:\+|плюс)?\s*ндс/i
  ]

  // Check for rate specification
  const rateMatch = normalizedMessage.match(/(\d+)\s*%/)
  let rate = VAT_RATES.standard
  if (rateMatch) {
    const specifiedRate = parseInt(rateMatch[1])
    if ([0, 10, 20].includes(specifiedRate)) {
      rate = specifiedRate
    }
  }

  // Try extract patterns first (more specific)
  for (const pattern of extractPatterns) {
    const match = normalizedMessage.match(pattern)
    if (match) {
      const amount = parseFloat(match[1].replace(',', '.'))
      if (!isNaN(amount) && amount > 0) {
        return {
          operation: 'extract',
          amount,
          rate
        }
      }
    }
  }

  // Try add patterns
  for (const pattern of addPatterns) {
    const match = normalizedMessage.match(pattern)
    if (match) {
      const amount = parseFloat(match[1].replace(',', '.'))
      if (!isNaN(amount) && amount > 0) {
        return {
          operation: 'add',
          amount,
          rate
        }
      }
    }
  }

  return null
}

/**
 * Calculate VAT based on parsed request
 * @param {Object} request - Parsed request from parseVatRequest
 * @returns {Object} Calculation result
 */
export function calculateVat(request) {
  if (!request) {
    return {
      success: false,
      error: 'Не удалось распознать запрос НДС'
    }
  }

  if (request.operation === 'extract') {
    return extractVatFrom(request.amount, request.rate)
  } else {
    return calculateVatOn(request.amount, request.rate)
  }
}

/**
 * Format VAT calculation result for display
 * @param {Object} result - Calculation result
 * @returns {string} Formatted markdown string
 */
export function formatVatResult(result) {
  if (!result.success) {
    return `❌ ${result.error}`
  }

  const formatNumber = (num) => {
    return num.toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  if (result.operation === 'extract') {
    return `🧮 **Выделение НДС ${result.vatRate}%**

📊 **Сумма с НДС:** ${formatNumber(result.totalAmount)} ₽
➖ **НДС ${result.vatRate}%:** ${formatNumber(result.vatAmount)} ₽
📋 **Сумма без НДС:** ${formatNumber(result.baseAmount)} ₽

_Формула: ${result.totalAmount} × ${result.vatRate} / ${100 + result.vatRate}_`
  } else {
    return `🧮 **Начисление НДС ${result.vatRate}%**

📋 **Сумма без НДС:** ${formatNumber(result.baseAmount)} ₽
➕ **НДС ${result.vatRate}%:** ${formatNumber(result.vatAmount)} ₽
📊 **Итого с НДС:** ${formatNumber(result.totalAmount)} ₽

_Формула: ${result.baseAmount} × ${result.vatRate}%_`
  }
}

export const vatCalculatorService = {
  calculateVatOn,
  extractVatFrom,
  parseVatRequest,
  calculateVat,
  formatVatResult,
  VAT_RATES
}

export default vatCalculatorService
