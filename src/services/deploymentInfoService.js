/**
 * Deployment Info Service - Stub
 * TODO: Implement actual service logic
 */

export function getDeploymentInfo() {
  console.warn('deploymentInfoService: Using stub implementation');
  return {
    environment: 'development',
    version: '1.0.0',
    buildDate: new Date().toISOString()
  };
}

export default {
  getDeploymentInfo
};
