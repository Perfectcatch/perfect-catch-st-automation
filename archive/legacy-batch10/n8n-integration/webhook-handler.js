/**
 * n8n Webhook Handler
 * Processes incoming webhooks from n8n workflows
 */

import { createLogger } from '../../lib/logger.js';
import config from '../../config/index.js';

const logger = createLogger('n8n-webhook');

export class N8nWebhookHandler {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   * @param {Object} stClient - ServiceTitan API client
   */
  constructor(prisma, stClient) {
    this.prisma = prisma;
    this.stClient = stClient;
    this.tenantId = config.serviceTitan.tenantId;
    this.logger = logger;
  }

  /**
   * Handle incoming webhook
   * @param {Object} payload - Webhook payload
   * @returns {Promise<Object>} Response
   */
  async handleWebhook(payload) {
    const { action, entity, data, options = {} } = payload;

    if (!action || !entity) {
      throw new Error('Missing required fields: action, entity');
    }

    this.logger.info({ action, entity }, 'Processing n8n webhook');

    const actionKey = `${action}_${entity}`;

    switch (actionKey) {
      case 'create_material':
        return this.createMaterial(data);

      case 'create_materials':
        return this.createMaterials(data);

      case 'update_material':
        return this.updateMaterial(data);

      case 'delete_material':
        return this.deleteMaterial(data);

      case 'query_materials':
        return this.queryMaterials(data);

      case 'create_service':
        return this.createService(data);

      case 'update_service':
        return this.updateService(data);

      case 'query_services':
        return this.queryServices(data);

      case 'create_category':
        return this.createCategory(data);

      case 'query_categories':
        return this.queryCategories(data);

      case 'sync_pricebook':
        return this.triggerSync(data, options);

      case 'get_sync_status':
        return this.getSyncStatus();

      case 'search_pricebook':
        return this.searchPricebook(data);

      default:
        throw new Error(`Unknown action: ${action} ${entity}`);
    }
  }

  /**
   * Create a single material
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async createMaterial(data) {
    this.validateRequired(data, ['name', 'categoryId', 'code']);

    const url = `https://api.servicetitan.io/pricebook/v2/tenant/${this.tenantId}/materials`;

    const response = await this.stClient.stRequest(url, {
      method: 'POST',
      body: {
        code: data.code,
        displayName: data.name,
        description: data.description || '',
        price: data.price || 0,
        cost: data.cost || 0,
        unitOfMeasure: data.unitOfMeasure || 'Each',
        active: data.active !== false,
        categoryId: data.categoryId,
        manufacturer: data.manufacturer,
        sku: data.sku,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to create material in ST: ${JSON.stringify(response.data)}`);
    }

    // Save to local DB
    const localMaterial = await this.prisma.pricebookMaterial.create({
      data: {
        stId: BigInt(response.data.id),
        tenantId: BigInt(this.tenantId),
        categoryId: BigInt(data.categoryId),
        code: data.code,
        name: data.name,
        description: data.description || '',
        price: data.price || 0,
        cost: data.cost || 0,
        unitOfMeasure: data.unitOfMeasure || 'Each',
        active: data.active !== false,
        manufacturer: data.manufacturer,
        sku: data.sku,
        syncStatus: 'synced',
        syncDirection: 'to_st',
        lastSyncedAt: new Date(),
      },
    });

    // Log the change
    await this.logChange('material', localMaterial.id, response.data.id, 'create', 'n8n');

    this.logger.info({ stId: response.data.id, name: data.name }, 'Material created via n8n');

    return {
      success: true,
      material: {
        id: localMaterial.id,
        stId: response.data.id,
        name: data.name,
        code: data.code,
      },
    };
  }

  /**
   * Create multiple materials (batch)
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async createMaterials(data) {
    const { materials, categoryId } = data;

    if (!Array.isArray(materials) || materials.length === 0) {
      throw new Error('materials array is required');
    }

    const results = {
      success: true,
      created: [],
      failed: [],
    };

    for (const material of materials) {
      try {
        const result = await this.createMaterial({
          ...material,
          categoryId: material.categoryId || categoryId,
        });
        results.created.push(result.material);
      } catch (error) {
        results.failed.push({
          name: material.name,
          error: error.message,
        });
      }
    }

    results.success = results.failed.length === 0;

    return results;
  }

  /**
   * Update a material
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async updateMaterial(data) {
    const { id, stId, ...updates } = data;

    if (!id && !stId) {
      throw new Error('Either id or stId is required');
    }

    // Find material
    const material = await this.prisma.pricebookMaterial.findFirst({
      where: id ? { id } : { stId: BigInt(stId) },
    });

    if (!material) {
      throw new Error('Material not found');
    }

    // Update in ST
    const url = `https://api.servicetitan.io/pricebook/v2/tenant/${this.tenantId}/materials/${material.stId}`;

    const stUpdates = {};
    if (updates.name) stUpdates.displayName = updates.name;
    if (updates.price !== undefined) stUpdates.price = updates.price;
    if (updates.cost !== undefined) stUpdates.cost = updates.cost;
    if (updates.description) stUpdates.description = updates.description;
    if (updates.active !== undefined) stUpdates.active = updates.active;

    const response = await this.stClient.stRequest(url, {
      method: 'PATCH',
      body: stUpdates,
    });

    if (!response.ok) {
      throw new Error(`Failed to update material in ST: ${JSON.stringify(response.data)}`);
    }

    // Update local DB
    const updatedMaterial = await this.prisma.pricebookMaterial.update({
      where: { id: material.id },
      data: {
        ...updates,
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
      },
    });

    await this.logChange('material', material.id, material.stId, 'update', 'n8n');

    return {
      success: true,
      material: {
        id: updatedMaterial.id,
        stId: material.stId.toString(),
        name: updatedMaterial.name,
      },
    };
  }

  /**
   * Delete (deactivate) a material
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async deleteMaterial(data) {
    const { id, stId, hardDelete = false } = data;

    if (!id && !stId) {
      throw new Error('Either id or stId is required');
    }

    const material = await this.prisma.pricebookMaterial.findFirst({
      where: id ? { id } : { stId: BigInt(stId) },
    });

    if (!material) {
      throw new Error('Material not found');
    }

    // Deactivate in ST (ST doesn't support hard delete)
    const url = `https://api.servicetitan.io/pricebook/v2/tenant/${this.tenantId}/materials/${material.stId}`;

    await this.stClient.stRequest(url, {
      method: 'PATCH',
      body: { active: false },
    });

    // Soft delete locally
    await this.prisma.pricebookMaterial.update({
      where: { id: material.id },
      data: {
        active: false,
        deletedAt: new Date(),
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
      },
    });

    await this.logChange('material', material.id, material.stId, 'delete', 'n8n');

    return {
      success: true,
      message: 'Material deactivated',
      stId: material.stId.toString(),
    };
  }

  /**
   * Query materials
   * @param {Object} filters
   * @returns {Promise<Object>}
   */
  async queryMaterials(filters = {}) {
    const where = { deletedAt: null };

    if (filters.categoryId) {
      where.categoryId = BigInt(filters.categoryId);
    }
    if (filters.active !== undefined) {
      where.active = filters.active;
    }
    if (filters.name) {
      where.name = { contains: filters.name, mode: 'insensitive' };
    }
    if (filters.code) {
      where.code = { contains: filters.code, mode: 'insensitive' };
    }

    const materials = await this.prisma.pricebookMaterial.findMany({
      where,
      orderBy: { name: 'asc' },
      take: filters.limit || 100,
      skip: filters.offset || 0,
    });

    return {
      success: true,
      count: materials.length,
      materials: materials.map(m => ({
        id: m.id,
        stId: m.stId.toString(),
        name: m.name,
        code: m.code,
        price: m.price ? Number(m.price) : null,
        cost: m.cost ? Number(m.cost) : null,
        categoryId: m.categoryId?.toString(),
        active: m.active,
      })),
    };
  }

  /**
   * Create a service
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async createService(data) {
    this.validateRequired(data, ['name', 'categoryId', 'code']);

    const url = `https://api.servicetitan.io/pricebook/v2/tenant/${this.tenantId}/services`;

    const response = await this.stClient.stRequest(url, {
      method: 'POST',
      body: {
        code: data.code,
        displayName: data.name,
        description: data.description || '',
        price: data.price || 0,
        active: data.active !== false,
        categoryId: data.categoryId,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to create service in ST: ${JSON.stringify(response.data)}`);
    }

    const localService = await this.prisma.pricebookService.create({
      data: {
        stId: BigInt(response.data.id),
        tenantId: BigInt(this.tenantId),
        categoryId: BigInt(data.categoryId),
        code: data.code,
        name: data.name,
        description: data.description || '',
        price: data.price || 0,
        active: data.active !== false,
        syncStatus: 'synced',
        syncDirection: 'to_st',
        lastSyncedAt: new Date(),
      },
    });

    await this.logChange('service', localService.id, response.data.id, 'create', 'n8n');

    return {
      success: true,
      service: {
        id: localService.id,
        stId: response.data.id,
        name: data.name,
        code: data.code,
      },
    };
  }

  /**
   * Update a service
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async updateService(data) {
    const { id, stId, ...updates } = data;

    if (!id && !stId) {
      throw new Error('Either id or stId is required');
    }

    const service = await this.prisma.pricebookService.findFirst({
      where: id ? { id } : { stId: BigInt(stId) },
    });

    if (!service) {
      throw new Error('Service not found');
    }

    const url = `https://api.servicetitan.io/pricebook/v2/tenant/${this.tenantId}/services/${service.stId}`;

    const stUpdates = {};
    if (updates.name) stUpdates.displayName = updates.name;
    if (updates.price !== undefined) stUpdates.price = updates.price;
    if (updates.description) stUpdates.description = updates.description;
    if (updates.active !== undefined) stUpdates.active = updates.active;

    const response = await this.stClient.stRequest(url, {
      method: 'PATCH',
      body: stUpdates,
    });

    if (!response.ok) {
      throw new Error(`Failed to update service in ST: ${JSON.stringify(response.data)}`);
    }

    const updatedService = await this.prisma.pricebookService.update({
      where: { id: service.id },
      data: {
        ...updates,
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
      },
    });

    await this.logChange('service', service.id, service.stId, 'update', 'n8n');

    return {
      success: true,
      service: {
        id: updatedService.id,
        stId: service.stId.toString(),
        name: updatedService.name,
      },
    };
  }

  /**
   * Query services
   * @param {Object} filters
   * @returns {Promise<Object>}
   */
  async queryServices(filters = {}) {
    const where = { deletedAt: null };

    if (filters.categoryId) {
      where.categoryId = BigInt(filters.categoryId);
    }
    if (filters.active !== undefined) {
      where.active = filters.active;
    }
    if (filters.name) {
      where.name = { contains: filters.name, mode: 'insensitive' };
    }

    const services = await this.prisma.pricebookService.findMany({
      where,
      orderBy: { name: 'asc' },
      take: filters.limit || 100,
    });

    return {
      success: true,
      count: services.length,
      services: services.map(s => ({
        id: s.id,
        stId: s.stId.toString(),
        name: s.name,
        code: s.code,
        price: s.price ? Number(s.price) : null,
        categoryId: s.categoryId?.toString(),
        active: s.active,
      })),
    };
  }

  /**
   * Create a category
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async createCategory(data) {
    this.validateRequired(data, ['name']);

    const url = `https://api.servicetitan.io/pricebook/v2/tenant/${this.tenantId}/categories`;

    const response = await this.stClient.stRequest(url, {
      method: 'POST',
      body: {
        name: data.name,
        code: data.code,
        parentId: data.parentId,
        active: data.active !== false,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to create category in ST: ${JSON.stringify(response.data)}`);
    }

    const localCategory = await this.prisma.pricebookCategory.create({
      data: {
        stId: BigInt(response.data.id),
        tenantId: BigInt(this.tenantId),
        name: data.name,
        code: data.code,
        parentId: data.parentId ? BigInt(data.parentId) : null,
        active: data.active !== false,
        syncStatus: 'synced',
        syncDirection: 'to_st',
        lastSyncedAt: new Date(),
      },
    });

    await this.logChange('category', localCategory.id, response.data.id, 'create', 'n8n');

    return {
      success: true,
      category: {
        id: localCategory.id,
        stId: response.data.id,
        name: data.name,
      },
    };
  }

  /**
   * Query categories
   * @param {Object} filters
   * @returns {Promise<Object>}
   */
  async queryCategories(filters = {}) {
    const where = { deletedAt: null };

    if (filters.active !== undefined) {
      where.active = filters.active;
    }
    if (filters.parentId === null) {
      where.parentId = null;
    } else if (filters.parentId) {
      where.parentId = BigInt(filters.parentId);
    }

    const categories = await this.prisma.pricebookCategory.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return {
      success: true,
      count: categories.length,
      categories: categories.map(c => ({
        id: c.id,
        stId: c.stId.toString(),
        name: c.name,
        code: c.code,
        parentId: c.parentId?.toString(),
        active: c.active,
      })),
    };
  }

  /**
   * Trigger a pricebook sync
   * @param {Object} data
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async triggerSync(data = {}, options = {}) {
    // This would need access to the sync engine
    // For now, return a message indicating how to trigger sync
    return {
      success: true,
      message: 'Use POST /api/sync/pricebook/full or /api/sync/pricebook/incremental to trigger sync',
      endpoints: {
        fullSync: 'POST /api/sync/pricebook/full',
        incrementalSync: 'POST /api/sync/pricebook/incremental',
        status: 'GET /api/sync/pricebook/status',
      },
    };
  }

  /**
   * Get sync status
   * @returns {Promise<Object>}
   */
  async getSyncStatus() {
    const lastSync = await this.prisma.pricebookSyncLog.findFirst({
      orderBy: { startedAt: 'desc' },
    });

    const unresolvedConflicts = await this.prisma.pricebookSyncConflict.count({
      where: { status: 'unresolved' },
    });

    const counts = await Promise.all([
      this.prisma.pricebookCategory.count({ where: { deletedAt: null } }),
      this.prisma.pricebookMaterial.count({ where: { deletedAt: null } }),
      this.prisma.pricebookService.count({ where: { deletedAt: null } }),
      this.prisma.pricebookEquipment.count({ where: { deletedAt: null } }),
    ]);

    return {
      success: true,
      lastSync: lastSync ? {
        id: lastSync.id,
        type: lastSync.syncType,
        status: lastSync.status,
        startedAt: lastSync.startedAt,
        completedAt: lastSync.completedAt,
        recordsFetched: lastSync.recordsFetched,
        recordsCreated: lastSync.recordsCreated,
        recordsUpdated: lastSync.recordsUpdated,
      } : null,
      unresolvedConflicts,
      counts: {
        categories: counts[0],
        materials: counts[1],
        services: counts[2],
        equipment: counts[3],
      },
    };
  }

  /**
   * Search pricebook
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async searchPricebook(data) {
    const { query, entityTypes = ['materials', 'services', 'equipment'], limit = 20 } = data;

    if (!query) {
      throw new Error('Search query is required');
    }

    const results = {};

    if (entityTypes.includes('materials')) {
      results.materials = await this.prisma.pricebookMaterial.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { code: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
          deletedAt: null,
          active: true,
        },
        take: limit,
      });
    }

    if (entityTypes.includes('services')) {
      results.services = await this.prisma.pricebookService.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { code: { contains: query, mode: 'insensitive' } },
          ],
          deletedAt: null,
          active: true,
        },
        take: limit,
      });
    }

    if (entityTypes.includes('equipment')) {
      results.equipment = await this.prisma.pricebookEquipment.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { code: { contains: query, mode: 'insensitive' } },
          ],
          deletedAt: null,
          active: true,
        },
        take: limit,
      });
    }

    return {
      success: true,
      query,
      results,
    };
  }

  /**
   * Validate required fields
   * @param {Object} data
   * @param {Array<string>} fields
   */
  validateRequired(data, fields) {
    const missing = fields.filter(f => !data[f]);
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
  }

  /**
   * Log a change to the audit table
   * @param {string} entityType
   * @param {string} entityId
   * @param {BigInt|string} stId
   * @param {string} action
   * @param {string} source
   */
  async logChange(entityType, entityId, stId, action, source) {
    try {
      await this.prisma.pricebookChange.create({
        data: {
          entityType,
          entityId,
          stId: BigInt(stId),
          action,
          source,
        },
      });
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to log change');
    }
  }
}

export default N8nWebhookHandler;
