/**
 * Chat Agent Service - Stub
 * TODO: Implement actual service logic
 */

export function getAvailableAgents() {
  console.warn('chatAgentService: Using stub implementation');
  return [];
}

export function sendMessageToAgent(agentId, message) {
  console.warn('chatAgentService: Using stub implementation');
  return Promise.resolve({ success: false, message: 'Service not implemented' });
}

export default {
  getAvailableAgents,
  sendMessageToAgent
};
