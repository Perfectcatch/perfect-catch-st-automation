/**
 * Customer Merge Worker
 *
 * Combines data from:
 * - raw_st_customers (base customer data)
 * - raw_st_customer_contacts (email, phone contacts)
 * - raw_st_location_contacts (fallback for contacts stored at location level)
 * - raw_st_locations (primary address)
 *
 * Into: st_customers
 */

import { BaseMerger } from './base-merger.js';

export class CustomerMerger extends BaseMerger {
  constructor() {
    super({
      name: 'CustomerMerger',
      targetTable: 'st_customers',
    });
  }

  getMergeQuery() {
    return `
      -- Customer-level contacts (primary source)
      WITH primary_emails AS (
        SELECT DISTINCT ON (customer_id)
          customer_id,
          value as email
        FROM raw_st_customer_contacts
        WHERE type = 'Email' AND value IS NOT NULL AND value != ''
        ORDER BY customer_id, st_modified_on DESC NULLS LAST
      ),
      primary_phones AS (
        SELECT DISTINCT ON (customer_id)
          customer_id,
          value as phone
        FROM raw_st_customer_contacts
        WHERE type IN ('Phone', 'MobilePhone') AND value IS NOT NULL AND value != ''
        ORDER BY customer_id,
          CASE WHEN type = 'MobilePhone' THEN 0 ELSE 1 END,
          st_modified_on DESC NULLS LAST
      ),
      all_phones AS (
        SELECT
          customer_id,
          jsonb_agg(jsonb_build_object(
            'type', type,
            'value', value,
            'doNotText', COALESCE(phone_settings->>'doNotText', 'false')
          )) as phone_numbers
        FROM raw_st_customer_contacts
        WHERE type IN ('Phone', 'MobilePhone') AND value IS NOT NULL AND value != ''
        GROUP BY customer_id
      ),
      all_emails AS (
        SELECT
          customer_id,
          jsonb_agg(value) as email_addresses
        FROM raw_st_customer_contacts
        WHERE type = 'Email' AND value IS NOT NULL AND value != ''
        GROUP BY customer_id
      ),
      -- Location-level contacts (fallback when customer contacts don't exist)
      location_emails AS (
        SELECT DISTINCT ON (l.customer_id)
          l.customer_id,
          lc.value as email
        FROM raw_st_location_contacts lc
        JOIN raw_st_locations l ON l.st_id = lc.location_id
        WHERE lc.type = 'Email' AND lc.value IS NOT NULL AND lc.value != ''
        ORDER BY l.customer_id, lc.st_modified_on DESC NULLS LAST
      ),
      location_phones AS (
        SELECT DISTINCT ON (l.customer_id)
          l.customer_id,
          lc.value as phone
        FROM raw_st_location_contacts lc
        JOIN raw_st_locations l ON l.st_id = lc.location_id
        WHERE lc.type IN ('Phone', 'MobilePhone') AND lc.value IS NOT NULL AND lc.value != ''
        ORDER BY l.customer_id,
          CASE WHEN lc.type = 'MobilePhone' THEN 0 ELSE 1 END,
          lc.st_modified_on DESC NULLS LAST
      ),
      all_location_phones AS (
        SELECT
          l.customer_id,
          jsonb_agg(jsonb_build_object(
            'type', lc.type,
            'value', lc.value,
            'doNotText', COALESCE(lc.phone_settings->>'doNotText', 'false')
          )) as phone_numbers
        FROM raw_st_location_contacts lc
        JOIN raw_st_locations l ON l.st_id = lc.location_id
        WHERE lc.type IN ('Phone', 'MobilePhone') AND lc.value IS NOT NULL AND lc.value != ''
        GROUP BY l.customer_id
      ),
      all_location_emails AS (
        SELECT
          l.customer_id,
          jsonb_agg(lc.value) as email_addresses
        FROM raw_st_location_contacts lc
        JOIN raw_st_locations l ON l.st_id = lc.location_id
        WHERE lc.type = 'Email' AND lc.value IS NOT NULL AND lc.value != ''
        GROUP BY l.customer_id
      ),
      primary_locations AS (
        SELECT DISTINCT ON (customer_id)
          customer_id,
          st_id as location_id,
          address->>'street' as address_line1,
          address->>'unit' as address_line2,
          address->>'city' as city,
          address->>'state' as state,
          address->>'zip' as zip,
          address->>'country' as country
        FROM raw_st_locations
        WHERE active = true
        ORDER BY customer_id, st_modified_on DESC NULLS LAST
      ),
      all_addresses AS (
        SELECT
          customer_id,
          jsonb_agg(jsonb_build_object(
            'location_id', st_id,
            'name', name,
            'street', address->>'street',
            'unit', address->>'unit',
            'city', address->>'city',
            'state', address->>'state',
            'zip', address->>'zip',
            'country', address->>'country',
            'active', active
          )) as addresses
        FROM raw_st_locations
        GROUP BY customer_id
      )
      SELECT
        c.st_id,
        c.tenant_id,
        c.name,
        c.type,
        COALESCE(pe.email, le.email) as email,
        COALESCE(pp.phone, lp.phone) as phone,
        COALESCE(ap.phone_numbers, alp.phone_numbers, '[]'::jsonb) as phone_numbers,
        COALESCE(ae.email_addresses, ale.email_addresses, '[]'::jsonb) as email_addresses,
        pl.address_line1,
        pl.address_line2,
        pl.city,
        pl.state,
        pl.zip,
        pl.country,
        COALESCE(aa.addresses, '[]'::jsonb) as addresses,
        COALESCE(c.balance, 0) as balance,
        COALESCE(c.active, true) as active,
        COALESCE(c.do_not_service, false) as do_not_service,
        COALESCE(c.do_not_mail, false) as do_not_mail,
        c.tag_type_ids,
        c.custom_fields,
        c.st_created_on,
        c.st_modified_on,
        c.full_data
      FROM raw_st_customers c
      -- Customer-level contacts
      LEFT JOIN primary_emails pe ON pe.customer_id = c.st_id
      LEFT JOIN primary_phones pp ON pp.customer_id = c.st_id
      LEFT JOIN all_phones ap ON ap.customer_id = c.st_id
      LEFT JOIN all_emails ae ON ae.customer_id = c.st_id
      -- Location-level contacts (fallback)
      LEFT JOIN location_emails le ON le.customer_id = c.st_id
      LEFT JOIN location_phones lp ON lp.customer_id = c.st_id
      LEFT JOIN all_location_phones alp ON alp.customer_id = c.st_id
      LEFT JOIN all_location_emails ale ON ale.customer_id = c.st_id
      -- Addresses
      LEFT JOIN primary_locations pl ON pl.customer_id = c.st_id
      LEFT JOIN all_addresses aa ON aa.customer_id = c.st_id
    `;
  }

  getTargetColumns() {
    return [
      'st_id',
      'tenant_id',
      'name',
      'type',
      'email',
      'phone',
      'phone_numbers',
      'email_addresses',
      'address_line1',
      'address_line2',
      'city',
      'state',
      'zip',
      'country',
      'addresses',
      'balance',
      'active',
      'do_not_service',
      'do_not_mail',
      'tag_type_ids',
      'custom_fields',
      'st_created_on',
      'st_modified_on',
      'full_data',
      'local_synced_at',
    ];
  }

  getJsonbColumns() {
    return [
      'phone_numbers',
      'email_addresses',
      'addresses',
      'custom_fields',
      'full_data',
    ];
  }

  transformRow(row) {
    // custom_fields from API is an array, but target table expects object
    // Convert array to object with field name as key
    let customFields = {};
    if (Array.isArray(row.custom_fields)) {
      for (const field of row.custom_fields) {
        if (field && field.name) {
          customFields[field.name] = field.value;
        }
      }
    } else if (row.custom_fields && typeof row.custom_fields === 'object') {
      customFields = row.custom_fields;
    }

    return {
      ...row,
      tag_type_ids: row.tag_type_ids || [],
      custom_fields: customFields,
      phone_numbers: row.phone_numbers || [],
      email_addresses: row.email_addresses || [],
      addresses: row.addresses || [],
      local_synced_at: new Date(),
    };
  }
}

/**
 * Convenience function to run customer merge
 */
export async function runCustomerMerge(options = {}) {
  const merger = new CustomerMerger();
  try {
    if (options.incremental) {
      return await merger.incrementalMerge(options.since);
    }
    return await merger.fullMerge();
  } finally {
    await merger.close();
  }
}

export default CustomerMerger;
