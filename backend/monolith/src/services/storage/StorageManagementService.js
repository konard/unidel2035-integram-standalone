/**
 * Storage Management Service
 * Issue #2670: storage-management-agent работа с реальными серверами
 *
 * Provides real storage management functionality:
 * - Disk usage monitoring
 * - File scanning and analysis
 * - File type statistics
 * - Cold storage candidate identification
 * - Duplicate file detection (hash-based)
 * - Activity logging
 *
 * Uses SystemResourcesMonitor for disk metrics
 */

import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import logger from '../../utils/logger.js';

const execAsync = promisify(exec);

export class StorageManagementService {
  constructor(options = {}) {
    this.scanRoots = options.scanRoots || ['/tmp', os.homedir()];
    this.activityLog = [];
    this.maxLogSize = options.maxLogSize || 1000;

    logger.info('StorageManagementService initialized', {
      scanRoots: this.scanRoots
    });
  }

  /**
   * Get storage statistics from system
   * Leverages disk metrics similar to SystemResourcesMonitor
   */
  async getStorageStats() {
    const platform = os.platform();
    let totalSize = 0;
    let totalUsed = 0;
    let totalAvailable = 0;

    try {
      if (platform === 'linux' || platform === 'darwin') {
        const { stdout } = await execAsync('df -k');
        const lines = stdout.trim().split('\n');

        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(/\s+/);
          if (parts.length >= 6) {
            const filesystem = parts[0];
            const size = parseInt(parts[1], 10) * 1024;
            const used = parseInt(parts[2], 10) * 1024;
            const available = parseInt(parts[3], 10) * 1024;

            // Only count real filesystems
            if (!filesystem.startsWith('/dev/loop') &&
                !filesystem.startsWith('tmpfs') &&
                !filesystem.startsWith('devtmpfs')) {
              totalSize += size;
              totalUsed += used;
              totalAvailable += available;
            }
          }
        }
      } else if (platform === 'win32') {
        const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
        const lines = stdout.trim().split('\n');

        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].trim().split(/\s+/);
          if (parts.length >= 3) {
            const free = parseInt(parts[1], 10);
            const size = parseInt(parts[2], 10);
            const used = size - free;

            totalSize += size;
            totalUsed += used;
            totalAvailable += free;
          }
        }
      }
    } catch (error) {
      logger.error('Failed to get storage stats', { error: error.message });
    }

    return {
      total: totalSize,
      used: totalUsed,
      available: totalAvailable,
      usagePercent: totalSize > 0 ? (totalUsed / totalSize) * 100 : 0
    };
  }

  /**
   * Scan directories and get file type statistics
   * @param {string[]} directories - Directories to scan
   * @param {number} maxDepth - Maximum recursion depth
   */
  async scanFileTypes(directories = this.scanRoots, maxDepth = 3) {
    const fileStats = new Map();

    const scanDirectory = async (dir, depth = 0) => {
      if (depth > maxDepth) return;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          try {
            if (entry.isDirectory()) {
              await scanDirectory(fullPath, depth + 1);
            } else if (entry.isFile()) {
              const stats = await fs.stat(fullPath);
              const ext = path.extname(entry.name).toLowerCase();
              const type = this.getFileType(ext);

              if (!fileStats.has(type)) {
                fileStats.set(type, { count: 0, size: 0, extensions: new Set() });
              }

              const typeStats = fileStats.get(type);
              typeStats.count++;
              typeStats.size += stats.size;
              if (ext) typeStats.extensions.add(ext);
            }
          } catch (error) {
            // Skip files/dirs we can't access
            logger.debug(`Skipping ${fullPath}: ${error.message}`);
          }
        }
      } catch (error) {
        logger.debug(`Cannot scan directory ${dir}: ${error.message}`);
      }
    };

    // Scan all directories
    await Promise.all(directories.map(dir => scanDirectory(dir)));

    // Convert to array with percentages
    const totalSize = Array.from(fileStats.values())
      .reduce((sum, stat) => sum + stat.size, 0);

    const result = Array.from(fileStats.entries()).map(([type, stats]) => ({
      type,
      count: stats.count,
      size: stats.size,
      percentage: totalSize > 0 ? (stats.size / totalSize) * 100 : 0,
      extensions: Array.from(stats.extensions)
    }));

    // Sort by size descending
    result.sort((a, b) => b.size - a.size);

    this.logActivity('Сканирование типов файлов',
      `Найдено ${result.length} типов файлов, всего ${this.formatBytes(totalSize)}`,
      'success');

    return result;
  }

  /**
   * Get file type category from extension
   */
  getFileType(ext) {
    const videoExts = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'];
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico'];
    const documentExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.odt'];
    const archiveExts = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'];
    const audioExts = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'];
    const codeExts = ['.js', '.ts', '.py', '.java', '.c', '.cpp', '.go', '.rs', '.php'];

    if (videoExts.includes(ext)) return 'Видео';
    if (imageExts.includes(ext)) return 'Изображения';
    if (documentExts.includes(ext)) return 'Документы';
    if (archiveExts.includes(ext)) return 'Архивы';
    if (audioExts.includes(ext)) return 'Аудио';
    if (codeExts.includes(ext)) return 'Код';

    return 'Прочее';
  }

  /**
   * Scan for cold storage candidates
   * Files that haven't been accessed in a while and are large
   */
  async scanColdStorageCandidates(options = {}) {
    const {
      directories = this.scanRoots,
      daysThreshold = 90,
      minSizeMB = 10,
      maxResults = 100
    } = options;

    const candidates = [];
    const minSizeBytes = minSizeMB * 1024 * 1024;
    const maxAgeMs = daysThreshold * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const scanDirectory = async (dir, depth = 0) => {
      if (depth > 3) return;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          try {
            if (entry.isDirectory()) {
              await scanDirectory(fullPath, depth + 1);
            } else if (entry.isFile()) {
              const stats = await fs.stat(fullPath);

              if (stats.size >= minSizeBytes) {
                const lastAccessMs = stats.atimeMs;
                const age = now - lastAccessMs;

                if (age >= maxAgeMs) {
                  candidates.push({
                    name: entry.name,
                    path: fullPath,
                    size: stats.size,
                    lastAccessed: new Date(lastAccessMs),
                    daysInactive: Math.floor(age / (24 * 60 * 60 * 1000))
                  });

                  if (candidates.length >= maxResults) {
                    return;
                  }
                }
              }
            }
          } catch (error) {
            logger.debug(`Skipping ${fullPath}: ${error.message}`);
          }
        }
      } catch (error) {
        logger.debug(`Cannot scan directory ${dir}: ${error.message}`);
      }
    };

    await Promise.all(directories.map(dir => scanDirectory(dir)));

    // Sort by size descending
    candidates.sort((a, b) => b.size - a.size);

    this.logActivity('Сканирование кандидатов для холодного хранилища',
      `Найдено ${candidates.length} файлов`,
      'success');

    return candidates;
  }

  /**
   * Scan for duplicate files using hash-based detection
   * @param {string[]} directories - Directories to scan
   * @param {number} minSizeMB - Minimum file size to check (avoid small files)
   */
  async scanDuplicates(directories = this.scanRoots, minSizeMB = 1) {
    const filesByHash = new Map();
    const minSizeBytes = minSizeMB * 1024 * 1024;
    let scannedCount = 0;

    const scanDirectory = async (dir, depth = 0) => {
      if (depth > 3) return;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          try {
            if (entry.isDirectory()) {
              await scanDirectory(fullPath, depth + 1);
            } else if (entry.isFile()) {
              const stats = await fs.stat(fullPath);

              if (stats.size >= minSizeBytes) {
                const hash = await this.calculateFileHash(fullPath);
                scannedCount++;

                if (!filesByHash.has(hash)) {
                  filesByHash.set(hash, []);
                }

                filesByHash.get(hash).push({
                  path: fullPath,
                  size: stats.size,
                  lastModified: new Date(stats.mtimeMs)
                });
              }
            }
          } catch (error) {
            logger.debug(`Skipping ${fullPath}: ${error.message}`);
          }
        }
      } catch (error) {
        logger.debug(`Cannot scan directory ${dir}: ${error.message}`);
      }
    };

    await Promise.all(directories.map(dir => scanDirectory(dir)));

    // Find duplicates (hash with more than 1 file)
    const duplicateGroups = [];
    let totalDuplicates = 0;
    let totalSize = 0;

    for (const [hash, files] of filesByHash.entries()) {
      if (files.length > 1) {
        duplicateGroups.push({
          hash,
          size: files[0].size,
          files
        });
        totalDuplicates += files.length - 1; // Count extras
        totalSize += files[0].size * (files.length - 1); // Size that can be freed
      }
    }

    // Sort by potential savings (size * count)
    duplicateGroups.sort((a, b) =>
      (b.size * b.files.length) - (a.size * a.files.length)
    );

    this.logActivity('Сканирование дубликатов',
      `Найдено ${totalDuplicates} дубликатов в ${duplicateGroups.length} группах, можно освободить ${this.formatBytes(totalSize)}`,
      'success');

    return {
      groups: duplicateGroups,
      stats: {
        scannedCount,
        duplicateCount: totalDuplicates,
        groupCount: duplicateGroups.length,
        potentialSavings: totalSize
      }
    };
  }

  /**
   * Calculate SHA-256 hash of a file for integrity verification
   * Security: Using SHA-256 instead of MD5 (CWE-327)
   * MD5 is cryptographically broken and unsuitable for file integrity checks
   */
  async calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = require('fs').createReadStream(filePath);

      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Log activity
   */
  logActivity(action, details, status = 'success') {
    const entry = {
      timestamp: new Date(),
      action,
      details,
      status
    };

    this.activityLog.unshift(entry);

    // Limit log size
    if (this.activityLog.length > this.maxLogSize) {
      this.activityLog.pop();
    }

    logger.info('Storage activity', entry);
  }

  /**
   * Get activity log
   */
  getActivityLog(limit = 100) {
    return this.activityLog.slice(0, limit);
  }

  /**
   * Format bytes to human-readable format
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

export default StorageManagementService;
