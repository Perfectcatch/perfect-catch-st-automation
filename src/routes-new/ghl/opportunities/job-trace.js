/**
 * GET /ghl/job-to-estimate/:installJobId
 * Trace install job back to original estimate
 * Shows the relationship: Install Job -> Customer -> Sold Estimate -> Original Sales Job
 */

import { asyncHandler } from '../../../middleware/asyncHandler.js';
import { createLogger } from '../../../lib/logger.js';
import { getPool } from '../../../services/sync/sync-base.js';

const logger = createLogger('ghl-routes:job-trace');

const SCHEMA = {
  ghl: 'integrations',
  st: 'servicetitan'
};

export const traceJobToEstimate = asyncHandler(async (req, res) => {
  const client = await getPool().connect();

  try {
    const { installJobId } = req.params;

    // Get the install job and its customer
    const installJobResult = await client.query(`
      SELECT
        j.st_id as install_job_id,
        j.job_number as install_job_number,
        j.summary as install_summary,
        j.job_status as install_status,
        j.st_created_on as install_created,
        j.customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email,
        bu.name as business_unit
      FROM ${SCHEMA.st}.st_jobs j
      JOIN ${SCHEMA.st}.st_customers c ON j.customer_id = c.st_id
      JOIN ${SCHEMA.st}.st_business_units bu ON j.business_unit_id = bu.st_id
      WHERE j.st_id = $1
    `, [parseInt(installJobId)]);

    if (installJobResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Install job not found'
      });
    }

    const installJob = installJobResult.rows[0];

    // Find sold estimates for this customer (the source of the install job)
    const estimatesResult = await client.query(`
      SELECT
        e.st_id as estimate_id,
        e.estimate_number,
        e.name as estimate_name,
        e.total as estimate_total,
        e.status as estimate_status,
        e.sold_on,
        e.st_created_on as estimate_created,
        sj.st_id as sales_job_id,
        sj.job_number as sales_job_number,
        sj.summary as sales_summary,
        sbu.name as sales_business_unit
      FROM ${SCHEMA.st}.st_estimates e
      JOIN ${SCHEMA.st}.st_jobs sj ON e.job_id = sj.st_id
      JOIN ${SCHEMA.st}.st_business_units sbu ON sj.business_unit_id = sbu.st_id
      WHERE e.customer_id = $1
        AND e.status = 'Sold'
      ORDER BY e.sold_on DESC
    `, [installJob.customer_id]);

    // Find GHL opportunities for this customer
    const opportunitiesResult = await client.query(`
      SELECT
        o.ghl_id,
        o.name as opportunity_name,
        o.monetary_value,
        o.status,
        o.pipeline_name,
        o.stage_name,
        o.st_job_id,
        o.ghl_created_at
      FROM ${SCHEMA.ghl}.ghl_opportunities o
      WHERE o.st_customer_id = $1
      ORDER BY o.ghl_created_at DESC
    `, [installJob.customer_id]);

    res.json({
      success: true,
      installJob: {
        id: installJob.install_job_id,
        jobNumber: installJob.install_job_number,
        summary: installJob.install_summary,
        status: installJob.install_status,
        businessUnit: installJob.business_unit,
        createdOn: installJob.install_created
      },
      customer: {
        id: installJob.customer_id,
        name: installJob.customer_name,
        phone: installJob.customer_phone,
        email: installJob.customer_email
      },
      soldEstimates: estimatesResult.rows.map(e => ({
        id: e.estimate_id,
        number: e.estimate_number,
        name: e.estimate_name,
        total: e.estimate_total,
        status: e.estimate_status,
        soldOn: e.sold_on,
        createdOn: e.estimate_created,
        salesJob: {
          id: e.sales_job_id,
          number: e.sales_job_number,
          summary: e.sales_summary,
          businessUnit: e.sales_business_unit
        }
      })),
      ghlOpportunities: opportunitiesResult.rows,
      relationship: {
        description: 'Install job traced back to sold estimate via customer',
        flow: 'Sales Job -> Estimate Sold -> Install Job Created -> Install Pipeline'
      }
    });
  } finally {
    client.release();
  }
});

export default (router) => {
  router.get('/job-to-estimate/:installJobId', traceJobToEstimate);
};
