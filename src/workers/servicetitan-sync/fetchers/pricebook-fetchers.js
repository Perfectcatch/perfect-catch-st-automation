/**
 * Pricebook Module Fetchers
 *
 * Fetchers for:
 * - raw_st_pricebook_materials
 * - raw_st_pricebook_services
 * - raw_st_pricebook_equipment
 * - raw_st_pricebook_categories
 */

import { BaseFetcher } from './base-fetcher.js';

// ============================================================================
// MATERIALS FETCHER
// ============================================================================

export class PricebookMaterialsFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_pricebook_materials',
      endpoint: '/pricebook/v2/tenant/{tenant}/materials',
    });
  }

  /**
   * Override fullSync to fetch both active AND inactive items
   * ServiceTitan API filters to active=true by default
   */
  async fullSync(queryParams = {}) {
    // Fetch active items
    const activeResult = await super.fullSync({ ...queryParams, active: 'true' });

    // Fetch inactive items
    const inactiveResult = await super.fullSync({ ...queryParams, active: 'false' });

    return {
      success: true,
      active: activeResult,
      inactive: inactiveResult,
      totalRecords: (activeResult.records || 0) + (inactiveResult.records || 0),
    };
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'code',
      'display_name',
      'description',
      'cost',
      'price',
      'member_price',
      'add_on_price',
      'active',
      'taxable',
      'hours',
      'unit_of_measure',
      'is_inventory',
      'account',
      'cost_of_sale_account',
      'asset_account',
      'primary_vendor',
      'other_vendors',
      'categories',
      'assets',
      'st_created_on',
      'st_modified_on',
      'fetched_at',
      'full_data',
    ];
  }

  transformRecord(record) {
    return {
      st_id: record.id,
      tenant_id: this.tenantId,
      code: record.code,
      display_name: record.displayName,
      description: record.description,
      cost: record.cost || 0,
      price: record.price || 0,
      member_price: record.memberPrice || 0,
      add_on_price: record.addOnPrice || 0,
      active: record.active ?? true,
      taxable: record.taxable ?? false,
      hours: record.hours || 0,
      unit_of_measure: record.unitOfMeasure,
      is_inventory: record.isInventory ?? false,
      account: record.account,
      cost_of_sale_account: record.costOfSaleAccount,
      asset_account: record.assetAccount,
      primary_vendor: record.primaryVendor,
      other_vendors: record.otherVendors || [],
      categories: record.categories || [],
      assets: record.assets || [],
      st_created_on: record.createdOn,
      st_modified_on: record.modifiedOn,
      fetched_at: new Date(),
      full_data: record,
    };
  }
}

// ============================================================================
// SERVICES FETCHER
// ============================================================================

export class PricebookServicesFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_pricebook_services',
      endpoint: '/pricebook/v2/tenant/{tenant}/services',
    });
  }

  /**
   * Override fullSync to fetch both active AND inactive items
   * ServiceTitan API filters to active=true by default
   */
  async fullSync(queryParams = {}) {
    // Fetch active items
    const activeResult = await super.fullSync({ ...queryParams, active: 'true' });

    // Fetch inactive items
    const inactiveResult = await super.fullSync({ ...queryParams, active: 'false' });

    return {
      success: true,
      active: activeResult,
      inactive: inactiveResult,
      totalRecords: (activeResult.records || 0) + (inactiveResult.records || 0),
    };
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'code',
      'display_name',
      'description',
      'price',
      'member_price',
      'add_on_price',
      'active',
      'taxable',
      'hours',
      'is_labor',
      'account',
      'warranty',
      'categories',
      'assets',
      'service_materials',
      'service_equipment',
      'recommendations',
      'upgrades',
      'st_created_on',
      'st_modified_on',
      'fetched_at',
      'full_data',
    ];
  }

  transformRecord(record) {
    return {
      st_id: record.id,
      tenant_id: this.tenantId,
      code: record.code,
      display_name: record.displayName,
      description: record.description,
      price: record.price || 0,
      member_price: record.memberPrice || 0,
      add_on_price: record.addOnPrice || 0,
      active: record.active ?? true,
      taxable: record.taxable ?? false,
      hours: record.hours || 0,
      is_labor: record.isLabor ?? false,
      account: record.account,
      warranty: record.warranty,
      categories: record.categories || [],
      assets: record.assets || [],
      service_materials: record.serviceMaterials || [],
      service_equipment: record.serviceEquipment || [],
      recommendations: record.recommendations || [],
      upgrades: record.upgrades || [],
      st_created_on: record.createdOn,
      st_modified_on: record.modifiedOn,
      fetched_at: new Date(),
      full_data: record,
    };
  }
}

// ============================================================================
// EQUIPMENT FETCHER
// ============================================================================

export class PricebookEquipmentFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_pricebook_equipment',
      endpoint: '/pricebook/v2/tenant/{tenant}/equipment',
    });
  }

  /**
   * Override fullSync to fetch both active AND inactive items
   * ServiceTitan API filters to active=true by default
   */
  async fullSync(queryParams = {}) {
    // Fetch active items
    const activeResult = await super.fullSync({ ...queryParams, active: 'true' });

    // Fetch inactive items
    const inactiveResult = await super.fullSync({ ...queryParams, active: 'false' });

    return {
      success: true,
      active: activeResult,
      inactive: inactiveResult,
      totalRecords: (activeResult.records || 0) + (inactiveResult.records || 0),
    };
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'code',
      'display_name',
      'description',
      'price',
      'member_price',
      'add_on_price',
      'cost',
      'active',
      'taxable',
      'manufacturer',
      'model',
      'manufacturer_warranty',
      'service_warranty',
      'categories',
      'assets',
      'primary_vendor',
      'other_vendors',
      'equipment_materials',
      'recommendations',
      'st_created_on',
      'st_modified_on',
      'fetched_at',
      'full_data',
    ];
  }

  transformRecord(record) {
    return {
      st_id: record.id,
      tenant_id: this.tenantId,
      code: record.code,
      display_name: record.displayName,
      description: record.description,
      price: record.price || 0,
      member_price: record.memberPrice || 0,
      add_on_price: record.addOnPrice || 0,
      cost: record.cost || 0,
      active: record.active ?? true,
      taxable: record.taxable ?? false,
      manufacturer: record.manufacturer,
      model: record.model,
      manufacturer_warranty: record.manufacturerWarranty,
      service_warranty: record.serviceProviderWarranty,
      categories: record.categories || [],
      assets: record.assets || [],
      primary_vendor: record.primaryVendor,
      other_vendors: record.otherVendors || [],
      equipment_materials: record.equipmentMaterials || [],
      recommendations: record.recommendations || [],
      st_created_on: record.createdOn,
      st_modified_on: record.modifiedOn,
      fetched_at: new Date(),
      full_data: record,
    };
  }
}

// ============================================================================
// CATEGORIES FETCHER
// ============================================================================

export class PricebookCategoriesFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_pricebook_categories',
      endpoint: '/pricebook/v2/tenant/{tenant}/categories',
    });
  }

  /**
   * Override fullSync to fetch both active AND inactive items
   * ServiceTitan API filters to active=true by default
   */
  async fullSync(queryParams = {}) {
    // Fetch active items
    const activeResult = await super.fullSync({ ...queryParams, active: 'true' });

    // Fetch inactive items
    const inactiveResult = await super.fullSync({ ...queryParams, active: 'false' });

    return {
      success: true,
      active: activeResult,
      inactive: inactiveResult,
      totalRecords: (activeResult.records || 0) + (inactiveResult.records || 0),
    };
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'name',
      'active',
      'description',
      'image',
      'parent_id',
      'position',
      'category_type',
      'subcategories',
      'business_unit_ids',
      'fetched_at',
      'full_data',
    ];
  }

  getPgArrayColumns() {
    return ['business_unit_ids'];
  }

  transformRecord(record) {
    return {
      st_id: record.id,
      tenant_id: this.tenantId,
      name: record.name,
      active: record.active ?? true,
      description: record.description,
      image: record.image,
      parent_id: record.parentId,
      position: record.position,
      category_type: record.categoryType,
      subcategories: record.subcategories || [],
      business_unit_ids: record.businessUnitIds || [],
      fetched_at: new Date(),
      full_data: record,
    };
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export async function syncAllPricebook() {
  const results = {};

  const fetchers = [
    { name: 'categories', fetcher: new PricebookCategoriesFetcher() },
    { name: 'materials', fetcher: new PricebookMaterialsFetcher() },
    { name: 'services', fetcher: new PricebookServicesFetcher() },
    { name: 'equipment', fetcher: new PricebookEquipmentFetcher() },
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
  PricebookMaterialsFetcher,
  PricebookServicesFetcher,
  PricebookEquipmentFetcher,
  PricebookCategoriesFetcher,
  syncAllPricebook,
};
