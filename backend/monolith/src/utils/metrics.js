// metrics.js - Basic metrics tracking
import logger from './logger.js';

class MetricsCollector {
  constructor() {
    this.metrics = {
      tasksCreated: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      tasksInProgress: 0,
      agentsRegistered: 0,
      agentsActive: 0
    };
  }

  increment(metric) {
    if (this.metrics.hasOwnProperty(metric)) {
      this.metrics[metric]++;
      logger.debug({ metric, value: this.metrics[metric] }, 'Metric incremented');
    }
  }

  decrement(metric) {
    if (this.metrics.hasOwnProperty(metric)) {
      this.metrics[metric]--;
      logger.debug({ metric, value: this.metrics[metric] }, 'Metric decremented');
    }
  }

  set(metric, value) {
    if (this.metrics.hasOwnProperty(metric)) {
      this.metrics[metric] = value;
      logger.debug({ metric, value }, 'Metric set');
    }
  }

  get(metric) {
    return this.metrics[metric] || 0;
  }

  getAll() {
    return { ...this.metrics };
  }

  reset() {
    Object.keys(this.metrics).forEach(key => {
      this.metrics[key] = 0;
    });
    logger.info('Metrics reset');
  }

  // Histogram/timing metrics (simple implementation)
  recordHistogram(metric, value) {
    logger.debug({ metric, value }, 'Histogram metric recorded');
    // In a production system, this would push to a time-series database
    // For now, just log it
  }

  // Gauge metric
  recordGauge(metric, value) {
    logger.debug({ metric, value }, 'Gauge metric recorded');
  }
}

export default new MetricsCollector();
