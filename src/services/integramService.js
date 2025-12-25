/**
 * Integram Service
 *
 * Additional service layer for Integram operations
 * Complements integramApiClient with higher-level operations
 */

import integramApiClient from './integramApiClient';

class IntegramService {
  /**
   * Get objects from a type with filters
   */
  async getObjects(typeId, filters = {}) {
    return integramApiClient.getObjectList(typeId, filters);
  }

  /**
   * Delete an object
   */
  async deleteObject(objectId) {
    return integramApiClient.deleteObject(objectId);
  }

  /**
   * Execute a report
   */
  async executeReport(reportId, params = {}) {
    const response = await integramApiClient.post(
      `/api/${integramApiClient.currentDatabase}/report/${reportId}/execute`,
      params
    );
    return response.data;
  }

  /**
   * Get all objects from a type (paginated)
   */
  async getAllObjects(typeId, pageSize = 100, maxPages = 50) {
    return integramApiClient.getAllObjects(typeId, pageSize, maxPages);
  }

  /**
   * Create a new object
   */
  async createObject(typeId, value, requisites = {}, parentId = null) {
    return integramApiClient.createObject(typeId, value, requisites, parentId);
  }

  /**
   * Update an object
   */
  async updateObject(objectId, typeId, value, requisites = {}) {
    return integramApiClient.saveObject(objectId, typeId, value, requisites);
  }
}

// Export singleton instance
const integramService = new IntegramService();
export default integramService;
