// MicrotaskManager.js - Manages microtasks delegated by VoiceAgent
// Issue #1275 - Microtask delegation and management system

import EventEmitter from 'events'
import logger from '../utils/logger.js'
import { MicrotaskStatus, MicrotaskPriority } from '../agents/VoiceAgent.js'

/**
 * MicrotaskManager - Centralized manager for human-delegated microtasks
 *
 * Features:
 * - Task lifecycle management (create, update, complete, cancel)
 * - Assignment and ownership tracking
 * - Priority-based queuing
 * - Progress tracking and reporting
 * - Notifications for task updates
 */
export class MicrotaskManager extends EventEmitter {
  constructor(options = {}) {
    super()
    this.db = options.db
    this.notificationService = options.notificationService
  }

  /**
   * Get microtasks for a user
   * @param {string} userId - User ID
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} - List of microtasks
   */
  async getUserMicrotasks(userId, filters = {}) {
    const {
      status = null,
      priority = null,
      conversationId = null,
      limit = 50,
      offset = 0
    } = filters

    let query = `
      SELECT
        id, conversation_id, user_id, title, description,
        priority, status, created_by, created_at, updated_at,
        assigned_to, completed_at, estimated_effort, actual_effort,
        context, result, notes
      FROM voice_agent_microtasks
      WHERE user_id = $1
    `
    const params = [userId]
    let paramIndex = 2

    if (status) {
      query += ` AND status = $${paramIndex}`
      params.push(status)
      paramIndex++
    }

    if (priority) {
      query += ` AND priority = $${paramIndex}`
      params.push(priority)
      paramIndex++
    }

    if (conversationId) {
      query += ` AND conversation_id = $${paramIndex}`
      params.push(conversationId)
      paramIndex++
    }

    query += ` ORDER BY
      CASE priority
        WHEN '${MicrotaskPriority.URGENT}' THEN 1
        WHEN '${MicrotaskPriority.HIGH}' THEN 2
        WHEN '${MicrotaskPriority.MEDIUM}' THEN 3
        WHEN '${MicrotaskPriority.LOW}' THEN 4
      END,
      created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `
    params.push(limit, offset)

    try {
      const result = await this.db.query(query, params)
      return result.rows.map(row => this._formatMicrotask(row))
    } catch (error) {
      logger.error({ error: error.message, userId }, 'Failed to get user microtasks')
      throw error
    }
  }

  /**
   * Get microtask by ID
   * @param {string} taskId - Microtask ID
   * @returns {Promise<Object>} - Microtask object
   */
  async getMicrotask(taskId) {
    try {
      const result = await this.db.query(`
        SELECT * FROM voice_agent_microtasks
        WHERE id = $1
      `, [taskId])

      if (result.rows.length === 0) {
        throw new Error(`Microtask not found: ${taskId}`)
      }

      return this._formatMicrotask(result.rows[0])
    } catch (error) {
      logger.error({ error: error.message, taskId }, 'Failed to get microtask')
      throw error
    }
  }

  /**
   * Update microtask status
   * @param {string} taskId - Microtask ID
   * @param {string} status - New status
   * @param {Object} updates - Additional updates
   * @returns {Promise<Object>} - Updated microtask
   */
  async updateMicrotaskStatus(taskId, status, updates = {}) {
    const {
      assignedTo = null,
      result = null,
      notes = null,
      actualEffort = null
    } = updates

    try {
      const updateFields = ['status = $2', 'updated_at = CURRENT_TIMESTAMP']
      const params = [taskId, status]
      let paramIndex = 3

      if (assignedTo !== null) {
        updateFields.push(`assigned_to = $${paramIndex}`)
        params.push(assignedTo)
        paramIndex++
      }

      if (result !== null) {
        updateFields.push(`result = $${paramIndex}`)
        params.push(JSON.stringify(result))
        paramIndex++
      }

      if (notes !== null) {
        updateFields.push(`notes = $${paramIndex}`)
        params.push(notes)
        paramIndex++
      }

      if (actualEffort !== null) {
        updateFields.push(`actual_effort = $${paramIndex}`)
        params.push(actualEffort)
        paramIndex++
      }

      if (status === MicrotaskStatus.COMPLETED) {
        updateFields.push('completed_at = CURRENT_TIMESTAMP')
      }

      const query = `
        UPDATE voice_agent_microtasks
        SET ${updateFields.join(', ')}
        WHERE id = $1
        RETURNING *
      `

      const updateResult = await this.db.query(query, params)

      if (updateResult.rows.length === 0) {
        throw new Error(`Microtask not found: ${taskId}`)
      }

      const microtask = this._formatMicrotask(updateResult.rows[0])

      // Emit event for listeners
      this.emit('microtask:updated', { taskId, status, microtask })

      // Send notification
      await this._notifyTaskUpdate(microtask, status)

      logger.info({ taskId, status }, 'Microtask status updated')

      return microtask
    } catch (error) {
      logger.error({ error: error.message, taskId }, 'Failed to update microtask status')
      throw error
    }
  }

  /**
   * Assign microtask to a user
   * @param {string} taskId - Microtask ID
   * @param {string} assigneeId - User ID to assign to
   * @returns {Promise<Object>} - Updated microtask
   */
  async assignMicrotask(taskId, assigneeId) {
    return await this.updateMicrotaskStatus(
      taskId,
      MicrotaskStatus.IN_PROGRESS,
      { assignedTo: assigneeId }
    )
  }

  /**
   * Complete a microtask
   * @param {string} taskId - Microtask ID
   * @param {Object} result - Task result
   * @param {string} notes - Completion notes
   * @returns {Promise<Object>} - Completed microtask
   */
  async completeMicrotask(taskId, result, notes = null) {
    return await this.updateMicrotaskStatus(
      taskId,
      MicrotaskStatus.COMPLETED,
      { result, notes }
    )
  }

  /**
   * Cancel a microtask
   * @param {string} taskId - Microtask ID
   * @param {string} reason - Cancellation reason
   * @returns {Promise<Object>} - Cancelled microtask
   */
  async cancelMicrotask(taskId, reason) {
    return await this.updateMicrotaskStatus(
      taskId,
      MicrotaskStatus.CANCELLED,
      { notes: reason }
    )
  }

  /**
   * Get microtask statistics for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Statistics object
   */
  async getMicrotaskStats(userId) {
    try {
      const result = await this.db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = '${MicrotaskStatus.PENDING}') as pending_count,
          COUNT(*) FILTER (WHERE status = '${MicrotaskStatus.IN_PROGRESS}') as in_progress_count,
          COUNT(*) FILTER (WHERE status = '${MicrotaskStatus.COMPLETED}') as completed_count,
          COUNT(*) FILTER (WHERE status = '${MicrotaskStatus.FAILED}') as failed_count,
          COUNT(*) FILTER (WHERE status = '${MicrotaskStatus.CANCELLED}') as cancelled_count,
          COUNT(*) as total_count,
          COUNT(*) FILTER (WHERE priority = '${MicrotaskPriority.URGENT}') as urgent_count,
          COUNT(*) FILTER (WHERE priority = '${MicrotaskPriority.HIGH}') as high_priority_count,
          AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 60) FILTER (WHERE completed_at IS NOT NULL) as avg_completion_time_minutes
        FROM voice_agent_microtasks
        WHERE user_id = $1
      `, [userId])

      return {
        pending: parseInt(result.rows[0].pending_count) || 0,
        inProgress: parseInt(result.rows[0].in_progress_count) || 0,
        completed: parseInt(result.rows[0].completed_count) || 0,
        failed: parseInt(result.rows[0].failed_count) || 0,
        cancelled: parseInt(result.rows[0].cancelled_count) || 0,
        total: parseInt(result.rows[0].total_count) || 0,
        urgent: parseInt(result.rows[0].urgent_count) || 0,
        highPriority: parseInt(result.rows[0].high_priority_count) || 0,
        avgCompletionTimeMinutes: parseFloat(result.rows[0].avg_completion_time_minutes) || 0
      }
    } catch (error) {
      logger.error({ error: error.message, userId }, 'Failed to get microtask stats')
      throw error
    }
  }

  /**
   * Get conversation microtasks
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Array>} - List of microtasks for conversation
   */
  async getConversationMicrotasks(conversationId) {
    try {
      const result = await this.db.query(`
        SELECT * FROM voice_agent_microtasks
        WHERE conversation_id = $1
        ORDER BY created_at ASC
      `, [conversationId])

      return result.rows.map(row => this._formatMicrotask(row))
    } catch (error) {
      logger.error({ error: error.message, conversationId }, 'Failed to get conversation microtasks')
      throw error
    }
  }

  /**
   * Delete microtask
   * @param {string} taskId - Microtask ID
   * @returns {Promise<void>}
   */
  async deleteMicrotask(taskId) {
    try {
      await this.db.query(`
        DELETE FROM voice_agent_microtasks
        WHERE id = $1
      `, [taskId])

      this.emit('microtask:deleted', { taskId })

      logger.info({ taskId }, 'Microtask deleted')
    } catch (error) {
      logger.error({ error: error.message, taskId }, 'Failed to delete microtask')
      throw error
    }
  }

  /**
   * Format microtask from database row
   * @private
   */
  _formatMicrotask(row) {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      assignedTo: row.assigned_to,
      completedAt: row.completed_at,
      estimatedEffort: row.estimated_effort,
      actualEffort: row.actual_effort,
      context: typeof row.context === 'string' ? JSON.parse(row.context) : row.context,
      result: row.result ? (typeof row.result === 'string' ? JSON.parse(row.result) : row.result) : null,
      notes: row.notes
    }
  }

  /**
   * Send notification for task update
   * @private
   */
  async _notifyTaskUpdate(microtask, status) {
    if (!this.notificationService) {
      return
    }

    try {
      const message = this._getNotificationMessage(microtask, status)

      await this.notificationService.notify({
        userId: microtask.userId,
        type: 'microtask_update',
        title: 'Обновление микрозадачи',
        message,
        data: {
          taskId: microtask.id,
          status,
          conversationId: microtask.conversationId
        }
      })
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to send task update notification')
      // Don't throw - notification failure shouldn't break task update
    }
  }

  /**
   * Get notification message for task update
   * @private
   */
  _getNotificationMessage(microtask, status) {
    const statusMessages = {
      [MicrotaskStatus.PENDING]: 'создана и ожидает выполнения',
      [MicrotaskStatus.IN_PROGRESS]: 'взята в работу',
      [MicrotaskStatus.AWAITING_REVIEW]: 'ожидает проверки',
      [MicrotaskStatus.COMPLETED]: 'успешно завершена',
      [MicrotaskStatus.FAILED]: 'завершена с ошибкой',
      [MicrotaskStatus.CANCELLED]: 'отменена'
    }

    const statusText = statusMessages[status] || 'обновлена'
    return `Задача "${microtask.title}" ${statusText}`
  }
}

export default MicrotaskManager
