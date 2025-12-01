/**
 * ServiceTitan Endpoint URL Builders
 * Centralized URL construction for all ST API endpoints
 */

import config from '../config/index.js';

const { apiBaseUrl, tenantId } = config.serviceTitan;

// Base URL builders for each ST API module
const baseUrls = {
  jpm: `${apiBaseUrl}/jpm/v2/tenant/${tenantId}`,
  crm: `${apiBaseUrl}/crm/v2/tenant/${tenantId}`,
  sales: `${apiBaseUrl}/sales/v2/tenant/${tenantId}`,
  salestech: `${apiBaseUrl}/salestech/v2/tenant/${tenantId}`,
  dispatch: `${apiBaseUrl}/dispatch/v2/tenant/${tenantId}`,
  inventory: `${apiBaseUrl}/inventory/v2/tenant/${tenantId}`,
  accounting: `${apiBaseUrl}/accounting/v2/tenant/${tenantId}`,
  payroll: `${apiBaseUrl}/payroll/v2/tenant/${tenantId}`,
  settings: `${apiBaseUrl}/settings/v2/tenant/${tenantId}`,
  memberships: `${apiBaseUrl}/memberships/v2/tenant/${tenantId}`,
  marketing: `${apiBaseUrl}/marketing/v2/tenant/${tenantId}`,
  pricebook: `${apiBaseUrl}/pricebook/v3/tenant/${tenantId}`,
  forms: `${apiBaseUrl}/forms/v2/tenant/${tenantId}`,
  telecom: `${apiBaseUrl}/telecom/v2/tenant/${tenantId}`,
};

export const stEndpoints = {
  // Jobs (jpm)
  jobs: {
    list: () => `${baseUrls.jpm}/jobs`,
    get: (id) => `${baseUrls.jpm}/jobs/${id}`,
    notes: (id) => `${baseUrls.jpm}/jobs/${id}/notes`,
    history: (id) => `${baseUrls.jpm}/jobs/${id}/history`,
  },

  // Customers (crm)
  customers: {
    list: () => `${baseUrls.crm}/customers`,
    get: (id) => `${baseUrls.crm}/customers/${id}`,
    contacts: {
      list: () => `${baseUrls.crm}/customers/contacts`,
      byCustomer: (customerId) => `${baseUrls.crm}/customers/${customerId}/contacts`,
    },
    create: () => `${baseUrls.crm}/customers`,
    update: (id) => `${baseUrls.crm}/customers/${id}`,
  },

  // Estimates (sales)
  estimates: {
    list: () => `${baseUrls.sales}/estimates`,
    get: (id) => `${baseUrls.sales}/estimates/${id}`,
    create: () => `${baseUrls.sales}/estimates`,
    update: (id) => `${baseUrls.sales}/estimates/${id}`,
    sell: (id) => `${baseUrls.sales}/estimates/${id}/sell`,
    unsell: (id) => `${baseUrls.sales}/estimates/${id}/unsell`,
    dismiss: (id) => `${baseUrls.sales}/estimates/${id}/dismiss`,
    items: {
      list: () => `${baseUrls.sales}/estimates/items`,
      update: (estimateId) => `${baseUrls.sales}/estimates/${estimateId}/items`,
      delete: (estimateId, itemId) => `${baseUrls.sales}/estimates/${estimateId}/items/${itemId}`,
    },
  },

  // Opportunities (salestech)
  opportunities: {
    list: () => `${baseUrls.salestech}/opportunities`,
    get: (id) => `${baseUrls.salestech}/opportunities/${id}`,
    followups: (id) => `${baseUrls.salestech}/opportunities/${id}/followups`,
  },

  // Future expansion endpoints
  locations: {
    list: () => `${baseUrls.crm}/locations`,
    get: (id) => `${baseUrls.crm}/locations/${id}`,
  },

  technicians: {
    list: () => `${baseUrls.settings}/technicians`,
    get: (id) => `${baseUrls.settings}/technicians/${id}`,
  },

  invoices: {
    list: () => `${baseUrls.accounting}/invoices`,
    get: (id) => `${baseUrls.accounting}/invoices/${id}`,
  },

  appointments: {
    list: () => `${baseUrls.dispatch}/appointments`,
    get: (id) => `${baseUrls.dispatch}/appointments/${id}`,
  },
};

export default stEndpoints;
