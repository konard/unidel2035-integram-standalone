// Stub deployment info service
export async function getDeploymentInfo() {
  return {
    version: '1.0.0',
    environment: 'development',
    deployedAt: new Date().toISOString(),
    branch: 'main',
    commit: 'unknown'
  }
}
