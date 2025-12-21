/**
 * Settings Module Fetchers
 *
 * Fetchers for:
 * - raw_st_technicians
 * - raw_st_employees
 * - raw_st_business_units
 * - raw_st_tag_types
 */

import { BaseFetcher } from './base-fetcher.js';

// ============================================================================
// TECHNICIANS FETCHER
// ============================================================================

export class TechniciansFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_technicians',
      endpoint: '/settings/v2/tenant/{tenant}/technicians',
    });
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'user_id',
      'name',
      'role_ids',
      'business_unit_id',
      'main_zone_id',
      'zone_ids',
      'email',
      'phone',
      'login_name',
      'home',
      'daily_goal',
      'is_managed_tech',
      'custom_fields',
      'active',
      'burden_rate',
      'team',
      'job_filter',
      'permissions',
      'st_created_on',
      'st_modified_on',
      'fetched_at',
      'full_data',
    ];
  }

  getPgArrayColumns() {
    return ['role_ids', 'zone_ids'];
  }

  transformRecord(record) {
    return {
      st_id: record.id,
      tenant_id: this.tenantId,
      user_id: record.userId,
      name: record.name,
      role_ids: record.roleIds || [],
      business_unit_id: record.businessUnitId,
      main_zone_id: record.mainZoneId,
      zone_ids: record.zoneIds || [],
      email: record.email,
      phone: record.phoneNumber,
      login_name: record.loginName,
      home: record.home,
      daily_goal: record.dailyGoal,
      is_managed_tech: record.isManagedTech ?? false,
      custom_fields: record.customFields || [],
      active: record.active ?? true,
      burden_rate: record.burdenRate,
      team: record.team,
      job_filter: record.jobFilter,
      permissions: record.permissions || [],
      st_created_on: record.createdOn,
      st_modified_on: record.modifiedOn,
      fetched_at: new Date(),
      full_data: record,
    };
  }
}

// ============================================================================
// EMPLOYEES FETCHER
// ============================================================================

export class EmployeesFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_employees',
      endpoint: '/settings/v2/tenant/{tenant}/employees',
    });
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'user_id',
      'name',
      'role',
      'role_ids',
      'business_unit_id',
      'email',
      'phone',
      'login_name',
      'active',
      'permissions',
      'custom_fields',
      'st_created_on',
      'st_modified_on',
      'fetched_at',
      'full_data',
    ];
  }

  getPgArrayColumns() {
    return ['role_ids'];
  }

  transformRecord(record) {
    return {
      st_id: record.id,
      tenant_id: this.tenantId,
      user_id: record.userId,
      name: record.name,
      role: record.role,
      role_ids: record.roleIds || [],
      business_unit_id: record.businessUnitId,
      email: record.email,
      phone: record.phoneNumber,
      login_name: record.loginName,
      active: record.active ?? true,
      permissions: record.permissions || [],
      custom_fields: record.customFields || [],
      st_created_on: record.createdOn,
      st_modified_on: record.modifiedOn,
      fetched_at: new Date(),
      full_data: record,
    };
  }
}

// ============================================================================
// BUSINESS UNITS FETCHER
// ============================================================================

export class BusinessUnitsFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_business_units',
      endpoint: '/settings/v2/tenant/{tenant}/business-units',
    });
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'active',
      'name',
      'official_name',
      'email',
      'currency',
      'phone',
      'invoice_header',
      'invoice_message',
      'default_tax_rate',
      'address',
      'trade',
      'division',
      'tag_type_ids',
      'external_data',
      'st_created_on',
      'st_modified_on',
      'fetched_at',
      'full_data',
    ];
  }

  getPgArrayColumns() {
    return ['tag_type_ids'];
  }

  transformRecord(record) {
    return {
      st_id: record.id,
      tenant_id: this.tenantId,
      active: record.active ?? true,
      name: record.name,
      official_name: record.officialName,
      email: record.email,
      currency: record.currency,
      phone: record.phoneNumber,
      invoice_header: record.invoiceHeader,
      invoice_message: record.invoiceMessage,
      default_tax_rate: record.defaultTaxRate || 0,
      address: record.address,
      trade: record.trade,
      division: record.division,
      tag_type_ids: record.tagTypeIds || [],
      external_data: record.externalData,
      st_created_on: record.createdOn,
      st_modified_on: record.modifiedOn,
      fetched_at: new Date(),
      full_data: record,
    };
  }
}

// ============================================================================
// TAG TYPES FETCHER
// ============================================================================

export class TagTypesFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_tag_types',
      endpoint: '/settings/v2/tenant/{tenant}/tag-types',
    });
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'name',
      'active',
      'code',
      'color',
      'entity_type',
      'st_modified_on',
      'fetched_at',
      'full_data',
    ];
  }

  transformRecord(record) {
    return {
      st_id: record.id,
      tenant_id: this.tenantId,
      name: record.name,
      active: record.active ?? true,
      code: record.code,
      color: record.color,
      entity_type: record.entityType,
      st_modified_on: record.modifiedOn,
      fetched_at: new Date(),
      full_data: record,
    };
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export async function syncAllSettings() {
  const results = {};

  const fetchers = [
    { name: 'technicians', fetcher: new TechniciansFetcher() },
    { name: 'employees', fetcher: new EmployeesFetcher() },
    { name: 'business_units', fetcher: new BusinessUnitsFetcher() },
    { name: 'tag_types', fetcher: new TagTypesFetcher() },
  ];

  for (const { name, fetcher } of fetchers) {
    try {
      results[name] = await fetcher.fullSync();
    } catch (error) {
      results[name] = { success: false, error: error.message };
    } finally {
      await fetcher.close();
    }
  }

  return results;
}

export default {
  TechniciansFetcher,
  EmployeesFetcher,
  BusinessUnitsFetcher,
  TagTypesFetcher,
  syncAllSettings,
};
