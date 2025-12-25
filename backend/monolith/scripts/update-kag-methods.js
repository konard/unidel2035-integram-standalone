/**
 * Helper script to update remaining KAG indexing methods with namespace support
 *
 * This script shows the pattern that needs to be applied to:
 * - indexPullRequests
 * - indexCodeFiles
 * - indexDocumentation
 * - indexCommitHistory
 *
 * Usage: This is a reference script - changes should be applied manually or via git patch
 */

// Pattern 1: Add owner/repo/namespace to method signature
const methodSignaturePattern = `
BEFORE:
async indexPullRequests(options = {}) {
  const { max = 100, since = null } = options;

AFTER:
async indexPullRequests(options = {}) {
  const {
    owner = this.owner,
    repo = this.repo,
    namespace = 'dronedoc2025',
    max = 100,
    since = null
  } = options;
`;

// Pattern 2: Update GitHub API calls
const apiCallPattern = `
BEFORE:
const prs = await this.octokit.rest.pulls.list({
  owner: this.owner,
  repo: this.repo,
  state: 'all',
  per_page: Math.min(max, 100)
});

AFTER:
const prs = await this.octokit.rest.pulls.list({
  owner,
  repo,
  state: 'all',
  per_page: Math.min(max, 100)
});
`;

// Pattern 3: Create namespaced entity IDs
const entityIdPattern = `
BEFORE:
const prEntity = {
  id: \`pr_\${pr.number}\`,
  type: 'PullRequest',
  name: \`PR #\${pr.number}: \${pr.title}\`,
  properties: {
    number: pr.number,
    // ...
  }
};

AFTER:
const prId = this.createNamespacedId(namespace, \`pr_\${pr.number}\`);
const prEntity = {
  id: prId,
  type: 'PullRequest',
  name: \`PR #\${pr.number}: \${pr.title}\`,
  namespace,
  repository: \`\${owner}/\${repo}\`,
  properties: {
    number: pr.number,
    namespace,
    repository: \`\${owner}/\${repo}\`,
    // ...
  },
  observations: [
    \`Repository: \${owner}/\${repo}\`,
    // ... existing observations
  ]
};
`;

// Pattern 4: Update relations to use namespaced IDs
const relationPattern = `
BEFORE:
this.addRelation({
  from: \`pr_\${pr.number}\`,
  to: \`user_\${pr.user.login}\`,
  type: 'created_by'
});

AFTER:
const prId = this.createNamespacedId(namespace, \`pr_\${pr.number}\`);
const authorId = this.createNamespacedId(namespace, \`user_\${pr.user.login}\`);

this.addRelation({
  from: prId,
  to: authorId,
  type: 'created_by'
});
`;

console.log('=== KAG Method Update Patterns ===\n');
console.log('1. Method Signature:', methodSignaturePattern);
console.log('\n2. API Calls:', apiCallPattern);
console.log('\n3. Entity IDs:', entityIdPattern);
console.log('\n4. Relations:', relationPattern);

// Export patterns for automated patching
module.exports = {
  methodSignaturePattern,
  apiCallPattern,
  entityIdPattern,
  relationPattern
};
