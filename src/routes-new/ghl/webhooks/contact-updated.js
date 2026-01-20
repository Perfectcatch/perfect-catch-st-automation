/**
 * POST /ghl/webhooks/contact-updated
 * Handle GHL contact update webhook
 */

import { asyncHandler } from '../../../middleware/asyncHandler.js';
import { createLogger } from '../../../lib/logger.js';
import { getPool } from '../../../services/sync/sync-base.js';

const logger = createLogger('ghl-webhooks:contact-updated');

const SCHEMA = {
  ghl: 'integrations',
  st: 'servicetitan'
};

export const handleContactUpdated = asyncHandler(async (req, res) => {
  const client = await getPool().connect();

  try {
    const { contact, locationId } = req.body;

    if (!contact?.id) {
      return res.status(400).json({
        success: false,
        error: 'Missing contact data'
      });
    }

    logger.info('Received contact updated webhook', {
      contactId: contact.id,
      name: contact.name
    });

    // Log webhook event
    await client.query(`
      INSERT INTO ${SCHEMA.ghl}.ghl_webhook_log (
        event_type, ghl_id, payload, received_at
      ) VALUES ($1, $2, $3, NOW())
    `, ['contact.updated', contact.id, JSON.stringify(req.body)]);

    // Update contact
    const result = await client.query(`
      UPDATE ${SCHEMA.ghl}.ghl_contacts
      SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        name = COALESCE($3, name),
        email = COALESCE($4, email),
        phone = COALESCE($5, phone),
        address_line1 = COALESCE($6, address_line1),
        city = COALESCE($7, city),
        state = COALESCE($8, state),
        postal_code = COALESCE($9, postal_code),
        raw_data = $10,
        local_updated_at = NOW()
      WHERE ghl_id = $11
      RETURNING id, st_customer_id
    `, [
      contact.firstName,
      contact.lastName,
      contact.name,
      contact.email,
      contact.phone,
      contact.address1,
      contact.city,
      contact.state,
      contact.postalCode,
      JSON.stringify(contact),
      contact.id
    ]);

    if (result.rows.length === 0) {
      logger.warn('Contact not found for update, creating', { contactId: contact.id });

      // Contact doesn't exist, create it
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
        contact.name,
        contact.email,
        contact.phone,
        contact.address1,
        contact.city,
        contact.state,
        contact.postalCode,
        'GHL Webhook',
        JSON.stringify(contact),
        contact.dateAdded || new Date().toISOString()
      ]);

      return res.json({
        success: true,
        action: 'created',
        contactId: contact.id
      });
    }

    logger.info('Contact updated successfully', {
      contactId: contact.id,
      stCustomerId: result.rows[0].st_customer_id
    });

    res.json({
      success: true,
      action: 'updated',
      contactId: contact.id,
      stCustomerId: result.rows[0].st_customer_id
    });
  } finally {
    client.release();
  }
});

export default (router) => {
  router.post('/contact-updated', handleContactUpdated);
};
