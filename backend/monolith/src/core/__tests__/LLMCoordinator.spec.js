// LLMCoordinator.spec.js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LLMCoordinator, promptTemplates } from '../LLMCoordinator.js'

// Mock OpenAI
vi.mock('openai', () => ({
  default: class OpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: vi.fn()
        }
      }
    }
  }
}))

describe('LLMCoordinator', () => {
  let coordinator

  beforeEach(() => {
    coordinator = new LLMCoordinator({
      apiKey: 'test-key',
      defaultModel: 'gpt-4o-mini',
      cache: { enabled: true, ttl: 60 },
      rateLimit: { requestsPerMinute: 100, tokensPerMinute: 10000 }
    })
  })

  it('should initialize with default config', () => {
    const coord = new LLMCoordinator()
    expect(coord.config.provider).toBe('openai')
    expect(coord.config.defaultModel).toBe('gpt-4o-mini')
    expect(coord.config.cache.enabled).toBe(true)
  })

  it('should throw error for unsupported provider', () => {
    expect(() => new LLMCoordinator({ provider: 'anthropic' })).toThrow(
      'Anthropic provider not yet implemented'
    )
  })

  it('should cache responses', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Test response' } }],
      usage: { total_tokens: 50 },
      model: 'gpt-4o-mini'
    }

    coordinator.client.chat.completions.create.mockResolvedValue(mockResponse)

    // First call - should hit API
    const result1 = await coordinator.chat('Test prompt')
    expect(result1.content).toBe('Test response')
    expect(coordinator.metrics.cacheMisses).toBe(1)

    // Second call - should hit cache
    const result2 = await coordinator.chat('Test prompt')
    expect(result2.content).toBe('Test response')
    expect(coordinator.metrics.cacheHits).toBe(1)
  })

  it('should skip cache when requested', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Test response' } }],
      usage: { total_tokens: 50 },
      model: 'gpt-4o-mini'
    }

    coordinator.client.chat.completions.create.mockResolvedValue(mockResponse)

    await coordinator.chat('Test prompt', { skipCache: true })
    expect(coordinator.metrics.cacheMisses).toBe(0)
  })

  it('should track metrics', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Test response' } }],
      usage: { total_tokens: 100 },
      model: 'gpt-4o-mini'
    }

    coordinator.client.chat.completions.create.mockResolvedValue(mockResponse)

    await coordinator.chat('Test prompt')

    const metrics = coordinator.getMetrics()
    expect(metrics.totalRequests).toBe(1)
    expect(metrics.totalTokens).toBe(100)
    expect(metrics.errors).toBe(0)
  })

  it('should retry on retryable errors', async () => {
    let attempts = 0
    coordinator.client.chat.completions.create.mockImplementation(() => {
      attempts++
      if (attempts < 2) {
        const error = new Error('Rate limit')
        error.status = 429
        throw error
      }
      return {
        choices: [{ message: { content: 'Success' } }],
        usage: { total_tokens: 50 },
        model: 'gpt-4o-mini'
      }
    })

    const result = await coordinator.chat('Test prompt', { skipCache: true })
    expect(result.content).toBe('Success')
    expect(attempts).toBe(2)
  })

  it('should not retry on non-retryable errors', async () => {
    coordinator.client.chat.completions.create.mockRejectedValue(
      Object.assign(new Error('Bad request'), { status: 400 })
    )

    await expect(coordinator.chat('Test prompt', { skipCache: true })).rejects.toThrow('Bad request')
  })

  it('should render templates', () => {
    const rendered = coordinator.renderTemplate('tableAnalysis', {
      schema: '[columns]',
      sample: '[data]',
      focus: 'quality'
    })

    expect(rendered).toContain('[columns]')
    expect(rendered).toContain('[data]')
    expect(rendered).toContain('quality')
  })

  it('should throw error for unknown template', () => {
    expect(() => coordinator.renderTemplate('unknown-template')).toThrow('Template not found')
  })

  it('should get template by name', () => {
    const template = coordinator.getTemplate('tableAnalysis')
    expect(template).toBeTruthy()
    expect(typeof template).toBe('string')
  })

  it('should clear cache', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Test response' } }],
      usage: { total_tokens: 50 },
      model: 'gpt-4o-mini'
    }

    coordinator.client.chat.completions.create.mockResolvedValue(mockResponse)

    await coordinator.chat('Test prompt')
    expect(coordinator.cache.size).toBe(1)

    coordinator.clearCache()
    expect(coordinator.cache.size).toBe(0)
  })

  it('should cleanup resources', async () => {
    await coordinator.cleanup()
    expect(coordinator.cache.size).toBe(0)
  })
})

describe('promptTemplates', () => {
  it('should have all required templates', () => {
    expect(promptTemplates).toHaveProperty('tableAnalysis')
    expect(promptTemplates).toHaveProperty('transformation')
    expect(promptTemplates).toHaveProperty('validation')
    expect(promptTemplates).toHaveProperty('report')
  })

  it('should have valid template structures', () => {
    for (const [name, template] of Object.entries(promptTemplates)) {
      expect(typeof template).toBe('string')
      expect(template.length).toBeGreaterThan(0)
    }
  })
})
