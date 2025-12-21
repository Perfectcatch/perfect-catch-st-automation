import { stRequest } from '../src/services/stClient.js';
import config from '../src/config/index.js';
import pg from 'pg';

const tenantId = config.serviceTitan.tenantId;
const baseUrl = config.serviceTitan.apiBaseUrl;
const pool = new pg.Pool({ connectionString: config.database.url, max: 5 });

const client = await pool.connect();
try {
  console.log('Finding all locations without contacts...');
  const result = await client.query(`
    SELECT l.st_id, l.customer_id
    FROM raw_st_locations l
    LEFT JOIN raw_st_location_contacts lc ON lc.location_id = l.st_id
    WHERE lc.location_id IS NULL
  `);

  console.log('Locations missing contacts:', result.rows.length);
  console.log('Fetching contacts per-location...');

  let totalContacts = 0;
  let locationsWithContacts = 0;
  let processed = 0;

  for (const loc of result.rows) {
    processed++;
    if (processed % 100 === 0) {
      console.log('Processed', processed, '/', result.rows.length, '- found', totalContacts, 'contacts');
    }

    try {
      const url = `${baseUrl}/crm/v2/tenant/${tenantId}/locations/${loc.st_id}/contacts`;
      const resp = await stRequest(url);
      const contacts = resp.data?.data || [];

      if (contacts.length > 0) {
        locationsWithContacts++;
        totalContacts += contacts.length;

        for (const c of contacts) {
          const createdOn = (c.createdOn && c.createdOn !== '0001-01-01T00:00:00Z') ? c.createdOn : null;
          await client.query(`
            INSERT INTO raw_st_location_contacts (st_id, tenant_id, location_id, type, value, memo, phone_settings, preferences, st_created_on, st_modified_on, fetched_at, full_data)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)
            ON CONFLICT (st_id, location_id) DO UPDATE SET
              type = EXCLUDED.type,
              value = EXCLUDED.value,
              memo = EXCLUDED.memo,
              phone_settings = EXCLUDED.phone_settings,
              preferences = EXCLUDED.preferences,
              st_modified_on = EXCLUDED.st_modified_on,
              fetched_at = NOW(),
              full_data = EXCLUDED.full_data
          `, [c.id, tenantId, loc.st_id, c.type, c.value, c.memo, c.phoneSettings, c.preferences, createdOn, c.modifiedOn, c]);
        }
      }
    } catch (err) {
      if (!err.message.includes('404')) {
        console.error('Error for location', loc.st_id, ':', err.message);
      }
    }

    // Small delay every 10 to avoid rate limiting
    if (processed % 10 === 0) {
      await new Promise(r => setTimeout(r, 50));
    }
  }

  console.log('\n=== Complete ===');
  console.log('Locations processed:', processed);
  console.log('Locations with contacts:', locationsWithContacts);
  console.log('Total contacts added:', totalContacts);

} finally {
  client.release();
  await pool.end();
}
