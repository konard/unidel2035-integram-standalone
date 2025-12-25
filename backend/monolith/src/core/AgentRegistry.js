// AgentRegistry.js - Agent registration and lifecycle management
import EventEmitter from 'events';
import { randomUUID } from 'crypto';
import logger from '../utils/logger.js';
import metrics from '../utils/metrics.js';
import { BoundedMap } from '../utils/memoryOptimization.js';

/**
 * Agent statuses
 */
export const AgentStatus = {
  IDLE: 'idle',
  BUSY: 'busy',
  OFFLINE: 'offline',
  ERROR: 'error'
};

/**
 * Agent capabilities
 */
export const AgentCapabilities = {
  SPREADSHEET_EDITOR: 'spreadsheet_editor',
  DATA_PROCESSOR: 'data_processor',
  VALIDATOR: 'validator',
  ANALYZER: 'analyzer',
  VOICE_PROCESSING: 'voice_processing',
  TASK_DELEGATION: 'task_delegation',
  CONVERSATION: 'conversation',
  PROBLEM_SOLVER: 'problem_solver',
  LEAD_GENERATION: 'lead_generation',
  SALES_AUTOMATION: 'sales_automation',
  AI_COMMUNICATION: 'ai_communication',
  CUSTOMER_SUPPORT: 'customer_support',
  CONTEXT_MANAGEMENT: 'context_management',
  QUEUE_MANAGER: 'queue_manager',
  TASK_COORDINATOR: 'task_coordinator',
  MONITORING: 'monitoring',
  CACHE_MANAGER: 'cache_manager',
  MEMORY_OPTIMIZER: 'memory_optimizer',
  GENERIC: 'generic'
};

/**
 * AgentRegistry manages agent registration, tracking, and health monitoring
 * Issue #2157: Use BoundedMap to prevent unbounded memory growth
 */
export class AgentRegistry extends EventEmitter {
  constructor(options = {}) {
    super();
    // Use BoundedMap to limit memory usage (Issue #2157)
    this.maxAgents = options.maxAgents || 5000;
    this.agents = new BoundedMap(this.maxAgents);
    this.heartbeatInterval = options.heartbeatInterval || 30000; // 30 seconds
    this.heartbeatTimeout = options.heartbeatTimeout || 90000; // 90 seconds
    this.heartbeatTimers = new Map();
    this.cleanupInterval = options.cleanupInterval || 3600000; // 1 hour
    this.offlineAgentRetentionMs = options.offlineAgentRetentionMs || 86400000; // 24 hours

    // Start periodic cleanup of offline agents
    this._startCleanupTimer();

    logger.info('AgentRegistry initialized', {
      maxAgents: this.maxAgents,
      heartbeatInterval: this.heartbeatInterval,
      heartbeatTimeout: this.heartbeatTimeout,
      cleanupInterval: this.cleanupInterval
    });
  }

  /**
   * Register a new agent
   */
  registerAgent(agentData) {
    const agent = {
      id: agentData.id || randomUUID(),
      name: agentData.name,
      status: AgentStatus.IDLE,
      capabilities: agentData.capabilities || [AgentCapabilities.GENERIC],
      metadata: agentData.metadata || {},
      registeredAt: new Date(),
      lastHeartbeat: new Date(),
      currentTask: null,
      tasksCompleted: 0,
      tasksFailed: 0
    };

    this.agents.set(agent.id, agent);
    metrics.increment('agentsRegistered');
    metrics.increment('agentsActive');

    logger.info({ agentId: agent.id, name: agent.name, capabilities: agent.capabilities }, 'Agent registered');
    this.emit('agent:registered', agent);

    // Start heartbeat monitoring
    this._startHeartbeatMonitoring(agent.id);

    return agent;
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    this.agents.delete(agentId);
    metrics.decrement('agentsRegistered');
    if (agent.status !== AgentStatus.OFFLINE) {
      metrics.decrement('agentsActive');
    }

    logger.info({ agentId }, 'Agent unregistered');
    this.emit('agent:unregistered', agent);

    // Stop heartbeat monitoring
    this._stopHeartbeatMonitoring(agentId);

    return agent;
  }

  /**
   * Update agent heartbeat
   */
  heartbeat(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    agent.lastHeartbeat = new Date();

    // If agent was offline, bring it back online
    if (agent.status === AgentStatus.OFFLINE) {
      agent.status = AgentStatus.IDLE;
      metrics.increment('agentsActive');
      logger.info({ agentId }, 'Agent came back online');
      this.emit('agent:online', agent);
    }

    logger.debug({ agentId }, 'Agent heartbeat received');

    return agent;
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents
   */
  getAllAgents() {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by status
   */
  getAgentsByStatus(status) {
    return Array.from(this.agents.values()).filter(agent => agent.status === status);
  }

  /**
   * Get agents by capability
   */
  getAgentsByCapability(capability) {
    return Array.from(this.agents.values()).filter(agent =>
      agent.capabilities.includes(capability)
    );
  }

  /**
   * Get available agents (idle agents with specific capability if provided)
   */
  getAvailableAgents(capability = null) {
    let agents = this.getAgentsByStatus(AgentStatus.IDLE);
    if (capability) {
      agents = agents.filter(agent => agent.capabilities.includes(capability));
    }
    return agents;
  }

  /**
   * Update agent status
   */
  updateAgentStatus(agentId, status, currentTask = null) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const oldStatus = agent.status;
    agent.status = status;
    agent.currentTask = currentTask;

    if (oldStatus !== status) {
      if (status === AgentStatus.OFFLINE && oldStatus !== AgentStatus.OFFLINE) {
        metrics.decrement('agentsActive');
      } else if (oldStatus === AgentStatus.OFFLINE && status !== AgentStatus.OFFLINE) {
        metrics.increment('agentsActive');
      }

      logger.info({ agentId, oldStatus, newStatus: status }, 'Agent status changed');
      this.emit('agent:status_changed', agent);
    }

    return agent;
  }

  /**
   * Increment agent task counters
   */
  incrementTaskCounter(agentId, success) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (success) {
      agent.tasksCompleted++;
    } else {
      agent.tasksFailed++;
    }

    return agent;
  }

  /**
   * Get registry statistics
   */
  getStats() {
    return {
      total: this.agents.size,
      idle: this.getAgentsByStatus(AgentStatus.IDLE).length,
      busy: this.getAgentsByStatus(AgentStatus.BUSY).length,
      offline: this.getAgentsByStatus(AgentStatus.OFFLINE).length,
      error: this.getAgentsByStatus(AgentStatus.ERROR).length
    };
  }

  /**
   * Start heartbeat monitoring for an agent
   * @private
   */
  _startHeartbeatMonitoring(agentId) {
    const timerId = setInterval(() => {
      const agent = this.agents.get(agentId);
      if (!agent) {
        this._stopHeartbeatMonitoring(agentId);
        return;
      }

      const timeSinceLastHeartbeat = Date.now() - agent.lastHeartbeat.getTime();
      if (timeSinceLastHeartbeat > this.heartbeatTimeout) {
        logger.warn({ agentId, timeSinceLastHeartbeat }, 'Agent heartbeat timeout');
        this.updateAgentStatus(agentId, AgentStatus.OFFLINE);
        this.emit('agent:offline', agent);
      }
    }, this.heartbeatInterval);

    this.heartbeatTimers.set(agentId, timerId);
  }

  /**
   * Stop heartbeat monitoring for an agent
   * @private
   */
  _stopHeartbeatMonitoring(agentId) {
    const timerId = this.heartbeatTimers.get(agentId);
    if (timerId) {
      clearInterval(timerId);
      this.heartbeatTimers.delete(agentId);
    }
  }

  /**
   * Start periodic cleanup of offline agents
   * Issue #2157: Prevent memory leaks from stale agent registrations
   * @private
   */
  _startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this._cleanup();
    }, this.cleanupInterval);

    logger.debug('AgentRegistry cleanup timer started');
  }

  /**
   * Cleanup old offline agents
   * Issue #2157: Prevent memory leaks
   * @private
   */
  _cleanup() {
    const now = Date.now();
    const agentIdsToRemove = [];

    for (const [agentId, agent] of this.agents.entries()) {
      // Only clean up offline agents
      if (agent.status === AgentStatus.OFFLINE) {
        const timeSinceOffline = now - agent.lastHeartbeat.getTime();
        if (timeSinceOffline > this.offlineAgentRetentionMs) {
          agentIdsToRemove.push(agentId);
        }
      }
    }

    // Remove old offline agents
    for (const agentId of agentIdsToRemove) {
      this._stopHeartbeatMonitoring(agentId);
      this.agents.delete(agentId);
    }

    if (agentIdsToRemove.length > 0) {
      logger.info({
        removedAgents: agentIdsToRemove.length,
        remainingAgents: this.agents.size
      }, 'AgentRegistry cleanup completed');
    }
  }

  /**
   * Cleanup on shutdown
   */
  shutdown() {
    logger.info('Shutting down AgentRegistry');

    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Stop all heartbeat monitoring
    for (const agentId of this.heartbeatTimers.keys()) {
      this._stopHeartbeatMonitoring(agentId);
    }

    this.agents.clear();
  }
}
