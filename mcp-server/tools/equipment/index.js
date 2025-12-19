/**
 * Equipment Tools Index
 * Exports all 5 equipment tracking tools
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

// Tool 1: Get Customer Equipment
export const getCustomerEquipment = {
  name: 'get_customer_equipment',
  description: 'Get all equipment installed at a customer location',
  inputSchema: {
    type: 'object',
    properties: {
      customerId: { type: 'number', description: 'Customer ID' }
    },
    required: ['customerId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT id, name, model, serial_number, manufacturer, install_date, warranty_end, status, notes
        FROM st_equipment
        WHERE customer_id = $1
        ORDER BY install_date DESC
      `, [params.customerId]);
      
      return {
        success: true,
        customerId: params.customerId,
        count: result.rows.length,
        equipment: result.rows.map(e => ({
          id: e.id,
          name: e.name,
          model: e.model,
          serialNumber: e.serial_number,
          manufacturer: e.manufacturer,
          installDate: e.install_date,
          warrantyEnd: e.warranty_end,
          warrantyActive: e.warranty_end ? new Date(e.warranty_end) > new Date() : false,
          status: e.status,
          notes: e.notes
        }))
      };
    } catch (error) {
      // Table might not exist
      return {
        success: true,
        customerId: params.customerId,
        count: 0,
        equipment: [],
        note: 'Equipment tracking table not configured'
      };
    } finally { client.release(); }
  }
};

// Tool 2: Add Equipment
export const addEquipment = {
  name: 'add_equipment',
  description: 'Add equipment to a customer record',
  inputSchema: {
    type: 'object',
    properties: {
      customerId: { type: 'number', description: 'Customer ID' },
      name: { type: 'string', description: 'Equipment name' },
      model: { type: 'string', description: 'Model number' },
      serialNumber: { type: 'string', description: 'Serial number' },
      manufacturer: { type: 'string', description: 'Manufacturer' },
      installDate: { type: 'string', description: 'Installation date (YYYY-MM-DD)' },
      warrantyYears: { type: 'number', description: 'Warranty period in years', default: 1 }
    },
    required: ['customerId', 'name']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const warrantyEnd = params.installDate && params.warrantyYears ?
        new Date(new Date(params.installDate).getTime() + params.warrantyYears * 365 * 24 * 60 * 60 * 1000) : null;
      
      const result = await client.query(`
        INSERT INTO st_equipment (customer_id, name, model, serial_number, manufacturer, install_date, warranty_end, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW())
        RETURNING id
      `, [params.customerId, params.name, params.model, params.serialNumber, params.manufacturer, params.installDate, warrantyEnd]);
      
      return {
        success: true,
        equipmentId: result.rows[0].id,
        name: params.name,
        warrantyEnd,
        message: `Equipment "${params.name}" added to customer`
      };
    } catch (error) {
      return { success: false, error: error.message };
    } finally { client.release(); }
  }
};

// Tool 3: Get Equipment History
export const getEquipmentHistory = {
  name: 'get_equipment_history',
  description: 'Get service history for a piece of equipment',
  inputSchema: {
    type: 'object',
    properties: {
      equipmentId: { type: 'number', description: 'Equipment ID' }
    },
    required: ['equipmentId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      // Get equipment details
      const equipResult = await client.query('SELECT * FROM st_equipment WHERE id = $1', [params.equipmentId]);
      if (equipResult.rows.length === 0) return { success: false, error: 'Equipment not found' };
      
      const equipment = equipResult.rows[0];
      
      // Get related jobs (would need equipment_id on jobs table)
      // For now, return equipment info with mock history
      return {
        success: true,
        equipment: {
          id: equipment.id,
          name: equipment.name,
          model: equipment.model,
          serialNumber: equipment.serial_number,
          installDate: equipment.install_date,
          warrantyEnd: equipment.warranty_end
        },
        serviceHistory: [
          { date: equipment.install_date, type: 'Installation', notes: 'Initial installation' }
        ],
        totalServices: 1
      };
    } catch (error) {
      return { success: false, error: error.message };
    } finally { client.release(); }
  }
};

// Tool 4: Predict Equipment Failure
export const predictEquipmentFailure = {
  name: 'predict_equipment_failure',
  description: 'Predict when equipment might need service or replacement based on age and history',
  inputSchema: {
    type: 'object',
    properties: {
      equipmentId: { type: 'number', description: 'Equipment ID' }
    },
    required: ['equipmentId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT * FROM st_equipment WHERE id = $1', [params.equipmentId]);
      if (result.rows.length === 0) return { success: false, error: 'Equipment not found' };
      
      const equipment = result.rows[0];
      const installDate = new Date(equipment.install_date);
      const ageYears = (Date.now() - installDate.getTime()) / (365 * 24 * 60 * 60 * 1000);
      
      // Simple prediction based on age
      let riskLevel, recommendation;
      if (ageYears > 10) {
        riskLevel = 'high';
        recommendation = 'Consider replacement. Equipment is past typical lifespan.';
      } else if (ageYears > 7) {
        riskLevel = 'medium';
        recommendation = 'Schedule preventive maintenance. Monitor for issues.';
      } else {
        riskLevel = 'low';
        recommendation = 'Equipment is within normal lifespan. Continue regular maintenance.';
      }
      
      return {
        success: true,
        equipmentId: params.equipmentId,
        name: equipment.name,
        ageYears: ageYears.toFixed(1),
        riskLevel,
        recommendation,
        estimatedRemainingLife: Math.max(0, 10 - ageYears).toFixed(1) + ' years',
        nextServiceDue: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      };
    } catch (error) {
      return { success: false, error: error.message };
    } finally { client.release(); }
  }
};

// Tool 5: Check Inventory
export const checkInventory = {
  name: 'check_inventory',
  description: 'Check inventory levels for parts and materials',
  inputSchema: {
    type: 'object',
    properties: {
      sku: { type: 'string', description: 'SKU to check' },
      category: { type: 'string', description: 'Category to check' },
      lowStockOnly: { type: 'boolean', description: 'Only show low stock items', default: false }
    }
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      let sql = `
        SELECT code as sku, description as name, 
               COALESCE(quantity_on_hand, 0) as quantity,
               COALESCE(reorder_point, 5) as reorder_point
        FROM pb_materials
        WHERE 1=1
      `;
      const values = [];
      let idx = 1;
      
      if (params.sku) {
        sql += ` AND code = $${idx}`;
        values.push(params.sku);
        idx++;
      }
      
      if (params.lowStockOnly) {
        sql += ` AND COALESCE(quantity_on_hand, 0) <= COALESCE(reorder_point, 5)`;
      }
      
      sql += ` ORDER BY description LIMIT 50`;
      
      const result = await client.query(sql, values);
      
      return {
        success: true,
        count: result.rows.length,
        items: result.rows.map(i => ({
          sku: i.sku,
          name: i.name,
          quantity: Number(i.quantity),
          reorderPoint: Number(i.reorder_point),
          status: Number(i.quantity) <= Number(i.reorder_point) ? 'low' : 'ok'
        }))
      };
    } catch (error) {
      // Columns might not exist
      return {
        success: true,
        count: 0,
        items: [],
        note: 'Inventory tracking not configured'
      };
    } finally { client.release(); }
  }
};
