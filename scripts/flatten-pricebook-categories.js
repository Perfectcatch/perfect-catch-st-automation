/**
 * Flatten Pricebook Categories
 *
 * The ServiceTitan API returns categories with nested subcategories as JSONB.
 * This script flattens that hierarchy into individual rows with proper parent_id
 * relationships so we can query the category tree easily.
 */

import pg from 'pg';
import config from '../src/config/index.js';

const pool = new pg.Pool({ connectionString: config.database.url, max: 5 });

/**
 * Recursively extract all categories from a nested structure
 */
function extractCategories(category, tenantId, depth = 0) {
  const results = [];

  // Add the current category
  results.push({
    st_id: category.id,
    tenant_id: tenantId,
    name: category.name,
    active: category.active ?? true,
    description: category.description,
    image: category.image,
    parent_id: category.parentId,
    position: category.position,
    category_type: category.categoryType,
    business_unit_ids: category.businessUnitIds || [],
    depth: depth,
    full_data: category,
  });

  // Recursively process subcategories
  if (category.subcategories && Array.isArray(category.subcategories)) {
    for (const sub of category.subcategories) {
      results.push(...extractCategories(sub, tenantId, depth + 1));
    }
  }

  return results;
}

async function flattenCategories() {
  const client = await pool.connect();

  try {
    console.log('Reading existing categories with nested subcategories...');

    // Get all top-level categories with their full_data (which contains nested subcategories)
    const result = await client.query(`
      SELECT st_id, tenant_id, full_data
      FROM raw_st_pricebook_categories
      WHERE parent_id IS NULL
    `);

    console.log(`Found ${result.rows.length} top-level categories`);

    // Extract all categories (flattened)
    const allCategories = [];
    for (const row of result.rows) {
      const extracted = extractCategories(row.full_data, row.tenant_id, 0);
      allCategories.push(...extracted);
    }

    console.log(`Extracted ${allCategories.length} total categories (including all subcategory levels)`);

    // Show breakdown by depth
    const depthCounts = {};
    for (const cat of allCategories) {
      depthCounts[cat.depth] = (depthCounts[cat.depth] || 0) + 1;
    }
    console.log('Categories by depth level:', depthCounts);

    // Insert all categories with upsert
    await client.query('BEGIN');

    let inserted = 0;
    let updated = 0;

    for (const cat of allCategories) {
      const result = await client.query(`
        INSERT INTO raw_st_pricebook_categories
          (st_id, tenant_id, name, active, description, image, parent_id, position,
           category_type, business_unit_ids, fetched_at, full_data, subcategories)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $12)
        ON CONFLICT (st_id) DO UPDATE SET
          name = EXCLUDED.name,
          active = EXCLUDED.active,
          description = EXCLUDED.description,
          image = EXCLUDED.image,
          parent_id = EXCLUDED.parent_id,
          position = EXCLUDED.position,
          category_type = EXCLUDED.category_type,
          business_unit_ids = EXCLUDED.business_unit_ids,
          fetched_at = NOW(),
          full_data = EXCLUDED.full_data
        RETURNING (xmax = 0) AS is_insert
      `, [
        cat.st_id,
        cat.tenant_id,
        cat.name,
        cat.active,
        cat.description,
        cat.image,
        cat.parent_id,
        cat.position,
        cat.category_type,
        cat.business_unit_ids,
        cat.full_data,
        JSON.stringify(cat.full_data.subcategories || []),
      ]);

      if (result.rows[0]?.is_insert) {
        inserted++;
      } else {
        updated++;
      }
    }

    await client.query('COMMIT');

    console.log('\n=== Flatten Complete ===');
    console.log(`Inserted: ${inserted}`);
    console.log(`Updated: ${updated}`);
    console.log(`Total: ${allCategories.length}`);

    // Verify the hierarchy
    console.log('\n=== Verifying Hierarchy ===');
    const verification = await client.query(`
      WITH RECURSIVE category_tree AS (
        -- Base: top-level categories
        SELECT st_id, name, parent_id, 0 as level
        FROM raw_st_pricebook_categories
        WHERE parent_id IS NULL

        UNION ALL

        -- Recursive: children
        SELECT c.st_id, c.name, c.parent_id, ct.level + 1
        FROM raw_st_pricebook_categories c
        JOIN category_tree ct ON c.parent_id = ct.st_id
      )
      SELECT level, COUNT(*) as count
      FROM category_tree
      GROUP BY level
      ORDER BY level
    `);

    console.log('Categories by level (verified via parent_id):');
    console.table(verification.rows);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

flattenCategories();
