// menuConfig.js - Menu configuration management routes
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default menu configuration storage path
const MENU_CONFIG_DIR = path.join(__dirname, '../../../data');
const MENU_CONFIG_FILE = path.join(MENU_CONFIG_DIR, 'menu-config.json');

/**
 * Ensure the data directory exists
 */
async function ensureDataDirectory() {
  try {
    await fs.access(MENU_CONFIG_DIR);
  } catch (error) {
    await fs.mkdir(MENU_CONFIG_DIR, { recursive: true });
    logger.info('Created data directory for menu configuration');
  }
}

/**
 * Read menu configuration from file
 */
async function readMenuConfig() {
  try {
    await ensureDataDirectory();
    const data = await fs.readFile(MENU_CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null; // File doesn't exist yet
    }
    throw error;
  }
}

/**
 * Write menu configuration to file
 */
async function writeMenuConfig(config) {
  try {
    await ensureDataDirectory();
    await fs.writeFile(MENU_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    logger.info('Menu configuration saved successfully');
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to save menu configuration');
    throw error;
  }
}

export function createMenuConfigRoutes() {
  const router = express.Router();

  /**
   * GET /menu/config - Get current menu configuration
   */
  router.get('/menu/config', async (req, res, next) => {
    try {
      logger.info('Fetching menu configuration');
      const config = await readMenuConfig();

      if (!config) {
        // Return null config instead of 404 when file doesn't exist
        // This is expected behavior for first-time access
        return res.json({
          success: true,
          response: {
            config: null,
            updatedAt: null
          }
        });
      }

      res.json({
        success: true,
        response: {
          config: config.config,
          updatedAt: config.updatedAt
        }
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Error fetching menu configuration');
      next(error);
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

      // Validate that config is a valid JSON string
      try {
        JSON.parse(config);
      } catch (error) {
        return res.status(400).json({
          error: 'Invalid configuration format',
          message: 'The config field must be a valid JSON string'
        });
      }

      const menuConfig = {
        config,
        updatedAt: new Date().toISOString()
      };

      await writeMenuConfig(menuConfig);

      logger.info('Menu configuration saved successfully');

      res.json({
        success: true,
        message: 'Menu configuration saved successfully',
        response: {
          updatedAt: menuConfig.updatedAt
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
      await fs.unlink(MENU_CONFIG_FILE);
      logger.info('Menu configuration deleted successfully');

      res.json({
        success: true,
        message: 'Menu configuration deleted successfully'
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({
          error: 'Menu configuration not found',
          message: 'No menu configuration exists to delete'
        });
      }
      logger.error({ error: error.message }, 'Error deleting menu configuration');
      next(error);
    }
  });

  return router;
}
