/**
 * GHL Pipeline API Utilities
 * Fetch pipelines and stages from GoHighLevel API
 */

import axios from 'axios';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('ghl-pipelines');

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

// GHL API client
const ghlClient = axios.create({
  baseURL: GHL_API_BASE,
  headers: {
    'Content-Type': 'application/json',
    'Version': '2021-07-28'
  }
});

ghlClient.interceptors.request.use((cfg) => {
  cfg.headers['Authorization'] = `Bearer ${process.env.GHL_API_KEY}`;
  return cfg;
});

/**
 * Get all pipelines for a location
 * @param {string} locationId - GHL Location ID
 * @returns {Promise<Array>} - Array of pipeline objects
 */
export async function getPipelines(locationId) {
  try {
    const response = await ghlClient.get('/opportunities/pipelines', {
      params: { locationId }
    });
    return response.data.pipelines || [];
  } catch (error) {
    logger.error('Failed to fetch pipelines', {
      error: error.message,
      response: error.response?.data
    });
    throw error;
  }
}

/**
 * Get stages for a specific pipeline
 * @param {string} pipelineId - Pipeline ID
 * @param {string} locationId - GHL Location ID
 * @returns {Promise<Array>} - Array of stage objects
 */
export async function getPipelineStages(pipelineId, locationId) {
  const pipelines = await getPipelines(locationId);
  const pipeline = pipelines.find(p => p.id === pipelineId);
  return pipeline?.stages || [];
}

/**
 * Update opportunity stage
 * @param {string} opportunityId - GHL Opportunity ID
 * @param {string} stageId - New stage ID
 * @param {object} additionalData - Optional additional update data
 */
export async function updateOpportunityStage(opportunityId, stageId, additionalData = {}) {
  try {
    const response = await ghlClient.put(`/opportunities/${opportunityId}`, {
      pipelineStageId: stageId,
      ...additionalData
    });

    logger.info('Updated opportunity stage', { opportunityId, stageId });
    return response.data;
  } catch (error) {
    logger.error('Failed to update opportunity stage', {
      opportunityId,
      stageId,
      error: error.message,
      response: error.response?.data
    });
    throw error;
  }
}

/**
 * Get opportunity by ID
 * @param {string} opportunityId - GHL Opportunity ID
 */
export async function getOpportunity(opportunityId) {
  try {
    const response = await ghlClient.get(`/opportunities/${opportunityId}`);
    return response.data.opportunity;
  } catch (error) {
    logger.error('Failed to fetch opportunity', {
      opportunityId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Create a new opportunity
 * @param {object} data - Opportunity data
 */
export async function createOpportunity(data) {
  try {
    const response = await ghlClient.post('/opportunities/', data);
    logger.info('Created opportunity', { id: response.data.opportunity?.id });
    return response.data.opportunity;
  } catch (error) {
    logger.error('Failed to create opportunity', {
      error: error.message,
      response: error.response?.data
    });
    throw error;
  }
}

/**
 * Search contacts by email or phone
 * @param {string} locationId - GHL Location ID
 * @param {string} query - Search query (email or phone)
 */
export async function searchContacts(locationId, query) {
  try {
    const response = await ghlClient.get('/contacts/search', {
      params: { locationId, query }
    });
    return response.data.contacts || [];
  } catch (error) {
    logger.error('Failed to search contacts', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Create a new contact
 * @param {object} data - Contact data
 */
export async function createContact(data) {
  try {
    const response = await ghlClient.post('/contacts/', data);
    logger.info('Created contact', { id: response.data.contact?.id });
    return response.data.contact;
  } catch (error) {
    logger.error('Failed to create contact', {
      error: error.message,
      response: error.response?.data
    });
    throw error;
  }
}

export default {
  getPipelines,
  getPipelineStages,
  updateOpportunityStage,
  getOpportunity,
  createOpportunity,
  searchContacts,
  createContact
};
