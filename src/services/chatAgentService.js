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

export function executeCode(code, language) {
  console.warn('chatAgentService: Using stub implementation');
  return Promise.resolve({
    success: false,
    message: 'Code execution not implemented',
    output: '',
    error: 'Service not implemented'
  });
}

export function installDependencies(execId, dependencies) {
  console.warn('chatAgentService: Using stub implementation');
  return Promise.resolve({
    success: false,
    message: 'Dependency installation not implemented'
  });
}

export function cleanupSandbox(execId) {
  console.warn('chatAgentService: Using stub implementation');
  return Promise.resolve({ success: true });
}

export default {
  getAvailableAgents,
  sendMessageToAgent,
  executeCode,
  installDependencies,
  cleanupSandbox
};
