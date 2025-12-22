/**
 * CRM API Client
 * Handles communication with Payload CMS API
 */

import axios from 'axios';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('crm-api-client');

let crmClient = null;

export function getCRMClient() {
  if (!crmClient) {
    const baseURL = process.env.CRM_API_URL || 'http://localhost:3005';
    const webhookSecret = process.env.CRM_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.warn('CRM_WEBHOOK_SECRET not set - API requests may fail');
    }

    crmClient = axios.create({
      baseURL: `${baseURL}/api`,
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': webhookSecret || '',
      },
      timeout: 30000,
    });

    // Add response interceptor for logging
    crmClient.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error({
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          data: error.response?.data,
        }, 'CRM API error');
        throw error;
      }
    );
  }
  return crmClient;
}

// Contacts
export async function findContactBySTCustomerId(stCustomerId) {
  const response = await getCRMClient().get('/contacts', {
    params: {
      where: { serviceTitanId: { equals: String(stCustomerId) } },
      limit: 1,
    },
  });
  return response.data.docs[0] || null;
}

export async function createContact(data) {
  const response = await getCRMClient().post('/contacts', data);
  return response.data.doc;
}

export async function updateContact(id, data) {
  const response = await getCRMClient().patch(`/contacts/${id}`, data);
  return response.data.doc;
}

// Opportunities
export async function findOpportunityBySTJobId(stJobId) {
  const response = await getCRMClient().get('/opportunities', {
    params: {
      where: { serviceTitanId: { equals: String(stJobId) } },
      limit: 1,
      depth: 1,
    },
  });
  return response.data.docs[0] || null;
}

export async function findOpportunityBySTCustomerId(stCustomerId, contactId) {
  // Find by contact relationship since we track customer via contact
  const response = await getCRMClient().get('/opportunities', {
    params: {
      where: { contact: { equals: contactId } },
      limit: 1,
      depth: 1,
    },
  });
  return response.data.docs[0] || null;
}

export async function findOpportunitiesByContact(contactId) {
  const response = await getCRMClient().get('/opportunities', {
    params: {
      where: { contact: { equals: contactId } },
      depth: 1,
    },
  });
  return response.data.docs;
}

export async function createOpportunity(data) {
  const response = await getCRMClient().post('/opportunities', data);
  return response.data.doc;
}

export async function updateOpportunity(id, data) {
  const response = await getCRMClient().patch(`/opportunities/${id}`, data);
  return response.data.doc;
}

// Pipelines
export async function getPipelines() {
  const response = await getCRMClient().get('/pipelines', {
    params: { limit: 50 },
  });
  return response.data.docs;
}

export async function getPipelineStages(pipelineId) {
  const response = await getCRMClient().get('/pipeline-stages', {
    params: {
      where: { pipeline: { equals: pipelineId } },
      sort: 'order',
      limit: 50,
    },
  });
  return response.data.docs;
}

export default {
  getCRMClient,
  findContactBySTCustomerId,
  createContact,
  updateContact,
  findOpportunityBySTJobId,
  findOpportunitiesByContact,
  createOpportunity,
  updateOpportunity,
  getPipelines,
  getPipelineStages,
};
