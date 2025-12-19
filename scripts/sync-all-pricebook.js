#!/usr/bin/env node
/**
 * Sync ALL Pricebook Items (Active + Inactive)
 * Fetches equipment, materials, and services from ServiceTitan
 * including inactive items, and upserts to pricebook schema
 */

import dotenv from 'dotenv';
dotenv.config();

import pkg from 'pg';
const { Pool } = pkg;

const tenantId = process.env.SERVICE_TITAN_TENANT_ID;
const clientId = process.env.SERVICE_TITAN_CLIENT_ID;
const clientSecret = process.env.SERVICE_TITAN_CLIENT_SECRET;
const appKey = process.env.SERVICE_TITAN_APP_KEY;

// Direct connection to pricebook schema
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Catchadmin@2025@localhost:6432/perfectcatch_automation',
});

let accessToken = null;

async function getAccessToken() {
  if (accessToken) return accessToken;

  const response = await fetch('https://auth.servicetitan.io/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    throw new Error(`Auth failed: ${response.status}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  return accessToken;
}

async function stRequest(url, options = {}) {
  const token = await getAccessToken();
  const queryString = options.query ? '?' + new URLSearchParams(options.query).toString() : '';

  const response = await fetch(url + queryString, {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'ST-App-Key': appKey,
      'Content-Type': 'application/json',
    },
  });

  return {
    ok: response.ok,
    status: response.status,
    data: await response.json(),
  };
}

async function fetchItemsByStatus(entityType, active) {
  const items = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `https://api.servicetitan.io/pricebook/v2/tenant/${tenantId}/${entityType}`;
    const response = await stRequest(url, {
      method: 'GET',
      query: {
        page,
        pageSize: 1000,
        active: active  // true for active, false for inactive
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${entityType}: ${response.status} - ${JSON.stringify(response.data)}`);
    }

    const data = response.data;
    const pageItems = data.data || [];
    items.push(...pageItems);

    console.log(`    Page ${page}: ${pageItems.length} items - Running total: ${items.length}`);

    hasMore = data.hasMore || false;
    page++;

    if (hasMore) await new Promise(r => setTimeout(r, 100));
  }

  return items;
}

async function fetchAllItems(entityType) {
  console.log(`\nFetching ALL ${entityType} from ServiceTitan...`);

  // Fetch active items
  console.log(`  Fetching ACTIVE ${entityType}:`);
  const activeItems = await fetchItemsByStatus(entityType, true);
  console.log(`  Active: ${activeItems.length}`);

  // Fetch inactive items
  console.log(`  Fetching INACTIVE ${entityType}:`);
  const inactiveItems = await fetchItemsByStatus(entityType, false);
  console.log(`  Inactive: ${inactiveItems.length}`);

  // Combine
  const allItems = [...activeItems, ...inactiveItems];
  console.log(`  TOTAL: ${allItems.length} (${activeItems.length} active, ${inactiveItems.length} inactive)`);

  return allItems;
}

async function upsertEquipment(items) {
  const client = await pool.connect();
  let created = 0, updated = 0;

  try {
    for (const item of items) {
      const result = await client.query(`
        INSERT INTO pricebook.pricebook_equipment (
          st_id, tenant_id, category_id, code, name, description, display_name,
          manufacturer, model_number, cost, price, member_price, add_on_price,
          recommended_hours, warranty_years, warranty_months, commission_bonus,
          pay_type, active, taxable, account, primary_vendor_id,
          images, assets, custom_fields, tags, external_data,
          st_created_on, st_modified_on, last_synced_at, sync_status, sync_direction
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, NOW(), 'synced', 'from_st'
        )
        ON CONFLICT (st_id) DO UPDATE SET
          category_id = EXCLUDED.category_id, code = EXCLUDED.code, name = EXCLUDED.name,
          description = EXCLUDED.description, display_name = EXCLUDED.display_name,
          manufacturer = EXCLUDED.manufacturer, model_number = EXCLUDED.model_number,
          cost = EXCLUDED.cost, price = EXCLUDED.price, member_price = EXCLUDED.member_price,
          add_on_price = EXCLUDED.add_on_price, recommended_hours = EXCLUDED.recommended_hours,
          warranty_years = EXCLUDED.warranty_years, warranty_months = EXCLUDED.warranty_months,
          commission_bonus = EXCLUDED.commission_bonus, pay_type = EXCLUDED.pay_type,
          active = EXCLUDED.active, taxable = EXCLUDED.taxable, account = EXCLUDED.account,
          primary_vendor_id = EXCLUDED.primary_vendor_id, images = EXCLUDED.images,
          assets = EXCLUDED.assets, custom_fields = EXCLUDED.custom_fields,
          tags = EXCLUDED.tags, external_data = EXCLUDED.external_data,
          st_modified_on = EXCLUDED.st_modified_on, last_synced_at = NOW(),
          sync_status = 'synced', local_modified_at = NOW()
        RETURNING (xmax = 0) AS inserted
      `, [
        item.id, tenantId, item.categoryId || null, item.code || '',
        item.name || item.displayName || '', item.description || null, item.displayName || null,
        item.manufacturer || null, item.modelNumber || null, item.cost || null,
        item.price || null, item.memberPrice || null, item.addOnPrice || null,
        item.recommendedHours || null, item.warrantyYears || null, item.warrantyMonths || null,
        item.commissionBonus || null, item.payType || null, item.active !== false,
        item.taxable !== false, item.account || null, item.primaryVendorId || null,
        JSON.stringify(item.images || []), JSON.stringify(item.assets || []),
        JSON.stringify(item.customFields || {}), JSON.stringify(item.tags || []),
        JSON.stringify(item.externalData || {}),
        item.createdOn ? new Date(item.createdOn) : null,
        item.modifiedOn ? new Date(item.modifiedOn) : null,
      ]);
      result.rows[0]?.inserted ? created++ : updated++;
    }
  } finally {
    client.release();
  }
  return { created, updated };
}

async function upsertMaterials(items) {
  const client = await pool.connect();
  let created = 0, updated = 0;

  try {
    for (const item of items) {
      const result = await client.query(`
        INSERT INTO pricebook.pricebook_materials (
          st_id, tenant_id, category_id, code, name, description, display_name,
          manufacturer, model_number, upc, sku, part_number,
          cost, price, member_price, add_on_price, hours,
          unit_of_measure, quantity_on_hand, quantity_on_order,
          warranty_months, commission_bonus, pay_type,
          active, taxable, cross_sell, account, primary_vendor_id,
          images, assets, custom_fields, tags, external_data,
          st_created_on, st_modified_on, last_synced_at, sync_status, sync_direction
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
          $31, $32, $33, $34, $35, NOW(), 'synced', 'from_st'
        )
        ON CONFLICT (st_id) DO UPDATE SET
          category_id = EXCLUDED.category_id, code = EXCLUDED.code, name = EXCLUDED.name,
          description = EXCLUDED.description, display_name = EXCLUDED.display_name,
          manufacturer = EXCLUDED.manufacturer, model_number = EXCLUDED.model_number,
          upc = EXCLUDED.upc, sku = EXCLUDED.sku, part_number = EXCLUDED.part_number,
          cost = EXCLUDED.cost, price = EXCLUDED.price, member_price = EXCLUDED.member_price,
          add_on_price = EXCLUDED.add_on_price, hours = EXCLUDED.hours,
          unit_of_measure = EXCLUDED.unit_of_measure, quantity_on_hand = EXCLUDED.quantity_on_hand,
          quantity_on_order = EXCLUDED.quantity_on_order, warranty_months = EXCLUDED.warranty_months,
          commission_bonus = EXCLUDED.commission_bonus, pay_type = EXCLUDED.pay_type,
          active = EXCLUDED.active, taxable = EXCLUDED.taxable, cross_sell = EXCLUDED.cross_sell,
          account = EXCLUDED.account, primary_vendor_id = EXCLUDED.primary_vendor_id,
          images = EXCLUDED.images, assets = EXCLUDED.assets, custom_fields = EXCLUDED.custom_fields,
          tags = EXCLUDED.tags, external_data = EXCLUDED.external_data,
          st_modified_on = EXCLUDED.st_modified_on, last_synced_at = NOW(),
          sync_status = 'synced', local_modified_at = NOW()
        RETURNING (xmax = 0) AS inserted
      `, [
        item.id, tenantId, item.categoryId || null, item.code || '',
        item.name || item.displayName || '', item.description || null, item.displayName || null,
        item.manufacturer || null, item.modelNumber || null, item.upc || null,
        item.sku || null, item.partNumber || null, item.cost || null,
        item.price || null, item.memberPrice || null, item.addOnPrice || null,
        item.hours || null, item.unitOfMeasure || null, item.quantityOnHand || null,
        item.quantityOnOrder || null, item.warrantyMonths || null, item.commissionBonus || null,
        item.payType || null, item.active !== false, item.taxable !== false,
        item.crossSell || false, item.account || null, item.primaryVendorId || null,
        JSON.stringify(item.images || []), JSON.stringify(item.assets || []),
        JSON.stringify(item.customFields || {}), JSON.stringify(item.tags || []),
        JSON.stringify(item.externalData || {}),
        item.createdOn ? new Date(item.createdOn) : null,
        item.modifiedOn ? new Date(item.modifiedOn) : null,
      ]);
      result.rows[0]?.inserted ? created++ : updated++;
    }
  } finally {
    client.release();
  }
  return { created, updated };
}

async function upsertServices(items) {
  const client = await pool.connect();
  let created = 0, updated = 0;

  try {
    for (const item of items) {
      const result = await client.query(`
        INSERT INTO pricebook.pricebook_services (
          st_id, tenant_id, category_id, code, name, description, display_name,
          price, member_price, add_on_price, duration_hours,
          recommended_hours, labor_rate, materials_included, equipment_included,
          warranty_months, commission_bonus, pay_type,
          active, taxable, account,
          images, assets, custom_fields, tags, external_data,
          st_created_on, st_modified_on, last_synced_at, sync_status, sync_direction
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, NOW(), 'synced', 'from_st'
        )
        ON CONFLICT (st_id) DO UPDATE SET
          category_id = EXCLUDED.category_id, code = EXCLUDED.code, name = EXCLUDED.name,
          description = EXCLUDED.description, display_name = EXCLUDED.display_name,
          price = EXCLUDED.price, member_price = EXCLUDED.member_price,
          add_on_price = EXCLUDED.add_on_price, duration_hours = EXCLUDED.duration_hours,
          recommended_hours = EXCLUDED.recommended_hours, labor_rate = EXCLUDED.labor_rate,
          materials_included = EXCLUDED.materials_included, equipment_included = EXCLUDED.equipment_included,
          warranty_months = EXCLUDED.warranty_months, commission_bonus = EXCLUDED.commission_bonus,
          pay_type = EXCLUDED.pay_type, active = EXCLUDED.active, taxable = EXCLUDED.taxable,
          account = EXCLUDED.account, images = EXCLUDED.images, assets = EXCLUDED.assets,
          custom_fields = EXCLUDED.custom_fields, tags = EXCLUDED.tags,
          external_data = EXCLUDED.external_data, st_modified_on = EXCLUDED.st_modified_on,
          last_synced_at = NOW(), sync_status = 'synced', local_modified_at = NOW()
        RETURNING (xmax = 0) AS inserted
      `, [
        item.id, tenantId, item.categoryId || null, item.code || '',
        item.name || item.displayName || '', item.description || null, item.displayName || null,
        item.price || null, item.memberPrice || null, item.addOnPrice || null,
        item.durationHours || null, item.recommendedHours || null, item.laborRate || null,
        JSON.stringify(item.materialsIncluded || []), JSON.stringify(item.equipmentIncluded || []),
        item.warrantyMonths || null, item.commissionBonus || null, item.payType || null,
        item.active !== false, item.taxable !== false, item.account || null,
        JSON.stringify(item.images || []), JSON.stringify(item.assets || []),
        JSON.stringify(item.customFields || {}), JSON.stringify(item.tags || []),
        JSON.stringify(item.externalData || {}),
        item.createdOn ? new Date(item.createdOn) : null,
        item.modifiedOn ? new Date(item.modifiedOn) : null,
      ]);
      result.rows[0]?.inserted ? created++ : updated++;
    }
  } finally {
    client.release();
  }
  return { created, updated };
}

async function main() {
  console.log('='.repeat(60));
  console.log('FULL PRICEBOOK SYNC (Active + Inactive)');
  console.log('='.repeat(60));

  try {
    // Sync Equipment
    const equipment = await fetchAllItems('equipment');
    console.log('\nUpserting equipment...');
    const eqResult = await upsertEquipment(equipment);
    console.log(`  Equipment: ${eqResult.created} created, ${eqResult.updated} updated`);

    // Sync Materials
    const materials = await fetchAllItems('materials');
    console.log('\nUpserting materials...');
    const matResult = await upsertMaterials(materials);
    console.log(`  Materials: ${matResult.created} created, ${matResult.updated} updated`);

    // Sync Services
    const services = await fetchAllItems('services');
    console.log('\nUpserting services...');
    const svcResult = await upsertServices(services);
    console.log(`  Services: ${svcResult.created} created, ${svcResult.updated} updated`);

    // Verify final counts
    const client = await pool.connect();
    const counts = await client.query(`
      SELECT 'equipment' as type, COUNT(*) as total,
        COUNT(*) FILTER (WHERE active = true) as active,
        COUNT(*) FILTER (WHERE active = false) as inactive
      FROM pricebook.pricebook_equipment
      UNION ALL
      SELECT 'materials', COUNT(*),
        COUNT(*) FILTER (WHERE active = true),
        COUNT(*) FILTER (WHERE active = false)
      FROM pricebook.pricebook_materials
      UNION ALL
      SELECT 'services', COUNT(*),
        COUNT(*) FILTER (WHERE active = true),
        COUNT(*) FILTER (WHERE active = false)
      FROM pricebook.pricebook_services
    `);
    client.release();

    console.log('\n' + '='.repeat(60));
    console.log('FINAL DATABASE COUNTS');
    console.log('='.repeat(60));
    console.log('Type       | Total  | Active | Inactive');
    console.log('-'.repeat(45));
    for (const row of counts.rows) {
      console.log(`${row.type.padEnd(10)} | ${row.total.toString().padStart(6)} | ${row.active.toString().padStart(6)} | ${row.inactive.toString().padStart(8)}`);
    }

  } catch (error) {
    console.error('\nError:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
