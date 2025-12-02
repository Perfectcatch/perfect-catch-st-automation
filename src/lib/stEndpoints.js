/**
 * ServiceTitan Endpoint URL Builders
 * Centralized URL construction for all ST API endpoints
 * 
 * Auto-generated from OpenAPI specs + existing implementations
 * Generated: 2025-12-02
 * Total Modules: 11
 * Total Endpoint Groups: 200+
 */

import config from '../config/index.js';

const { apiBaseUrl, tenantId } = config.serviceTitan;

// Base URL builders for each ST API module
const baseUrls = {
  // Existing modules (no OpenAPI specs provided, but working)
  jpm: `${apiBaseUrl}/jpm/v2/tenant/${tenantId}`,
  crm: `${apiBaseUrl}/crm/v2/tenant/${tenantId}`,
  sales: `${apiBaseUrl}/sales/v2/tenant/${tenantId}`,
  salestech: `${apiBaseUrl}/salestech/v2/tenant/${tenantId}`,
  
  // New modules from OpenAPI specs
  accounting: `${apiBaseUrl}/accounting/v2/tenant/${tenantId}`,
  dispatch: `${apiBaseUrl}/dispatch/v2/tenant/${tenantId}`,
  equipmentsystems: `${apiBaseUrl}/equipmentsystems/v2/tenant/${tenantId}`,
  jbce: `${apiBaseUrl}/jbce/v2/tenant/${tenantId}`,
  payroll: `${apiBaseUrl}/payroll/v2/tenant/${tenantId}`,
  pricebook: `${apiBaseUrl}/pricebook/v2/tenant/${tenantId}`,
  settings: `${apiBaseUrl}/settings/v2/tenant/${tenantId}`,
};

export const stEndpoints = {
  // ═══════════════════════════════════════════════════════════════
  // EXISTING MODULES (jpm, crm, sales, salestech)
  // ═══════════════════════════════════════════════════════════════

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
    create: () => `${baseUrls.crm}/customers`,
    update: (id) => `${baseUrls.crm}/customers/${id}`,
    contacts: {
      list: () => `${baseUrls.crm}/customers/contacts`,
      byCustomer: (customerId) => `${baseUrls.crm}/customers/${customerId}/contacts`,
    },
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

  // ═══════════════════════════════════════════════════════════════
  // ACCOUNTING MODULE (54 endpoints)
  // ═══════════════════════════════════════════════════════════════

  apBills: {
    list: () => `${baseUrls.accounting}/ap-bills`,
    get: (billId) => `${baseUrls.accounting}/ap-bills/${billId}`,
    create: () => `${baseUrls.accounting}/ap-bills`,
    update: (billId) => `${baseUrls.accounting}/ap-bills/${billId}`,
    delete: (billId) => `${baseUrls.accounting}/ap-bills/${billId}`,
    export: () => `${baseUrls.accounting}/export/ap-bills`,
  },

  apCredits: {
    list: () => `${baseUrls.accounting}/ap-credits`,
    get: (creditId) => `${baseUrls.accounting}/ap-credits/${creditId}`,
    export: () => `${baseUrls.accounting}/export/ap-credits`,
  },

  apPayments: {
    list: () => `${baseUrls.accounting}/ap-payments`,
    get: (paymentId) => `${baseUrls.accounting}/ap-payments/${paymentId}`,
    export: () => `${baseUrls.accounting}/export/ap-payments`,
  },

  creditMemos: {
    list: () => `${baseUrls.accounting}/credit-memos`,
    get: (id) => `${baseUrls.accounting}/credit-memos/${id}`,
  },

  deposits: {
    list: () => `${baseUrls.accounting}/deposits`,
    get: (id) => `${baseUrls.accounting}/deposits/${id}`,
  },

  glAccounts: {
    list: () => `${baseUrls.accounting}/gl-accounts`,
    get: (id) => `${baseUrls.accounting}/gl-accounts/${id}`,
  },

  inventoryBills: {
    list: () => `${baseUrls.accounting}/inventory-bills`,
    get: (id) => `${baseUrls.accounting}/inventory-bills/${id}`,
    export: () => `${baseUrls.accounting}/export/inventory-bills`,
  },

  invoices: {
    list: () => `${baseUrls.accounting}/invoices`,
    get: (id) => `${baseUrls.accounting}/invoices/${id}`,
    export: () => `${baseUrls.accounting}/export/invoices`,
  },

  journalEntries: {
    list: () => `${baseUrls.accounting}/journal-entries`,
    get: (id) => `${baseUrls.accounting}/journal-entries/${id}`,
    create: () => `${baseUrls.accounting}/journal-entries`,
    export: () => `${baseUrls.accounting}/export/journal-entries`,
  },

  payments: {
    list: () => `${baseUrls.accounting}/payments`,
    get: (id) => `${baseUrls.accounting}/payments/${id}`,
    export: () => `${baseUrls.accounting}/export/payments`,
  },

  paymentTerms: {
    list: () => `${baseUrls.accounting}/payment-terms`,
    get: (id) => `${baseUrls.accounting}/payment-terms/${id}`,
  },

  paymentTypes: {
    list: () => `${baseUrls.accounting}/payment-types`,
    get: (id) => `${baseUrls.accounting}/payment-types/${id}`,
  },

  remittanceVendors: {
    list: () => `${baseUrls.accounting}/remittance-vendors`,
    get: (id) => `${baseUrls.accounting}/remittance-vendors/${id}`,
  },

  taxZones: {
    list: () => `${baseUrls.accounting}/tax-zones`,
    get: (id) => `${baseUrls.accounting}/tax-zones/${id}`,
  },

  // ═══════════════════════════════════════════════════════════════
  // DISPATCH MODULE (36 endpoints)
  // ═══════════════════════════════════════════════════════════════

  gps: {
    create: (gpsProvider) => `${baseUrls.dispatch}/gps-provider/${gpsProvider}/gps-pings`,
  },

  appointmentAssignments: {
    list: () => `${baseUrls.dispatch}/appointment-assignments`,
    assignTechnicians: () => `${baseUrls.dispatch}/appointment-assignments/assign-technicians`,
    unassignTechnicians: () => `${baseUrls.dispatch}/appointment-assignments/unassign-technicians`,
  },

  arrivalWindows: {
    list: () => `${baseUrls.dispatch}/arrival-windows`,
    get: (id) => `${baseUrls.dispatch}/arrival-windows/${id}`,
  },

  businessHours: {
    list: () => `${baseUrls.dispatch}/business-hours`,
    get: (id) => `${baseUrls.dispatch}/business-hours/${id}`,
  },

  capacity: {
    list: () => `${baseUrls.dispatch}/capacity`,
  },

  nonJobAppointments: {
    list: () => `${baseUrls.dispatch}/non-job-appointments`,
    get: (id) => `${baseUrls.dispatch}/non-job-appointments/${id}`,
    create: () => `${baseUrls.dispatch}/non-job-appointments`,
    update: (id) => `${baseUrls.dispatch}/non-job-appointments/${id}`,
    delete: (id) => `${baseUrls.dispatch}/non-job-appointments/${id}`,
  },

  teams: {
    list: () => `${baseUrls.dispatch}/teams`,
    get: (id) => `${baseUrls.dispatch}/teams/${id}`,
  },

  technicianShifts: {
    list: () => `${baseUrls.dispatch}/technician-shifts`,
    get: (id) => `${baseUrls.dispatch}/technician-shifts/${id}`,
    create: () => `${baseUrls.dispatch}/technician-shifts`,
    update: (id) => `${baseUrls.dispatch}/technician-shifts/${id}`,
    delete: (id) => `${baseUrls.dispatch}/technician-shifts/${id}`,
    export: () => `${baseUrls.dispatch}/export/technician-shifts`,
  },

  technicianTracking: {
    list: () => `${baseUrls.dispatch}/technician-tracking`,
  },

  zones: {
    list: () => `${baseUrls.dispatch}/zones`,
    get: (id) => `${baseUrls.dispatch}/zones/${id}`,
  },

  // ═══════════════════════════════════════════════════════════════
  // EQUIPMENT SYSTEMS MODULE (8 endpoints)
  // ═══════════════════════════════════════════════════════════════

  installedEquipment: {
    list: () => `${baseUrls.equipmentsystems}/installed-equipment`,
    get: (id) => `${baseUrls.equipmentsystems}/installed-equipment/${id}`,
    create: () => `${baseUrls.equipmentsystems}/installed-equipment`,
    update: (id) => `${baseUrls.equipmentsystems}/installed-equipment/${id}`,
    delete: (id) => `${baseUrls.equipmentsystems}/installed-equipment/${id}`,
    export: () => `${baseUrls.equipmentsystems}/export/installed-equipment`,
  },

  // ═══════════════════════════════════════════════════════════════
  // JOB BOOKING MODULE (1 endpoint)
  // ═══════════════════════════════════════════════════════════════

  callReasons: {
    list: () => `${baseUrls.jbce}/call-reasons`,
  },

  // ═══════════════════════════════════════════════════════════════
  // PAYROLL MODULE (34 endpoints)
  // ═══════════════════════════════════════════════════════════════

  grossPayItems: {
    list: () => `${baseUrls.payroll}/gross-pay-items`,
    get: (id) => `${baseUrls.payroll}/gross-pay-items/${id}`,
    create: () => `${baseUrls.payroll}/gross-pay-items`,
    update: (id) => `${baseUrls.payroll}/gross-pay-items/${id}`,
    delete: (id) => `${baseUrls.payroll}/gross-pay-items/${id}`,
    export: () => `${baseUrls.payroll}/export/gross-pay-items`,
  },

  jobSplits: {
    list: () => `${baseUrls.payroll}/jobs/splits`,
    get: (jobId) => `${baseUrls.payroll}/jobs/${jobId}/splits`,
    update: (jobId) => `${baseUrls.payroll}/jobs/${jobId}/splits`,
    export: () => `${baseUrls.payroll}/export/jobs/splits`,
  },

  locationLaborTypes: {
    list: () => `${baseUrls.payroll}/location-labor-types`,
    get: (id) => `${baseUrls.payroll}/location-labor-types/${id}`,
  },

  activityCodes: {
    list: () => `${baseUrls.payroll}/activity-codes`,
    get: (id) => `${baseUrls.payroll}/activity-codes/${id}`,
    export: () => `${baseUrls.payroll}/export/activity-codes`,
  },

  payrollAdjustments: {
    list: () => `${baseUrls.payroll}/payroll-adjustments`,
    get: (id) => `${baseUrls.payroll}/payroll-adjustments/${id}`,
    create: () => `${baseUrls.payroll}/payroll-adjustments`,
    update: (id) => `${baseUrls.payroll}/payroll-adjustments/${id}`,
    delete: (id) => `${baseUrls.payroll}/payroll-adjustments/${id}`,
    export: () => `${baseUrls.payroll}/export/payroll-adjustments`,
  },

  payrolls: {
    list: () => `${baseUrls.payroll}/payrolls`,
    get: (id) => `${baseUrls.payroll}/payrolls/${id}`,
    export: () => `${baseUrls.payroll}/export/payrolls`,
  },

  payrollSettings: {
    get: () => `${baseUrls.payroll}/payroll-settings`,
  },

  timesheetCodes: {
    list: () => `${baseUrls.payroll}/timesheet-codes`,
    get: (id) => `${baseUrls.payroll}/timesheet-codes/${id}`,
    export: () => `${baseUrls.payroll}/export/timesheet-codes`,
  },

  timesheets: {
    list: () => `${baseUrls.payroll}/jobs/timesheets`,
    export: () => `${baseUrls.payroll}/export/jobs/timesheets`,
  },

  // ═══════════════════════════════════════════════════════════════
  // PRICEBOOK MODULE (40 endpoints)
  // ═══════════════════════════════════════════════════════════════

  clientSpecificPricing: {
    list: () => `${baseUrls.pricebook}/clientspecificpricing`,
    update: (rateSheetId) => `${baseUrls.pricebook}/clientspecificpricing/${rateSheetId}`,
  },

  categories: {
    list: () => `${baseUrls.pricebook}/categories`,
    get: (id) => `${baseUrls.pricebook}/categories/${id}`,
    create: () => `${baseUrls.pricebook}/categories`,
    update: (id) => `${baseUrls.pricebook}/categories/${id}`,
    delete: (id) => `${baseUrls.pricebook}/categories/${id}`,
  },

  discountAndFees: {
    list: () => `${baseUrls.pricebook}/discounts-and-fees`,
    get: (id) => `${baseUrls.pricebook}/discounts-and-fees/${id}`,
    create: () => `${baseUrls.pricebook}/discounts-and-fees`,
    update: (id) => `${baseUrls.pricebook}/discounts-and-fees/${id}`,
    delete: (id) => `${baseUrls.pricebook}/discounts-and-fees/${id}`,
  },

  equipment: {
    list: () => `${baseUrls.pricebook}/equipment`,
    get: (id) => `${baseUrls.pricebook}/equipment/${id}`,
    create: () => `${baseUrls.pricebook}/equipment`,
    update: (id) => `${baseUrls.pricebook}/equipment/${id}`,
    delete: (id) => `${baseUrls.pricebook}/equipment/${id}`,
  },

  images: {
    upload: () => `${baseUrls.pricebook}/images`,
  },

  materials: {
    list: () => `${baseUrls.pricebook}/materials`,
    get: (id) => `${baseUrls.pricebook}/materials/${id}`,
    create: () => `${baseUrls.pricebook}/materials`,
    update: (id) => `${baseUrls.pricebook}/materials/${id}`,
    delete: (id) => `${baseUrls.pricebook}/materials/${id}`,
    export: () => `${baseUrls.pricebook}/export/materials`,
  },

  materialsMarkup: {
    list: () => `${baseUrls.pricebook}/materials-markup`,
    get: (id) => `${baseUrls.pricebook}/materials-markup/${id}`,
    create: () => `${baseUrls.pricebook}/materials-markup`,
    update: (id) => `${baseUrls.pricebook}/materials-markup/${id}`,
    delete: (id) => `${baseUrls.pricebook}/materials-markup/${id}`,
  },

  pricebookBulk: {
    import: () => `${baseUrls.pricebook}/bulk/import`,
    export: () => `${baseUrls.pricebook}/bulk/export`,
  },

  services: {
    list: () => `${baseUrls.pricebook}/services`,
    get: (id) => `${baseUrls.pricebook}/services/${id}`,
    create: () => `${baseUrls.pricebook}/services`,
    update: (id) => `${baseUrls.pricebook}/services/${id}`,
    delete: (id) => `${baseUrls.pricebook}/services/${id}`,
    export: () => `${baseUrls.pricebook}/export/services`,
  },

  // ═══════════════════════════════════════════════════════════════
  // SETTINGS MODULE (20 endpoints)
  // ═══════════════════════════════════════════════════════════════

  employees: {
    list: () => `${baseUrls.settings}/employees`,
    get: (id) => `${baseUrls.settings}/employees/${id}`,
    create: () => `${baseUrls.settings}/employees`,
    update: (id) => `${baseUrls.settings}/employees/${id}`,
    accountActions: (id) => `${baseUrls.settings}/employees/${id}/account-actions`,
    export: () => `${baseUrls.settings}/export/employees`,
  },

  technicians: {
    list: () => `${baseUrls.settings}/technicians`,
    get: (id) => `${baseUrls.settings}/technicians/${id}`,
    create: () => `${baseUrls.settings}/technicians`,
    update: (id) => `${baseUrls.settings}/technicians/${id}`,
    export: () => `${baseUrls.settings}/export/technicians`,
  },

  userRoles: {
    list: () => `${baseUrls.settings}/user-roles`,
    get: (id) => `${baseUrls.settings}/user-roles/${id}`,
  },

  businessUnits: {
    list: () => `${baseUrls.settings}/business-units`,
    get: (id) => `${baseUrls.settings}/business-units/${id}`,
    create: () => `${baseUrls.settings}/business-units`,
    update: (id) => `${baseUrls.settings}/business-units/${id}`,
  },

  tagTypes: {
    list: () => `${baseUrls.settings}/tag-types`,
    get: (id) => `${baseUrls.settings}/tag-types/${id}`,
    create: () => `${baseUrls.settings}/tag-types`,
    update: (id) => `${baseUrls.settings}/tag-types/${id}`,
  },
};

export default stEndpoints;
