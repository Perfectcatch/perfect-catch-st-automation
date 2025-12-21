/**
 * Location Merge Worker
 *
 * Combines data from:
 * - raw_st_locations (base location data)
 * - raw_st_location_contacts (email, phone contacts)
 *
 * Into: st_locations
 */

import { BaseMerger } from './base-merger.js';

export class LocationMerger extends BaseMerger {
  constructor() {
    super({
      name: 'LocationMerger',
      targetTable: 'st_locations',
    });
  }

  getMergeQuery() {
    return `
      WITH primary_emails AS (
        SELECT DISTINCT ON (location_id)
          location_id,
          value as email
        FROM raw_st_location_contacts
        WHERE type = 'Email' AND value IS NOT NULL AND value != ''
        ORDER BY location_id, st_modified_on DESC NULLS LAST
      ),
      primary_phones AS (
        SELECT DISTINCT ON (location_id)
          location_id,
          value as phone
        FROM raw_st_location_contacts
        WHERE type IN ('Phone', 'MobilePhone') AND value IS NOT NULL AND value != ''
        ORDER BY location_id,
          CASE WHEN type = 'MobilePhone' THEN 0 ELSE 1 END,
          st_modified_on DESC NULLS LAST
      )
      SELECT
        l.st_id,
        l.tenant_id,
        l.customer_id,
        l.name,
        l.address->>'street' as street,
        l.address->>'unit' as unit,
        l.address->>'city' as city,
        l.address->>'state' as state,
        l.address->>'zip' as zip,
        l.address->>'country' as country,
        (l.address->>'latitude')::decimal as latitude,
        (l.address->>'longitude')::decimal as longitude,
        pe.email,
        pp.phone,
        l.tax_zone_id,
        l.tag_type_ids,
        l.custom_fields,
        l.st_created_on,
        l.st_modified_on,
        l.full_data
      FROM raw_st_locations l
      LEFT JOIN primary_emails pe ON pe.location_id = l.st_id
      LEFT JOIN primary_phones pp ON pp.location_id = l.st_id
    `;
  }

  getTargetColumns() {
    return [
      'st_id',
      'tenant_id',
      'customer_id',
      'name',
      'street',
      'unit',
      'city',
      'state',
      'zip',
      'country',
      'latitude',
      'longitude',
      'email',
      'phone',
      'tax_zone_id',
      'tag_type_ids',
      'custom_fields',
      'st_created_on',
      'st_modified_on',
      'full_data',
      'local_synced_at',
    ];
  }

  getJsonbColumns() {
    return ['custom_fields', 'full_data'];
  }

  transformRow(row) {
    // custom_fields from API is an array, but target table expects object
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
      local_synced_at: new Date(),
    };
  }
}

/**
 * Convenience function to run location merge
 */
export async function runLocationMerge(options = {}) {
  const merger = new LocationMerger();
  try {
    if (options.incremental) {
      return await merger.incrementalMerge(options.since);
    }
    return await merger.fullMerge();
  } finally {
    await merger.close();
  }
}

export default LocationMerger;
