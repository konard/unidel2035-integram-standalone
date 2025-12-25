// menuConfigUnified.js - Unified menu configuration routes with switchable storage engines
// Issue #2271: Make LinkDB as alternative storage engine, not the only one

import express from 'express';
import logger from '../../utils/logger.js';
import MenuStorageAdapter, { StorageEngineType } from '../../services/menu/MenuStorageAdapter.js';

// Global storage adapter instance
// Default to FILE_BASED for stability, can be switched at runtime
let storageAdapter = new MenuStorageAdapter(StorageEngineType.FILE_BASED);

/**
 * Get current storage adapter (for testing)
 */
export function getStorageAdapter() {
  return storageAdapter;
}

/**
 * Set storage adapter (for testing)
 */
export function setStorageAdapter(adapter) {
  storageAdapter = adapter;
}

/**
 * Create unified menu configuration routes with switchable storage engines
 */
export function createMenuConfigUnifiedRoutes() {
  const router = express.Router();

  /**
   * GET /menu/config - Get current menu configuration
   */
  router.get('/menu/config', async (req, res, next) => {
    try {
      logger.info({ engine: storageAdapter.getEngineType() }, 'Fetching menu configuration');

      const config = await storageAdapter.getMenuConfig();

      if (!config) {
        // Return null config instead of 404 when nothing exists yet
        return res.json({
          success: true,
          response: {
            config: null,
            updatedAt: null,
            source: storageAdapter.getEngineType()
          }
        });
      }

      res.json({
        success: true,
        response: {
          config: config.config,
          updatedAt: config.updatedAt,
          source: config.source
        }
      });
    } catch (error) {
      logger.error({ error: error.message, stack: error.stack }, 'Error fetching menu configuration');

      // Return error but don't crash - graceful degradation
      res.status(500).json({
        success: false,
        error: 'Failed to fetch menu configuration',
        message: error.message,
        source: storageAdapter.getEngineType()
      });
    }
  });

  /**
   * POST /menu/config - Save menu configuration
   */
  router.post('/menu/config', async (req, res, next) => {
    try {
      const { config } = req.body;

      if (!config) {
        return res.status(400).json({
          error: 'Configuration is required',
          message: 'Request body must contain a "config" field with the menu configuration'
        });
      }

      logger.info({ engine: storageAdapter.getEngineType() }, 'Saving menu configuration');

      const result = await storageAdapter.saveMenuConfig(config);

      res.json({
        success: true,
        message: 'Menu configuration saved successfully',
        response: {
          updatedAt: result.updatedAt,
          source: result.source
        }
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Error saving menu configuration');
      next(error);
    }
  });

  /**
   * DELETE /menu/config - Delete menu configuration (reset to default)
   */
  router.delete('/menu/config', async (req, res, next) => {
    try {
      logger.info({ engine: storageAdapter.getEngineType() }, 'Deleting menu configuration');

      const result = await storageAdapter.deleteMenuConfig();

      res.json({
        success: true,
        message: 'Menu configuration deleted successfully',
        source: result.source
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Menu configuration not found',
          message: 'No menu configuration exists to delete'
        });
      }

      logger.error({ error: error.message }, 'Error deleting menu configuration');
      next(error);
    }
  });

  /**
   * GET /menu/items - Get all menu items (flat list)
   */
  router.get('/menu/items', async (req, res, next) => {
    try {
      logger.info({ engine: storageAdapter.getEngineType() }, 'Fetching all menu items');

      const items = await storageAdapter.getAllMenuItems();

      res.json({
        success: true,
        response: {
          items,
          count: items.length,
          source: storageAdapter.getEngineType()
        }
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Error fetching menu items');
      next(error);
    }
  });

  /**
   * GET /menu/statistics - Get menu storage statistics
   */
  router.get('/menu/statistics', async (req, res, next) => {
    try {
      logger.info({ engine: storageAdapter.getEngineType() }, 'Fetching menu storage statistics');

      const stats = await storageAdapter.getStatistics();

      res.json({
        success: true,
        response: stats
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Error fetching menu statistics');
      next(error);
    }
  });

  // ========================================
  // Storage Engine Management Routes
  // ========================================

  /**
   * GET /menu/storage-engine - Get current storage engine
   */
  router.get('/menu/storage-engine', async (req, res, next) => {
    try {
      const currentEngine = storageAdapter.getEngineType();

      // Check availability of both engines
      const fileBasedStatus = await storageAdapter.isEngineAvailable(StorageEngineType.FILE_BASED);
      const linkdbStatus = await storageAdapter.isEngineAvailable(StorageEngineType.LINKDB);

      res.json({
        success: true,
        response: {
          current: currentEngine,
          available: {
            [StorageEngineType.FILE_BASED]: fileBasedStatus,
            [StorageEngineType.LINKDB]: linkdbStatus
          }
        }
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Error getting storage engine status');
      next(error);
    }
  });

  /**
   * POST /menu/storage-engine/switch - Switch storage engine
   * Body: { "engine": "file-based" | "linkdb" }
   */
  router.post('/menu/storage-engine/switch', async (req, res, next) => {
    try {
      const { engine } = req.body;

      if (!engine) {
        return res.status(400).json({
          error: 'Engine type is required',
          message: 'Request body must contain an "engine" field',
          available: Object.values(StorageEngineType)
        });
      }

      if (!Object.values(StorageEngineType).includes(engine)) {
        return res.status(400).json({
          error: 'Invalid engine type',
          message: `Engine must be one of: ${Object.values(StorageEngineType).join(', ')}`,
          available: Object.values(StorageEngineType)
        });
      }

      // Check if target engine is available
      const status = await storageAdapter.isEngineAvailable(engine);
      if (!status.available) {
        return res.status(503).json({
          error: 'Storage engine not available',
          message: status.reason,
          details: status.error
        });
      }

      const previousEngine = storageAdapter.getEngineType();
      await storageAdapter.switchEngine(engine);

      logger.info(
        { previousEngine, newEngine: engine },
        'Storage engine switched successfully'
      );

      res.json({
        success: true,
        message: 'Storage engine switched successfully',
        response: {
          previousEngine,
          currentEngine: engine
        }
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Error switching storage engine');
      next(error);
    }
  });

  /**
   * POST /menu/storage-engine/migrate - Migrate data between engines
   * Body: { "from": "file-based", "to": "linkdb" }
   */
  router.post('/menu/storage-engine/migrate', async (req, res, next) => {
    try {
      const { from, to } = req.body;

      if (!from || !to) {
        return res.status(400).json({
          error: 'Source and target engines are required',
          message: 'Request body must contain "from" and "to" fields'
        });
      }

      if (!Object.values(StorageEngineType).includes(from) || !Object.values(StorageEngineType).includes(to)) {
        return res.status(400).json({
          error: 'Invalid engine types',
          message: `Engines must be one of: ${Object.values(StorageEngineType).join(', ')}`
        });
      }

      if (from === to) {
        return res.status(400).json({
          error: 'Source and target must be different',
          message: 'Cannot migrate to the same engine'
        });
      }

      logger.info({ from, to }, 'Starting menu data migration');

      // Create temporary adapters for source and target
      const sourceAdapter = new MenuStorageAdapter(from);
      const targetAdapter = new MenuStorageAdapter(to);

      // Check availability
      const sourceStatus = await sourceAdapter.isEngineAvailable(from);
      const targetStatus = await targetAdapter.isEngineAvailable(to);

      if (!sourceStatus.available) {
        return res.status(503).json({
          error: 'Source engine not available',
          message: sourceStatus.reason,
          details: sourceStatus.error
        });
      }

      if (!targetStatus.available) {
        return res.status(503).json({
          error: 'Target engine not available',
          message: targetStatus.reason,
          details: targetStatus.error
        });
      }

      // Get data from source
      const sourceConfig = await sourceAdapter.getMenuConfig();

      if (!sourceConfig || !sourceConfig.config) {
        return res.status(404).json({
          error: 'No data to migrate',
          message: 'Source engine has no menu configuration'
        });
      }

      // Save to target
      await targetAdapter.saveMenuConfig(sourceConfig.config);

      // Get statistics
      const sourceStats = await sourceAdapter.getStatistics();
      const targetStats = await targetAdapter.getStatistics();

      logger.info({ from, to, itemCount: sourceStats.totalItems }, 'Menu data migration completed');

      res.json({
        success: true,
        message: 'Menu data migrated successfully',
        response: {
          from,
          to,
          itemCount: sourceStats.totalItems,
          sourceStats,
          targetStats
        }
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Error migrating menu data');
      next(error);
    }
  });

  return router;
}
