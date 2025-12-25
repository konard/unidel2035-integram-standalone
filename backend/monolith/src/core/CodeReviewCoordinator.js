/**
 * CodeReviewCoordinator - Main orchestrator for AI-powered code reviews
 * Issue #1594 - Система для ревью кода всех пиар с подключением разных моделей AI
 */

import { Octokit } from '@octokit/rest'
import { TokenBasedLLMCoordinator } from './TokenBasedLLMCoordinator.js'
import { DiffAnalyzer } from '../services/code-review/DiffAnalyzer.js'
import { SecurityScanner } from '../services/code-review/SecurityScanner.js'
import { QualityAnalyzer } from '../services/code-review/QualityAnalyzer.js'
import { AIReviewer } from '../services/code-review/AIReviewer.js'
import crypto from 'crypto'

export class CodeReviewCoordinator {
  constructor(config = {}) {
    this.pool = config.pool
    this.logger = config.logger || console

    this.diffAnalyzer = new DiffAnalyzer()
    this.securityScanner = new SecurityScanner()
    this.qualityAnalyzer = new QualityAnalyzer()

    this.llmCoordinator = null
    this.aiReviewer = null
    this.octokit = null

    this.reviewQueue = []
    this.processing = false
  }

  /**
   * Initialize the coordinator
   */
  async initialize() {
    this.logger.info('Initializing CodeReviewCoordinator')

    // Initialize LLM coordinator
    this.llmCoordinator = new TokenBasedLLMCoordinator({
      db: this.pool,
      logger: this.logger
    })

    // Initialize AI reviewer
    this.aiReviewer = new AIReviewer({
      llmCoordinator: this.llmCoordinator,
      pool: this.pool,
      logger: this.logger
    })

    // Initialize Octokit
    const githubToken = await this.getGitHubToken()
    if (githubToken) {
      this.octokit = new Octokit({ auth: githubToken })
      this.logger.info('GitHub API client initialized')
    } else {
      this.logger.warn('GitHub token not found - code review will be limited')
    }

    this.logger.info('CodeReviewCoordinator initialized successfully')
  }

  /**
   * Get GitHub token from database or environment
   */
  async getGitHubToken() {
    // Check environment variable first
    if (process.env.GITHUB_TOKEN) {
      return process.env.GITHUB_TOKEN
    }

    // Try to get from code_review_provider_keys table
    try {
      const result = await this.pool.query(`
        SELECT api_key_encrypted
        FROM code_review_provider_keys
        WHERE provider_name = 'github'
          AND is_active = true
          AND is_default = true
        ORDER BY created_at DESC
        LIMIT 1
      `)

      if (result.rows.length > 0) {
        const encryptedKey = result.rows[0].api_key_encrypted
        if (encryptedKey.startsWith('base64:')) {
          return Buffer.from(encryptedKey.substring(7), 'base64').toString('utf-8')
        }
        return Buffer.from(encryptedKey, 'base64').toString('utf-8')
      }
    } catch (error) {
      this.logger.error('Failed to retrieve GitHub token', {
        error: error.message
      })
    }

    return null
  }

  /**
   * Get or create default system token for code reviews
   */
  async getDefaultReviewToken() {
    try {
      // Try to find existing system token for code reviews
      const result = await this.pool.query(`
        SELECT id, token_hash, token_prefix
        FROM ai_access_tokens
        WHERE user_id = 'system'
          AND name = 'Code Review System'
          AND is_active = true
        LIMIT 1
      `)

      if (result.rows.length > 0) {
        return result.rows[0].id
      }

      // Create new system token
      const tokenValue = 'dd_sys_' + crypto.randomBytes(32).toString('base64url')
      const tokenHash = crypto.createHash('sha256').update(tokenValue).digest('hex')
      const tokenPrefix = tokenValue.substring(0, 20)

      const createResult = await this.pool.query(`
        INSERT INTO ai_access_tokens (
          token_hash,
          token_prefix,
          user_id,
          name,
          scopes,
          allowed_models,
          allowed_applications,
          token_balance,
          daily_limit,
          monthly_limit
        ) VALUES (
          $1, $2, 'system', 'Code Review System',
          '["model:use"]'::jsonb,
          '["*"]'::jsonb,
          '["code-review"]'::jsonb,
          10000000, 500000, 5000000
        ) RETURNING id
      `, [tokenHash, tokenPrefix])

      this.logger.info('Created new system token for code reviews')
      return createResult.rows[0].id
    } catch (error) {
      this.logger.error('Failed to get/create default review token', {
        error: error.message
      })
      throw error
    }
  }

  /**
   * Main entry point: Review a pull request
   * @param {Object} payload - Webhook payload with PR information
   * @returns {Promise<string>} Review ID
   */
  async reviewPullRequest(payload) {
    const { webhookId, repository, pullRequest } = payload

    this.logger.info('Starting code review', {
      owner: repository.owner,
      repo: repository.name,
      prNumber: pullRequest.number
    })

    try {
      // Get default AI model (DeepSeek)
      const modelResult = await this.pool.query(`
        SELECT id FROM ai_models
        WHERE model_id = 'deepseek-chat'
        LIMIT 1
      `)

      const aiModelId = modelResult.rows[0]?.id

      // Get system token
      const aiTokenId = await this.getDefaultReviewToken()

      // Create review record
      const reviewResult = await this.pool.query(`
        INSERT INTO code_reviews (
          repository_owner,
          repository_name,
          pr_number,
          pr_title,
          pr_author,
          pr_url,
          pr_base_branch,
          pr_head_branch,
          pr_head_sha,
          review_status,
          ai_model_id,
          ai_token_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (repository_owner, repository_name, pr_number, pr_head_sha)
        DO UPDATE SET
          review_status = 'pending',
          started_at = NOW(),
          completed_at = NULL
        RETURNING id
      `, [
        repository.owner,
        repository.name,
        pullRequest.number,
        pullRequest.title,
        pullRequest.user.login,
        pullRequest.html_url,
        pullRequest.base.ref,
        pullRequest.head.ref,
        pullRequest.head.sha,
        'pending',
        aiModelId,
        aiTokenId
      ])

      const reviewId = reviewResult.rows[0].id

      // Mark webhook as processed
      if (webhookId) {
        await this.pool.query(`
          CALL process_code_review_webhook($1, $2)
        `, [webhookId, reviewId])
      }

      // Start review asynchronously
      setImmediate(() => this.performReview(reviewId, repository, pullRequest))

      return reviewId
    } catch (error) {
      this.logger.error('Failed to initialize code review', {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * Perform the actual code review
   * @param {string} reviewId - Review ID
   * @param {Object} repository - Repository info
   * @param {Object} pullRequest - Pull request info
   */
  async performReview(reviewId, repository, pullRequest) {
    try {
      // Update status to in_progress
      await this.pool.query(`
        UPDATE code_reviews
        SET review_status = 'in_progress'
        WHERE id = $1
      `, [reviewId])

      this.logger.info('Performing code review', { reviewId })

      // Fetch PR files and diffs
      const prData = await this.fetchPRData(repository, pullRequest.number)

      if (!prData || prData.files.length === 0) {
        throw new Error('No files found in PR')
      }

      this.logger.info('Fetched PR data', {
        reviewId,
        filesCount: prData.files.length
      })

      // Analyze each file
      const allComments = []
      const allMetrics = []
      let totalTokens = 0
      let totalCost = 0

      for (const file of prData.files) {
        try {
          const fileResult = await this.analyzeFile(reviewId, file, repository)

          allComments.push(...fileResult.comments)
          allMetrics.push(fileResult.metrics)
          totalTokens += fileResult.tokensUsed || 0
          totalCost += fileResult.cost || 0
        } catch (error) {
          this.logger.error('Failed to analyze file', {
            reviewId,
            file: file.filename,
            error: error.message
          })
        }
      }

      // Store all comments
      if (allComments.length > 0) {
        await this.storeComments(reviewId, allComments)
      }

      // Store all metrics
      if (allMetrics.length > 0) {
        await this.storeMetrics(reviewId, allMetrics)
      }

      // Update review statistics
      await this.pool.query(`
        CALL update_code_review_stats($1)
      `, [reviewId])

      // Calculate overall score
      const score = this.calculateOverallScore(allComments, allMetrics)

      // Update review as completed
      await this.pool.query(`
        UPDATE code_reviews
        SET
          review_status = 'completed',
          completed_at = NOW(),
          overall_score = $2,
          tokens_used = $3,
          cost_usd = $4
        WHERE id = $1
      `, [reviewId, score, totalTokens, totalCost])

      this.logger.info('Code review completed', {
        reviewId,
        score,
        commentsCount: allComments.length,
        tokensUsed: totalTokens,
        cost: totalCost
      })

      // Post comments to GitHub if enabled
      if (process.env.CODE_REVIEW_AUTO_POST !== 'false') {
        await this.postReviewToGitHub(reviewId, repository, pullRequest.number, allComments)
      }
    } catch (error) {
      this.logger.error('Code review failed', {
        reviewId,
        error: error.message,
        stack: error.stack
      })

      // Mark as failed
      await this.pool.query(`
        UPDATE code_reviews
        SET
          review_status = 'failed',
          completed_at = NOW(),
          metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{error}',
            to_jsonb($2::text)
          )
        WHERE id = $1
      `, [reviewId, error.message])
    }
  }

  /**
   * Fetch PR files and diffs from GitHub
   */
  async fetchPRData(repository, prNumber) {
    if (!this.octokit) {
      throw new Error('GitHub API client not initialized')
    }

    try {
      // Get PR files
      const { data: files } = await this.octokit.pulls.listFiles({
        owner: repository.owner,
        repo: repository.name,
        pull_number: prNumber,
        per_page: 100
      })

      return {
        files: files.map(file => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
          patch: file.patch || '',
          content: file.contents_url
        }))
      }
    } catch (error) {
      this.logger.error('Failed to fetch PR data from GitHub', {
        error: error.message,
        owner: repository.owner,
        repo: repository.name,
        prNumber
      })
      throw error
    }
  }

  /**
   * Analyze a single file
   */
  async analyzeFile(reviewId, file, repository) {
    this.logger.debug('Analyzing file', {
      reviewId,
      filename: file.filename
    })

    const comments = []
    let tokensUsed = 0
    let cost = 0

    // Parse diff
    const diff = this.diffAnalyzer.parseDiff(file.patch || '')

    // Security scan
    const securityIssues = await this.securityScanner.scanFile(
      file.filename,
      file.patch || '',
      diff
    )

    comments.push(...securityIssues)

    // Quality analysis
    const qualityResult = await this.qualityAnalyzer.analyzeFile(
      file.filename,
      file.patch || ''
    )

    if (qualityResult.issues) {
      comments.push(...qualityResult.issues)
    }

    // AI review (for significant changes)
    if (file.additions + file.deletions > 10) {
      try {
        const aiResult = await this.aiReviewer.reviewWithAI(
          file.filename,
          file.patch || '',
          diff,
          {
            repository: `${repository.owner}/${repository.name}`
          }
        )

        comments.push(...aiResult.comments)
        tokensUsed += aiResult.tokensUsed || 0
        cost += aiResult.cost || 0
      } catch (error) {
        this.logger.warn('AI review failed for file', {
          reviewId,
          filename: file.filename,
          error: error.message
        })
      }
    }

    // Create metrics
    const metrics = {
      file_path: file.filename,
      file_extension: file.filename.split('.').pop(),
      file_language: this.detectLanguage(file.filename),
      lines_added: file.additions,
      lines_removed: file.deletions,
      lines_total: file.changes,
      cyclomatic_complexity: qualityResult.metrics?.cyclomaticComplexity || null,
      cognitive_complexity: qualityResult.metrics?.cognitiveComplexity || null,
      maintainability_index: qualityResult.metrics?.maintainabilityIndex || null,
      security_issues_count: securityIssues.length,
      security_severity_max: this.getMaxSeverity(securityIssues),
      follows_conventions: qualityResult.metrics?.followsConventions || null,
      has_documentation: qualityResult.metrics?.hasDocumentation || null,
      has_tests: false // TODO: implement test detection
    }

    return {
      comments,
      metrics,
      tokensUsed,
      cost
    }
  }

  /**
   * Store comments in database
   */
  async storeComments(reviewId, comments) {
    if (comments.length === 0) return

    const values = comments.map((comment, index) => {
      const params = [
        reviewId,
        comment.type || 'suggestion',
        comment.severity || 'low',
        comment.title || 'Code review comment',
        comment.description || '',
        comment.filePath || null,
        comment.lineNumber || null,
        comment.lineStart || null,
        comment.lineEnd || null,
        comment.codeSnippet || null,
        comment.suggestedFix || null,
        comment.fixCode || null,
        comment.aiConfidence || null,
        comment.tags ? `{${comment.tags.join(',')}}` : null,
        comment.references ? JSON.stringify(comment.references) : null
      ]

      const placeholders = params.map((_, i) => `$${index * 15 + i + 1}`).join(', ')
      return { params, placeholders }
    })

    const queryText = `
      INSERT INTO code_review_comments (
        code_review_id, comment_type, severity, title, description,
        file_path, line_number, line_start, line_end, code_snippet,
        suggested_fix, fix_code, ai_confidence, tags, references
      ) VALUES ${values.map(v => `(${v.placeholders})`).join(', ')}
    `

    const allParams = values.flatMap(v => v.params)

    await this.pool.query(queryText, allParams)
  }

  /**
   * Store metrics in database
   */
  async storeMetrics(reviewId, metrics) {
    if (metrics.length === 0) return

    for (const metric of metrics) {
      await this.pool.query(`
        INSERT INTO code_review_metrics (
          code_review_id, file_path, file_extension, file_language,
          lines_added, lines_removed, lines_total,
          cyclomatic_complexity, cognitive_complexity,
          maintainability_index, security_issues_count, security_severity_max,
          follows_conventions, has_documentation, has_tests
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
        reviewId,
        metric.file_path,
        metric.file_extension,
        metric.file_language,
        metric.lines_added,
        metric.lines_removed,
        metric.lines_total,
        metric.cyclomatic_complexity,
        metric.cognitive_complexity,
        metric.maintainability_index,
        metric.security_issues_count,
        metric.security_severity_max,
        metric.follows_conventions,
        metric.has_documentation,
        metric.has_tests
      ])
    }
  }

  /**
   * Post review comments to GitHub
   */
  async postReviewToGitHub(reviewId, repository, prNumber, comments) {
    if (!this.octokit) {
      this.logger.warn('Cannot post to GitHub: Octokit not initialized')
      return
    }

    try {
      // Group comments by severity
      const criticalComments = comments.filter(c =>
        ['critical', 'high'].includes(c.severity)
      )

      // Create review body
      let reviewBody = '## AI-Powered Code Review Results\n\n'
      reviewBody += `Found ${comments.length} review comments:\n`
      reviewBody += `- Critical/High: ${criticalComments.length}\n`
      reviewBody += `- Warnings: ${comments.filter(c => c.severity === 'medium').length}\n`
      reviewBody += `- Suggestions: ${comments.filter(c => c.severity === 'low').length}\n\n`
      reviewBody += `See detailed review at: ${process.env.VITE_APP_URL || 'https://drondoc.ru'}/code-review/${reviewId}\n\n`
      reviewBody += '---\n🤖 Generated by DronDoc AI Code Review System'

      // Post review
      const { data: review } = await this.octokit.pulls.createReview({
        owner: repository.owner,
        repo: repository.name,
        pull_number: prNumber,
        body: reviewBody,
        event: criticalComments.length > 0 ? 'REQUEST_CHANGES' : 'COMMENT'
      })

      // Update review with GitHub ID
      await this.pool.query(`
        UPDATE code_reviews
        SET github_review_id = $2
        WHERE id = $1
      `, [reviewId, review.id])

      this.logger.info('Posted review to GitHub', {
        reviewId,
        githubReviewId: review.id
      })
    } catch (error) {
      this.logger.error('Failed to post review to GitHub', {
        reviewId,
        error: error.message
      })
    }
  }

  /**
   * Calculate overall review score
   */
  calculateOverallScore(comments, metrics) {
    let score = 100

    // Deduct for security issues
    const criticalIssues = comments.filter(c => c.severity === 'critical').length
    const highIssues = comments.filter(c => c.severity === 'high').length
    const mediumIssues = comments.filter(c => c.severity === 'medium').length

    score -= criticalIssues * 20
    score -= highIssues * 10
    score -= mediumIssues * 5

    // Deduct for quality issues
    const avgComplexity = metrics.reduce((sum, m) =>
      sum + (m.cyclomatic_complexity || 0), 0) / (metrics.length || 1)

    if (avgComplexity > 20) score -= 15
    else if (avgComplexity > 10) score -= 10

    return Math.max(0, Math.min(100, score))
  }

  /**
   * Detect programming language from filename
   */
  detectLanguage(filename) {
    const ext = filename.split('.').pop().toLowerCase()
    const languageMap = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      java: 'java',
      go: 'go',
      rs: 'rust',
      c: 'c',
      cpp: 'cpp',
      cs: 'csharp',
      rb: 'ruby',
      php: 'php',
      sql: 'sql',
      vue: 'vue',
      html: 'html',
      css: 'css',
      md: 'markdown',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml'
    }
    return languageMap[ext] || 'unknown'
  }

  /**
   * Get maximum severity from comments
   */
  getMaxSeverity(comments) {
    const severityOrder = ['critical', 'high', 'medium', 'low', 'info']
    for (const sev of severityOrder) {
      if (comments.some(c => c.severity === sev)) {
        return sev
      }
    }
    return 'none'
  }

  /**
   * Retry a failed review
   */
  async retryReview(reviewId) {
    const result = await this.pool.query(`
      SELECT * FROM code_reviews WHERE id = $1
    `, [reviewId])

    if (result.rows.length === 0) {
      throw new Error('Review not found')
    }

    const review = result.rows[0]

    // Create mock PR object
    const pullRequest = {
      number: review.pr_number,
      title: review.pr_title,
      user: { login: review.pr_author },
      html_url: review.pr_url,
      base: { ref: review.pr_base_branch },
      head: {
        ref: review.pr_head_branch,
        sha: review.pr_head_sha
      }
    }

    return this.reviewPullRequest({
      repository: {
        owner: review.repository_owner,
        name: review.repository_name
      },
      pullRequest
    })
  }
}
