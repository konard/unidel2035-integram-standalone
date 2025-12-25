// Coordinator.js - Main orchestration logic for task distribution
import EventEmitter from 'events';
import logger from '../utils/logger.js';
import { TaskStatus } from './TaskQueue.js';
import { AgentStatus, AgentCapabilities } from './AgentRegistry.js';

/**
 * Coordinator manages the distribution of tasks to agents
 * Implements load balancing and task-agent matching strategies
 */
export class Coordinator extends EventEmitter {
  constructor(taskQueue, agentRegistry, options = {}) {
    super();
    this.taskQueue = taskQueue;
    this.agentRegistry = agentRegistry;
    this.pollInterval = options.pollInterval || 1000; // 1 second
    this.isRunning = false;
    this.pollTimer = null;

    // Strategy for task assignment
    this.assignmentStrategy = options.assignmentStrategy || 'round-robin'; // 'round-robin' | 'least-loaded' | 'capability-match'

    logger.info('Coordinator initialized', {
      pollInterval: this.pollInterval,
      assignmentStrategy: this.assignmentStrategy
    });

    this._setupEventHandlers();
  }

  /**
   * Setup event handlers for task and agent events
   * @private
   */
  _setupEventHandlers() {
    // When a task is created, try to assign it
    this.taskQueue.on('task:created', (task) => {
      this._tryAssignTask(task);
    });

    // When a task is completed, agent becomes available
    this.taskQueue.on('task:completed', (task) => {
      if (task.assignedAgent) {
        this.agentRegistry.updateAgentStatus(task.assignedAgent, AgentStatus.IDLE);
        this.agentRegistry.incrementTaskCounter(task.assignedAgent, true);
      }
      this._processQueue();
    });

    // When a task fails, agent becomes available
    this.taskQueue.on('task:failed', (task) => {
      if (task.assignedAgent) {
        this.agentRegistry.updateAgentStatus(task.assignedAgent, AgentStatus.IDLE);
        this.agentRegistry.incrementTaskCounter(task.assignedAgent, false);
      }
      this._processQueue();
    });

    // When a task is retried, try to assign it
    this.taskQueue.on('task:retry', (task) => {
      this._tryAssignTask(task);
    });

    // When an agent comes online, process queue
    this.agentRegistry.on('agent:registered', () => {
      this._processQueue();
    });

    this.agentRegistry.on('agent:online', () => {
      this._processQueue();
    });
  }

  /**
   * Start the coordinator
   */
  start() {
    if (this.isRunning) {
      logger.warn('Coordinator is already running');
      return;
    }

    this.isRunning = true;
    this._startPolling();
    logger.info('Coordinator started');
    this.emit('coordinator:started');
  }

  /**
   * Stop the coordinator
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Coordinator is not running');
      return;
    }

    this.isRunning = false;
    this._stopPolling();
    logger.info('Coordinator stopped');
    this.emit('coordinator:stopped');
  }

  /**
   * Start polling for task assignment
   * @private
   */
  _startPolling() {
    this.pollTimer = setInterval(() => {
      this._processQueue();
    }, this.pollInterval);
  }

  /**
   * Stop polling
   * @private
   */
  _stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Process the task queue and assign tasks to available agents
   * @private
   */
  _processQueue() {
    if (!this.isRunning) return;

    let task = this.taskQueue.getNextTask();
    while (task) {
      const assigned = this._tryAssignTask(task);
      if (!assigned) {
        // No available agents, break and wait
        break;
      }
      task = this.taskQueue.getNextTask();
    }
  }

  /**
   * Try to assign a task to an available agent
   * @private
   */
  _tryAssignTask(task) {
    // Find suitable agent based on task requirements and strategy
    const agent = this._selectAgent(task);

    if (!agent) {
      logger.debug({ taskId: task.id }, 'No available agent for task');
      return false;
    }

    try {
      // Assign task
      this.taskQueue.assignTask(task.id, agent.id);
      this.agentRegistry.updateAgentStatus(agent.id, AgentStatus.BUSY, task.id);

      logger.info({ taskId: task.id, agentId: agent.id }, 'Task assigned to agent');
      this.emit('task:assigned', { task, agent });

      return true;
    } catch (error) {
      logger.error({ taskId: task.id, agentId: agent.id, error: error.message }, 'Failed to assign task');
      return false;
    }
  }

  /**
   * Select an agent for a task based on the assignment strategy
   * @private
   */
  _selectAgent(task) {
    // Get available agents
    let availableAgents = this.agentRegistry.getAvailableAgents();

    if (availableAgents.length === 0) {
      return null;
    }

    // Filter by capability if task requires specific capability
    if (task.requiredCapability) {
      const capableAgents = availableAgents.filter(agent =>
        agent.capabilities.includes(task.requiredCapability)
      );
      if (capableAgents.length > 0) {
        availableAgents = capableAgents;
      }
    }

    // Apply assignment strategy
    switch (this.assignmentStrategy) {
      case 'least-loaded':
        return this._selectLeastLoadedAgent(availableAgents);
      case 'capability-match':
        return this._selectByCapability(availableAgents, task);
      case 'round-robin':
      default:
        return availableAgents[0]; // Simple: first available
    }
  }

  /**
   * Select agent with least number of completed tasks (for load balancing)
   * @private
   */
  _selectLeastLoadedAgent(agents) {
    return agents.reduce((least, agent) => {
      const leastTotal = least.tasksCompleted + least.tasksFailed;
      const agentTotal = agent.tasksCompleted + agent.tasksFailed;
      return agentTotal < leastTotal ? agent : least;
    });
  }

  /**
   * Select agent by best capability match
   * @private
   */
  _selectByCapability(agents, task) {
    // Prefer agents with exact capability match
    if (task.requiredCapability) {
      const exactMatch = agents.filter(agent =>
        agent.capabilities.includes(task.requiredCapability)
      );
      if (exactMatch.length > 0) {
        return exactMatch[0];
      }
    }
    return agents[0];
  }

  /**
   * Get coordinator status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      assignmentStrategy: this.assignmentStrategy,
      taskQueueStats: this.taskQueue.getStats(),
      agentRegistryStats: this.agentRegistry.getStats()
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('Coordinator shutting down...');
    this.stop();

    // Wait for in-progress tasks
    const inProgressTasks = this.taskQueue.getTasksByStatus(TaskStatus.IN_PROGRESS);
    if (inProgressTasks.length > 0) {
      logger.info({ count: inProgressTasks.length }, 'Waiting for in-progress tasks to complete...');
      // In production, you might want to implement a timeout here
    }

    logger.info('Coordinator shutdown complete');
  }
}
