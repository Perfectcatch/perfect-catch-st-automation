/**
 * Pricebook Management Tools
 * Update pricebook items locally and push to ServiceTitan
 */

import pg from 'pg';

const { Pool } = pg;
let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

// ServiceTitan API helper
async function stApiRequest(endpoint, method = 'GET', body = null) {
  const tenantId = process.env.SERVICE_TITAN_TENANT_ID;
  const clientId = process.env.SERVICE_TITAN_CLIENT_ID;
  const clientSecret = process.env.SERVICE_TITAN_CLIENT_SECRET;
  const appKey = process.env.SERVICE_TITAN_APP_KEY;

  // Get access token
  const tokenResponse = await fetch('https://auth.servicetitan.io/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Auth failed: ${tokenResponse.status}`);
  }

  const { access_token } = await tokenResponse.json();

  // Make API request
  const url = `https://api.servicetitan.io/pricebook/v2/tenant/${tenantId}${endpoint}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'ST-App-Key': appKey,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

// Tool 1: Update Equipment Price
export const updateEquipmentPrice = {
  name: 'update_equipment_price',
  description: 'Update the price of equipment in ServiceTitan pricebook. Changes are pushed to ST immediately.',
  inputSchema: {
    type: 'object',
    properties: {
      sku: { type: 'string', description: 'Equipment SKU/code (e.g., HAY-10-3202)' },
      stId: { type: 'number', description: 'ServiceTitan equipment ID (alternative to SKU)' },
      price: { type: 'number', description: 'New sell price' },
      cost: { type: 'number', description: 'New cost (optional)' },
      memberPrice: { type: 'number', description: 'New member price (optional)' },
    },
    required: ['price'],
  },
  async handler(params) {
    const client = await getPool().connect();

    try {
      // Find equipment by SKU or stId
      let equipment;
      if (params.stId) {
        const result = await client.query(
          'SELECT * FROM raw_st_pricebook_equipment WHERE st_id = $1',
          [params.stId]
        );
        equipment = result.rows[0];
      } else if (params.sku) {
        const result = await client.query(
          'SELECT * FROM raw_st_pricebook_equipment WHERE code = $1',
          [params.sku]
        );
        equipment = result.rows[0];
      } else {
        return { success: false, error: 'Must provide either sku or stId' };
      }

      if (!equipment) {
        return { success: false, error: `Equipment not found: ${params.sku || params.stId}` };
      }

      // Build update payload for ServiceTitan
      const stPayload = {
        price: params.price,
      };
      if (params.cost !== undefined) stPayload.cost = params.cost;
      if (params.memberPrice !== undefined) stPayload.memberPrice = params.memberPrice;

      // Push to ServiceTitan
      const stResponse = await stApiRequest(`/equipment/${equipment.st_id}`, 'PATCH', stPayload);

      if (!stResponse.ok) {
        return {
          success: false,
          error: `ServiceTitan update failed: ${stResponse.status}`,
          details: stResponse.data,
        };
      }

      // Update local database
      await client.query(`
        UPDATE raw_st_pricebook_equipment
        SET price = $1,
            cost = COALESCE($2, cost),
            member_price = COALESCE($3, member_price),
            local_modified_at = NOW(),
            sync_status = 'synced'
        WHERE st_id = $4
      `, [params.price, params.cost, params.memberPrice, equipment.st_id]);

      return {
        success: true,
        message: `Updated ${equipment.name} (${equipment.code})`,
        changes: {
          oldPrice: Number(equipment.price),
          newPrice: params.price,
          oldCost: params.cost !== undefined ? Number(equipment.cost) : undefined,
          newCost: params.cost,
        },
        stId: equipment.st_id,
        sku: equipment.code,
        pushedToST: true,
      };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      client.release();
    }
  },
};

// Tool 2: Update Material Price
export const updateMaterialPrice = {
  name: 'update_material_price',
  description: 'Update the price of a material in ServiceTitan pricebook. Changes are pushed to ST immediately.',
  inputSchema: {
    type: 'object',
    properties: {
      sku: { type: 'string', description: 'Material SKU/code' },
      stId: { type: 'number', description: 'ServiceTitan material ID (alternative to SKU)' },
      price: { type: 'number', description: 'New sell price' },
      cost: { type: 'number', description: 'New cost (optional)' },
      memberPrice: { type: 'number', description: 'New member price (optional)' },
    },
    required: ['price'],
  },
  async handler(params) {
    const client = await getPool().connect();

    try {
      let material;
      if (params.stId) {
        const result = await client.query(
          'SELECT * FROM raw_st_pricebook_materials WHERE st_id = $1',
          [params.stId]
        );
        material = result.rows[0];
      } else if (params.sku) {
        const result = await client.query(
          'SELECT * FROM raw_st_pricebook_materials WHERE code = $1',
          [params.sku]
        );
        material = result.rows[0];
      } else {
        return { success: false, error: 'Must provide either sku or stId' };
      }

      if (!material) {
        return { success: false, error: `Material not found: ${params.sku || params.stId}` };
      }

      const stPayload = { price: params.price };
      if (params.cost !== undefined) stPayload.cost = params.cost;
      if (params.memberPrice !== undefined) stPayload.memberPrice = params.memberPrice;

      const stResponse = await stApiRequest(`/materials/${material.st_id}`, 'PATCH', stPayload);

      if (!stResponse.ok) {
        return {
          success: false,
          error: `ServiceTitan update failed: ${stResponse.status}`,
          details: stResponse.data,
        };
      }

      await client.query(`
        UPDATE raw_st_pricebook_materials
        SET price = $1,
            cost = COALESCE($2, cost),
            member_price = COALESCE($3, member_price),
            local_modified_at = NOW(),
            sync_status = 'synced'
        WHERE st_id = $4
      `, [params.price, params.cost, params.memberPrice, material.st_id]);

      return {
        success: true,
        message: `Updated ${material.name} (${material.code})`,
        changes: {
          oldPrice: Number(material.price),
          newPrice: params.price,
        },
        stId: material.st_id,
        sku: material.code,
        pushedToST: true,
      };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      client.release();
    }
  },
};

// Tool 3: Update Service Price
export const updateServicePrice = {
  name: 'update_service_price',
  description: 'Update the price of a service in ServiceTitan pricebook. Changes are pushed to ST immediately.',
  inputSchema: {
    type: 'object',
    properties: {
      sku: { type: 'string', description: 'Service SKU/code' },
      stId: { type: 'number', description: 'ServiceTitan service ID (alternative to SKU)' },
      price: { type: 'number', description: 'New sell price' },
      memberPrice: { type: 'number', description: 'New member price (optional)' },
      durationHours: { type: 'number', description: 'Service duration in hours (optional)' },
    },
    required: ['price'],
  },
  async handler(params) {
    const client = await getPool().connect();

    try {
      let service;
      if (params.stId) {
        const result = await client.query(
          'SELECT * FROM raw_st_pricebook_services WHERE st_id = $1',
          [params.stId]
        );
        service = result.rows[0];
      } else if (params.sku) {
        const result = await client.query(
          'SELECT * FROM raw_st_pricebook_services WHERE code = $1',
          [params.sku]
        );
        service = result.rows[0];
      } else {
        return { success: false, error: 'Must provide either sku or stId' };
      }

      if (!service) {
        return { success: false, error: `Service not found: ${params.sku || params.stId}` };
      }

      const stPayload = { price: params.price };
      if (params.memberPrice !== undefined) stPayload.memberPrice = params.memberPrice;
      if (params.durationHours !== undefined) stPayload.durationHours = params.durationHours;

      const stResponse = await stApiRequest(`/services/${service.st_id}`, 'PATCH', stPayload);

      if (!stResponse.ok) {
        return {
          success: false,
          error: `ServiceTitan update failed: ${stResponse.status}`,
          details: stResponse.data,
        };
      }

      await client.query(`
        UPDATE raw_st_pricebook_services
        SET price = $1,
            member_price = COALESCE($2, member_price),
            duration_hours = COALESCE($3, duration_hours),
            local_modified_at = NOW(),
            sync_status = 'synced'
        WHERE st_id = $4
      `, [params.price, params.memberPrice, params.durationHours, service.st_id]);

      return {
        success: true,
        message: `Updated ${service.name} (${service.code})`,
        changes: {
          oldPrice: Number(service.price),
          newPrice: params.price,
        },
        stId: service.st_id,
        sku: service.code,
        pushedToST: true,
      };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      client.release();
    }
  },
};

// Tool 4: Bulk Update Prices (percentage increase/decrease)
export const bulkUpdatePrices = {
  name: 'bulk_update_prices',
  description: 'Apply a percentage price change to multiple items. Pushes all changes to ServiceTitan.',
  inputSchema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['equipment', 'material', 'service'], description: 'Item type to update' },
      category: { type: 'string', description: 'Category name to filter (optional)' },
      skus: { type: 'array', items: { type: 'string' }, description: 'Specific SKUs to update (optional)' },
      percentChange: { type: 'number', description: 'Percentage change (e.g., 5 for +5%, -10 for -10%)' },
      updateCost: { type: 'boolean', description: 'Also update cost by same percentage', default: false },
      dryRun: { type: 'boolean', description: 'Preview changes without applying', default: false },
    },
    required: ['type', 'percentChange'],
  },
  async handler(params) {
    const client = await getPool().connect();

    try {
      const table = {
        equipment: 'raw_st_pricebook_equipment',
        material: 'raw_st_pricebook_materials',
        service: 'raw_st_pricebook_services',
      }[params.type];

      const stEndpoint = {
        equipment: '/equipment',
        material: '/materials',
        service: '/services',
      }[params.type];

      // Build query to find items
      let sql = `SELECT st_id, code, name, price, cost FROM ${table} WHERE active = true`;
      const values = [];

      if (params.skus && params.skus.length > 0) {
        sql += ` AND code = ANY($1)`;
        values.push(params.skus);
      }

      sql += ' ORDER BY name LIMIT 100'; // Safety limit

      const result = await client.query(sql, values);
      const items = result.rows;

      if (items.length === 0) {
        return { success: false, error: 'No items found matching criteria' };
      }

      const multiplier = 1 + (params.percentChange / 100);
      const changes = [];
      const errors = [];

      for (const item of items) {
        const oldPrice = Number(item.price) || 0;
        const newPrice = Math.round(oldPrice * multiplier * 100) / 100;
        const oldCost = Number(item.cost) || 0;
        const newCost = params.updateCost ? Math.round(oldCost * multiplier * 100) / 100 : oldCost;

        const change = {
          sku: item.code,
          name: item.name,
          oldPrice,
          newPrice,
          priceDiff: newPrice - oldPrice,
        };

        if (params.updateCost) {
          change.oldCost = oldCost;
          change.newCost = newCost;
        }

        if (!params.dryRun) {
          // Push to ServiceTitan
          const stPayload = { price: newPrice };
          if (params.updateCost) stPayload.cost = newCost;

          const stResponse = await stApiRequest(`${stEndpoint}/${item.st_id}`, 'PATCH', stPayload);

          if (stResponse.ok) {
            // Update local DB
            await client.query(`
              UPDATE ${table}
              SET price = $1, cost = $2, local_modified_at = NOW(), sync_status = 'synced'
              WHERE st_id = $3
            `, [newPrice, newCost, item.st_id]);
            change.pushed = true;
          } else {
            errors.push({ sku: item.code, error: stResponse.data });
            change.pushed = false;
          }
        }

        changes.push(change);
      }

      return {
        success: true,
        dryRun: params.dryRun,
        percentChange: params.percentChange,
        itemsProcessed: changes.length,
        errors: errors.length,
        changes: changes.slice(0, 20), // Limit response size
        message: params.dryRun
          ? `Preview: ${changes.length} items would be updated`
          : `Updated ${changes.length - errors.length} items, ${errors.length} errors`,
      };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      client.release();
    }
  },
};

// Tool 5: Get Item Pricing Details
export const getItemPricing = {
  name: 'get_item_pricing',
  description: 'Get detailed pricing information for a pricebook item including cost, price, margin, and member price.',
  inputSchema: {
    type: 'object',
    properties: {
      sku: { type: 'string', description: 'Item SKU/code' },
      type: { type: 'string', enum: ['equipment', 'material', 'service'], description: 'Item type (optional, will search all if not specified)' },
    },
    required: ['sku'],
  },
  async handler(params) {
    const client = await getPool().connect();

    try {
      const tables = params.type
        ? [{ name: params.type, table: `pricebook.pricebook_${params.type === 'material' ? 'materials' : params.type === 'service' ? 'services' : 'equipment'}` }]
        : [
            { name: 'equipment', table: 'raw_st_pricebook_equipment' },
            { name: 'material', table: 'raw_st_pricebook_materials' },
            { name: 'service', table: 'raw_st_pricebook_services' },
          ];

      for (const { name, table } of tables) {
        const result = await client.query(`
          SELECT st_id, code, name, description, cost, price, member_price, add_on_price, active,
                 manufacturer, model_number, last_synced_at
          FROM ${table}
          WHERE code = $1
        `, [params.sku]);

        if (result.rows.length > 0) {
          const item = result.rows[0];
          const cost = Number(item.cost) || 0;
          const price = Number(item.price) || 0;
          const margin = price > 0 ? ((price - cost) / price * 100).toFixed(1) : 0;
          const markup = cost > 0 ? ((price - cost) / cost * 100).toFixed(1) : 0;

          return {
            success: true,
            type: name,
            stId: item.st_id,
            sku: item.code,
            name: item.name,
            description: item.description,
            manufacturer: item.manufacturer,
            modelNumber: item.model_number,
            pricing: {
              cost,
              price,
              memberPrice: Number(item.member_price) || null,
              addOnPrice: Number(item.add_on_price) || null,
              margin: `${margin}%`,
              markup: `${markup}%`,
              profit: price - cost,
            },
            active: item.active,
            lastSynced: item.last_synced_at,
          };
        }
      }

      return { success: false, error: `Item not found: ${params.sku}` };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      client.release();
    }
  },
};

// Tool 6: Toggle Item Active Status
export const toggleItemActive = {
  name: 'toggle_item_active',
  description: 'Activate or deactivate a pricebook item in ServiceTitan.',
  inputSchema: {
    type: 'object',
    properties: {
      sku: { type: 'string', description: 'Item SKU/code' },
      type: { type: 'string', enum: ['equipment', 'material', 'service'], description: 'Item type' },
      active: { type: 'boolean', description: 'Set active status (true/false)' },
    },
    required: ['sku', 'type', 'active'],
  },
  async handler(params) {
    const client = await getPool().connect();

    try {
      const table = `pricebook.pricebook_${params.type === 'material' ? 'materials' : params.type === 'service' ? 'services' : 'equipment'}`;
      const stEndpoint = `/${params.type === 'material' ? 'materials' : params.type === 'service' ? 'services' : 'equipment'}`;

      const result = await client.query(`SELECT st_id, code, name, active FROM ${table} WHERE code = $1`, [params.sku]);

      if (result.rows.length === 0) {
        return { success: false, error: `Item not found: ${params.sku}` };
      }

      const item = result.rows[0];

      // Push to ServiceTitan
      const stResponse = await stApiRequest(`${stEndpoint}/${item.st_id}`, 'PATCH', { active: params.active });

      if (!stResponse.ok) {
        return {
          success: false,
          error: `ServiceTitan update failed: ${stResponse.status}`,
          details: stResponse.data,
        };
      }

      // Update local
      await client.query(`UPDATE ${table} SET active = $1, local_modified_at = NOW() WHERE st_id = $2`, [params.active, item.st_id]);

      return {
        success: true,
        message: `${params.active ? 'Activated' : 'Deactivated'} ${item.name} (${item.code})`,
        sku: item.code,
        wasActive: item.active,
        nowActive: params.active,
        pushedToST: true,
      };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      client.release();
    }
  },
};
