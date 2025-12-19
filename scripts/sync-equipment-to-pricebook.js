#!/usr/bin/env node
/**
 * Sync Equipment to Pricebook Schema
 * Fetches equipment from ServiceTitan and upserts to pricebook.pricebook_equipment
 */

import { stRequest } from '../src/services/stClient.js';
import config from '../src/config/index.js';
import pkg from 'pg';
const { Pool } = pkg;

const tenantId = config.serviceTitan.tenantId;

// Direct connection to pricebook schema
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Catchadmin@2025@localhost:6432/perfectcatch_automation',
});

async function fetchAllEquipment() {
  const allEquipment = [];
  let page = 1;
  let hasMore = true;

  console.log('Fetching equipment from ServiceTitan...');

  while (hasMore) {
    const url = `https://api.servicetitan.io/pricebook/v2/tenant/${tenantId}/equipment`;
    const response = await stRequest(url, {
      method: 'GET',
      query: { page, pageSize: 1000 }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const data = response.data;
    const equipment = data.data || [];
    allEquipment.push(...equipment);

    console.log(`Page ${page}: ${equipment.length} items (total: ${allEquipment.length})`);

    hasMore = data.hasMore || false;
    page++;

    if (hasMore) await new Promise(r => setTimeout(r, 100));
  }

  return allEquipment;
}

async function upsertEquipment(equipment) {
  const client = await pool.connect();

  try {
    let created = 0;
    let updated = 0;

    for (const item of equipment) {
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
          category_id = EXCLUDED.category_id,
          code = EXCLUDED.code,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          display_name = EXCLUDED.display_name,
          manufacturer = EXCLUDED.manufacturer,
          model_number = EXCLUDED.model_number,
          cost = EXCLUDED.cost,
          price = EXCLUDED.price,
          member_price = EXCLUDED.member_price,
          add_on_price = EXCLUDED.add_on_price,
          recommended_hours = EXCLUDED.recommended_hours,
          warranty_years = EXCLUDED.warranty_years,
          warranty_months = EXCLUDED.warranty_months,
          commission_bonus = EXCLUDED.commission_bonus,
          pay_type = EXCLUDED.pay_type,
          active = EXCLUDED.active,
          taxable = EXCLUDED.taxable,
          account = EXCLUDED.account,
          primary_vendor_id = EXCLUDED.primary_vendor_id,
          images = EXCLUDED.images,
          assets = EXCLUDED.assets,
          custom_fields = EXCLUDED.custom_fields,
          tags = EXCLUDED.tags,
          external_data = EXCLUDED.external_data,
          st_modified_on = EXCLUDED.st_modified_on,
          last_synced_at = NOW(),
          sync_status = 'synced',
          local_modified_at = NOW()
        RETURNING (xmax = 0) AS inserted
      `, [
        item.id,
        tenantId,
        item.categoryId || null,
        item.code || '',
        item.name || item.displayName || '',
        item.description || null,
        item.displayName || null,
        item.manufacturer || null,
        item.modelNumber || null,
        item.cost || null,
        item.price || null,
        item.memberPrice || null,
        item.addOnPrice || null,
        item.recommendedHours || null,
        item.warrantyYears || null,
        item.warrantyMonths || null,
        item.commissionBonus || null,
        item.payType || null,
        item.active !== false,
        item.taxable !== false,
        item.account || null,
        item.primaryVendorId || null,
        JSON.stringify(item.images || []),
        JSON.stringify(item.assets || []),
        JSON.stringify(item.customFields || {}),
        JSON.stringify(item.tags || []),
        JSON.stringify(item.externalData || {}),
        item.createdOn ? new Date(item.createdOn) : null,
        item.modifiedOn ? new Date(item.modifiedOn) : null,
      ]);

      if (result.rows[0]?.inserted) {
        created++;
      } else {
        updated++;
      }
    }

    return { created, updated };
  } finally {
    client.release();
  }
}

async function main() {
  try {
    // Fetch from ServiceTitan
    const equipment = await fetchAllEquipment();
    console.log(`\nFetched ${equipment.length} equipment items from ServiceTitan`);

    // Show active/inactive breakdown
    const active = equipment.filter(e => e.active !== false).length;
    const inactive = equipment.filter(e => e.active === false).length;
    console.log(`Active: ${active}, Inactive: ${inactive}`);

    // Upsert to database
    console.log('\nUpserting to pricebook.pricebook_equipment...');
    const result = await upsertEquipment(equipment);

    console.log(`\nSync complete!`);
    console.log(`Created: ${result.created}`);
    console.log(`Updated: ${result.updated}`);

    // Verify counts
    const client = await pool.connect();
    const countResult = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE active = true) as active,
        COUNT(*) FILTER (WHERE active = false) as inactive
      FROM pricebook.pricebook_equipment
    `);
    client.release();

    console.log(`\nDatabase counts:`);
    console.log(`Total: ${countResult.rows[0].total}`);
    console.log(`Active: ${countResult.rows[0].active}`);
    console.log(`Inactive: ${countResult.rows[0].inactive}`);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
