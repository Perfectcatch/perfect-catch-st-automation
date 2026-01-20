/**
 * GET /ghl/opportunities/by-customer/:customerId
 * Get all opportunities for a customer
 * Shows the full journey from Sales to Install pipeline
 */

import { asyncHandler } from '../../../middleware/asyncHandler.js';
import { createLogger } from '../../../lib/logger.js';
import { getPool } from '../../../services/sync/sync-base.js';

const logger = createLogger('ghl-routes:opportunities');

const SCHEMA = {
  ghl: 'integrations',
  st: 'servicetitan'
};

export const getOpportunitiesByCustomer = asyncHandler(async (req, res) => {
  const client = await getPool().connect();

  try {
    const { customerId } = req.params;

    const result = await client.query(`
      SELECT
        o.ghl_id,
        o.name,
        o.monetary_value,
        o.status,
        o.pipeline_name,
        o.stage_name,
        o.st_job_id,
        o.ghl_created_at,
        o.local_updated_at,
        c.name as customer_name,
        j.job_number,
        j.job_status,
        bu.name as business_unit
      FROM ${SCHEMA.ghl}.ghl_opportunities o
      LEFT JOIN ${SCHEMA.st}.st_customers c ON o.st_customer_id = c.st_id
      LEFT JOIN ${SCHEMA.st}.st_jobs j ON o.st_job_id = j.st_id
      LEFT JOIN ${SCHEMA.st}.st_business_units bu ON j.business_unit_id = bu.st_id
      WHERE o.st_customer_id = $1
      ORDER BY o.ghl_created_at DESC
    `, [parseInt(customerId)]);

    res.json({
      success: true,
      customerId: parseInt(customerId),
      count: result.rows.length,
      data: result.rows
    });
  } finally {
    client.release();
  }
});

export default (router) => {
  router.get('/by-customer/:customerId', getOpportunitiesByCustomer);
};
