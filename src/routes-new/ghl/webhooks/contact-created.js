/**
 * POST /ghl/webhooks/contact-created
 * Handle GHL contact creation webhook
 * Creates or updates customer in ServiceTitan
 */

import { asyncHandler } from '../../../middleware/asyncHandler.js';
import { createLogger } from '../../../lib/logger.js';
import { getPool } from '../../../services/sync/sync-base.js';

const logger = createLogger('ghl-webhooks:contact-created');

const SCHEMA = {
  ghl: 'integrations',
  st: 'servicetitan'
};

export const handleContactCreated = asyncHandler(async (req, res) => {
  const client = await getPool().connect();

  try {
    const { contact, locationId } = req.body;

    if (!contact?.id) {
      return res.status(400).json({
        success: false,
        error: 'Missing contact data'
      });
    }

    logger.info('Received contact created webhook', {
      contactId: contact.id,
      name: contact.name,
      email: contact.email
    });

    // Log webhook event
    await client.query(`
      INSERT INTO ${SCHEMA.ghl}.ghl_webhook_log (
        event_type, ghl_id, payload, received_at
      ) VALUES ($1, $2, $3, NOW())
    `, ['contact.created', contact.id, JSON.stringify(req.body)]);

    // Check if we already have this contact
    const existingContact = await client.query(`
      SELECT id, st_customer_id FROM ${SCHEMA.ghl}.ghl_contacts
      WHERE ghl_id = $1
    `, [contact.id]);

    if (existingContact.rows.length > 0) {
      logger.info('Contact already exists, updating', { contactId: contact.id });

      await client.query(`
        UPDATE ${SCHEMA.ghl}.ghl_contacts
        SET
          first_name = $1,
          last_name = $2,
          name = $3,
          email = $4,
          phone = $5,
          address_line1 = $6,
          city = $7,
          state = $8,
          postal_code = $9,
          raw_data = $10,
          local_updated_at = NOW()
        WHERE ghl_id = $11
      `, [
        contact.firstName,
        contact.lastName,
        contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        contact.email,
        contact.phone,
        contact.address1,
        contact.city,
        contact.state,
        contact.postalCode,
        JSON.stringify(contact),
        contact.id
      ]);

      return res.json({
        success: true,
        action: 'updated',
        contactId: contact.id
      });
    }

    // Insert new contact
    await client.query(`
      INSERT INTO ${SCHEMA.ghl}.ghl_contacts (
        ghl_id,
        ghl_location_id,
        first_name,
        last_name,
        name,
        email,
        phone,
        address_line1,
        city,
        state,
        postal_code,
        source,
        raw_data,
        ghl_created_at,
        local_created_at,
        local_updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
    `, [
      contact.id,
      locationId || contact.locationId,
      contact.firstName,
      contact.lastName,
      contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
      contact.email,
      contact.phone,
      contact.address1,
      contact.city,
      contact.state,
      contact.postalCode,
      contact.source || 'GHL Webhook',
      JSON.stringify(contact),
      contact.dateAdded || new Date().toISOString()
    ]);

    logger.info('Contact created successfully', { contactId: contact.id });

    res.json({
      success: true,
      action: 'created',
      contactId: contact.id
    });
  } finally {
    client.release();
  }
});

export default (router) => {
  router.post('/contact-created', handleContactCreated);
};
