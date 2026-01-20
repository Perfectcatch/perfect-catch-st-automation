/**
 * Move Opportunity to In Progress / On Site
 *
 * When an install job's first appointment is dispatched or working (on-site),
 * move the opportunity from earlier Install Pipeline stages to "In Progress / On Site"
 */

import axios from 'axios';
import { createLogger } from '../../lib/logger.js';
import { getPool } from '../../services/sync/sync-base.js';
import { stRequest } from '../../services/stClient.js';
import { stEndpoints } from '../../lib/stEndpoints.js';
import { GHL_PIPELINES, buildOpportunityCustomFields } from '../../config/ghl-pipelines.js';

const logger = createLogger('ghl-in-progress-mover');

// GHL API client
const ghlClient = axios.create({
  baseURL: 'https://services.leadconnectorhq.com',
  headers: {
    'Content-Type': 'application/json',
    'Version': '2021-07-28'
  }
});

ghlClient.interceptors.request.use((cfg) => {
  cfg.headers['Authorization'] = `Bearer ${process.env.GHL_API_KEY}`;
  return cfg;
});

// Stages that should trigger move to In Progress when appointment is dispatched/working
const ELIGIBLE_STAGES = [
  GHL_PIPELINES.INSTALL_PIPELINE.stages.ESTIMATE_APPROVED_JOB_CREATED,
  GHL_PIPELINES.INSTALL_PIPELINE.stages.PRE_INSTALL_PLANNING_PERMITTING,
  GHL_PIPELINES.INSTALL_PIPELINE.stages.SCHEDULED_READY_FOR_INSTALL
];

// Appointment statuses that indicate technician is dispatched or on-site
const ACTIVE_APPOINTMENT_STATUSES = ['Dispatched', 'Working'];

/**
 * Fetch appointments for a job from ServiceTitan API
 */
async function fetchJobAppointments(jobId) {
  try {
    // Fetch appointments filtered by job ID
    const result = await stRequest(stEndpoints.appointments.list(), {
      query: { jobId }
    });

    if (!result.ok) {
      logger.warn({ jobId, status: result.status }, 'Failed to fetch appointments');
      return [];
    }

    return result.data?.data || [];
  } catch (error) {
    logger.warn({ jobId, error: error.message }, 'Failed to fetch job appointments');
    return [];
  }
}

/**
 * Check if a job has any dispatched or working appointments
 */
async function hasActiveAppointment(jobId) {
  const appointments = await fetchJobAppointments(jobId);

  const activeAppointment = appointments.find(apt =>
    ACTIVE_APPOINTMENT_STATUSES.includes(apt.status)
  );

  if (activeAppointment) {
    logger.debug({
      jobId,
      appointmentId: activeAppointment.id,
      status: activeAppointment.status
    }, 'Found active appointment');
  }

  return activeAppointment;
}

/**
 * Move opportunity to In Progress / On Site stage
 */
export async function moveOpportunityToInProgress(opportunityGhlId, jobId, options = {}) {
  const client = await getPool().connect();

  try {
    logger.info({ opportunityGhlId, jobId }, 'Moving opportunity to In Progress / On Site');

    // Get job details for custom fields update
    const jobResult = await stRequest(stEndpoints.jobs.get(jobId));
    const job = jobResult.ok ? jobResult.data : null;

    // Build custom fields
    const customFields = buildOpportunityCustomFields({
      stCustomerId: job?.customerId,
      stJobId: jobId
    });

    // If we have technician info from the active appointment, add it
    if (options.technicianName) {
      customFields.push({
        id: process.env.GHL_CF_TECHNICIAN || 'UtUjwSDe758kTey8ABqk',
        value: options.technicianName
      });
    }

    // Update opportunity in GHL
    const updateData = {
      pipelineStageId: GHL_PIPELINES.INSTALL_PIPELINE.stages.IN_PROGRESS_ON_SITE,
      customFields: customFields
    };

    await ghlClient.put(`/opportunities/${opportunityGhlId}`, updateData);

    // Update local database
    await client.query(`
      UPDATE public.ghl_opportunities
      SET pipeline_stage_id = $2,
          updated_at = NOW()
      WHERE ghl_id = $1
    `, [
      opportunityGhlId,
      GHL_PIPELINES.INSTALL_PIPELINE.stages.IN_PROGRESS_ON_SITE
    ]);

    logger.info({
      opportunityGhlId,
      jobId,
      newStage: 'IN_PROGRESS_ON_SITE'
    }, 'Moved opportunity to In Progress / On Site');

    return { success: true, opportunityGhlId };

  } catch (error) {
    logger.error({
      opportunityGhlId,
      jobId,
      error: error.message,
      response: error.response?.data
    }, 'Failed to move opportunity to In Progress');

    return { success: false, error: error.message };
  } finally {
    client.release();
  }
}

/**
 * Detect opportunities that need to be moved to In Progress
 * Looks for Install Pipeline opportunities in eligible stages
 * where the linked job has a dispatched or working appointment
 */
export async function detectOpportunitiesNeedingInProgressMove() {
  const client = await getPool().connect();

  try {
    // Find opportunities in Install Pipeline that are in eligible stages
    const result = await client.query(`
      SELECT
        o.ghl_id,
        o.name,
        o.st_job_id,
        o.pipeline_stage_id
      FROM public.ghl_opportunities o
      WHERE o.pipeline_id = $1
        AND o.pipeline_stage_id = ANY($2::text[])
        AND o.st_job_id IS NOT NULL
      ORDER BY o.updated_at ASC
    `, [
      GHL_PIPELINES.INSTALL_PIPELINE.id,
      ELIGIBLE_STAGES
    ]);

    logger.info({ count: result.rows.length }, 'Found opportunities in eligible stages');

    const opportunitiesToMove = [];

    for (const opp of result.rows) {
      // Check if job has active appointment
      const activeAppointment = await hasActiveAppointment(opp.st_job_id);

      if (activeAppointment) {
        opportunitiesToMove.push({
          ghlId: opp.ghl_id,
          name: opp.name,
          jobId: opp.st_job_id,
          currentStage: opp.pipeline_stage_id,
          appointmentStatus: activeAppointment.status,
          appointmentId: activeAppointment.id
        });
      }

      // Rate limiting - small delay between API calls
      await new Promise(r => setTimeout(r, 200));
    }

    logger.info({
      checked: result.rows.length,
      needsMove: opportunitiesToMove.length
    }, 'Finished checking appointments');

    return opportunitiesToMove;

  } finally {
    client.release();
  }
}

/**
 * Process all opportunities that need to move to In Progress
 */
export async function processInProgressMoves() {
  const opportunitiesToMove = await detectOpportunitiesNeedingInProgressMove();

  let moved = 0;
  let failed = 0;

  for (const opp of opportunitiesToMove) {
    try {
      const result = await moveOpportunityToInProgress(opp.ghlId, opp.jobId);

      if (result.success) {
        moved++;
        logger.info({
          ghlId: opp.ghlId,
          jobId: opp.jobId,
          appointmentStatus: opp.appointmentStatus
        }, 'Moved opportunity to In Progress');
      } else {
        failed++;
      }
    } catch (error) {
      logger.error({
        ghlId: opp.ghlId,
        jobId: opp.jobId,
        error: error.message
      }, 'Failed to move opportunity');
      failed++;
    }
  }

  return {
    checked: opportunitiesToMove.length,
    moved,
    failed,
    total: opportunitiesToMove.length
  };
}

export default {
  moveOpportunityToInProgress,
  detectOpportunitiesNeedingInProgressMove,
  processInProgressMoves
};
