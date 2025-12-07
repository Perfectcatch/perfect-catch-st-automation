#!/usr/bin/env node
/**
 * Populate Pricebook Database from ServiceTitan API
 * Fetches all categories, materials, services, and equipment
 * and inserts them into the local PostgreSQL database
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const TENANT_ID = process.env.SERVICE_TITAN_TENANT_ID || '3222348440';

async function fetchAllPages(endpoint, pageSize = 100) {
  const allData = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${API_BASE}${endpoint}?page=${page}&pageSize=${pageSize}`;
    console.log(`Fetching: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${endpoint}: ${response.status}`);
    }
    
    const result = await response.json();
    if (result.data && result.data.length > 0) {
      allData.push(...result.data);
    }
    
    hasMore = result.hasMore === true;
    page++;
    
    // Safety limit
    if (page > 100) {
      console.warn('Reached page limit, stopping');
      break;
    }
  }

  return allData;
}

function flattenCategories(categories, parentId = null) {
  const flat = [];
  for (const cat of categories) {
    flat.push({
      stId: BigInt(cat.id),
      tenantId: BigInt(TENANT_ID),
      name: cat.name,
      code: cat.code || null,
      parentId: parentId ? BigInt(parentId) : null,
      displayOrder: cat.position || 0,
      active: cat.active !== false,
      categoryType: cat.categoryType || null,
      stCreatedOn: cat.createdOn ? new Date(cat.createdOn) : null,
      stModifiedOn: cat.modifiedOn ? new Date(cat.modifiedOn) : null,
      syncStatus: 'synced',
      lastSyncedAt: new Date(),
    });
    
    if (cat.subcategories && cat.subcategories.length > 0) {
      flat.push(...flattenCategories(cat.subcategories, cat.id));
    }
  }
  return flat;
}

async function populateCategories() {
  console.log('\n=== Populating Categories ===');
  
  const categories = await fetchAllPages('/pricebook/categories');
  console.log(`Fetched ${categories.length} top-level categories`);
  
  const flatCategories = flattenCategories(categories);
  console.log(`Total categories (including subcategories): ${flatCategories.length}`);
  
  let created = 0;
  let updated = 0;
  
  for (const cat of flatCategories) {
    try {
      await prisma.pricebookCategory.upsert({
        where: { stId: cat.stId },
        create: cat,
        update: {
          name: cat.name,
          code: cat.code,
          parentId: cat.parentId,
          displayOrder: cat.displayOrder,
          active: cat.active,
          categoryType: cat.categoryType,
          stModifiedOn: cat.stModifiedOn,
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
        },
      });
      created++;
    } catch (error) {
      console.error(`Error upserting category ${cat.stId}: ${error.message}`);
    }
  }
  
  console.log(`Categories: ${created} upserted`);
  return created;
}

async function populateMaterials() {
  console.log('\n=== Populating Materials ===');
  
  const materials = await fetchAllPages('/pricebook/materials');
  console.log(`Fetched ${materials.length} materials`);
  
  let created = 0;
  
  for (const mat of materials) {
    try {
      const categoryId = mat.categories?.[0]?.id ? BigInt(mat.categories[0].id) : null;
      
      await prisma.pricebookMaterial.upsert({
        where: { stId: BigInt(mat.id) },
        create: {
          stId: BigInt(mat.id),
          tenantId: BigInt(TENANT_ID),
          categoryId: categoryId,
          code: mat.code || `MAT-${mat.id}`,
          name: mat.displayName || mat.code || `Material ${mat.id}`,
          description: mat.description === 'Null' ? null : mat.description,
          displayName: mat.displayName,
          manufacturer: mat.manufacturer || null,
          sku: mat.sku || null,
          cost: mat.cost ? parseFloat(mat.cost) : null,
          price: mat.price ? parseFloat(mat.price) : null,
          memberPrice: mat.memberPrice ? parseFloat(mat.memberPrice) : null,
          addOnPrice: mat.addOnPrice ? parseFloat(mat.addOnPrice) : null,
          hours: mat.hours ? parseFloat(mat.hours) : null,
          unitOfMeasure: mat.unitOfMeasure === 'Null' ? null : mat.unitOfMeasure,
          active: mat.active !== false,
          taxable: mat.taxable !== false,
          account: mat.account || null,
          primaryVendorId: mat.primaryVendor?.vendorId ? BigInt(mat.primaryVendor.vendorId) : null,
          stCreatedOn: mat.createdOn ? new Date(mat.createdOn) : null,
          stModifiedOn: mat.modifiedOn ? new Date(mat.modifiedOn) : null,
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
        },
        update: {
          categoryId: categoryId,
          name: mat.displayName || mat.code || `Material ${mat.id}`,
          description: mat.description === 'Null' ? null : mat.description,
          displayName: mat.displayName,
          cost: mat.cost ? parseFloat(mat.cost) : null,
          price: mat.price ? parseFloat(mat.price) : null,
          memberPrice: mat.memberPrice ? parseFloat(mat.memberPrice) : null,
          active: mat.active !== false,
          stModifiedOn: mat.modifiedOn ? new Date(mat.modifiedOn) : null,
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
        },
      });
      created++;
    } catch (error) {
      console.error(`Error upserting material ${mat.id}: ${error.message}`);
    }
  }
  
  console.log(`Materials: ${created} upserted`);
  return created;
}

async function populateServices() {
  console.log('\n=== Populating Services ===');
  
  const services = await fetchAllPages('/pricebook/services');
  console.log(`Fetched ${services.length} services`);
  
  let created = 0;
  
  for (const svc of services) {
    try {
      const categoryId = svc.categories?.[0]?.id ? BigInt(svc.categories[0].id) : null;
      
      await prisma.pricebookService.upsert({
        where: { stId: BigInt(svc.id) },
        create: {
          stId: BigInt(svc.id),
          tenantId: BigInt(TENANT_ID),
          categoryId: categoryId,
          code: svc.code || `SVC-${svc.id}`,
          name: svc.displayName || svc.code || `Service ${svc.id}`,
          description: svc.description === 'Null' ? null : svc.description,
          displayName: svc.displayName,
          price: svc.price ? parseFloat(svc.price) : null,
          memberPrice: svc.memberPrice ? parseFloat(svc.memberPrice) : null,
          addOnPrice: svc.addOnPrice ? parseFloat(svc.addOnPrice) : null,
          durationHours: svc.hours ? parseFloat(svc.hours) : null,
          active: svc.active !== false,
          taxable: svc.taxable !== false,
          account: svc.account || null,
          stCreatedOn: svc.createdOn ? new Date(svc.createdOn) : null,
          stModifiedOn: svc.modifiedOn ? new Date(svc.modifiedOn) : null,
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
        },
        update: {
          categoryId: categoryId,
          name: svc.displayName || svc.code || `Service ${svc.id}`,
          description: svc.description === 'Null' ? null : svc.description,
          displayName: svc.displayName,
          price: svc.price ? parseFloat(svc.price) : null,
          memberPrice: svc.memberPrice ? parseFloat(svc.memberPrice) : null,
          durationHours: svc.hours ? parseFloat(svc.hours) : null,
          active: svc.active !== false,
          stModifiedOn: svc.modifiedOn ? new Date(svc.modifiedOn) : null,
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
        },
      });
      created++;
    } catch (error) {
      console.error(`Error upserting service ${svc.id}: ${error.message}`);
    }
  }
  
  console.log(`Services: ${created} upserted`);
  return created;
}

async function populateEquipment() {
  console.log('\n=== Populating Equipment ===');
  
  const equipment = await fetchAllPages('/pricebook/equipment');
  console.log(`Fetched ${equipment.length} equipment items`);
  
  let created = 0;
  
  for (const eq of equipment) {
    try {
      const categoryId = eq.categories?.[0]?.id ? BigInt(eq.categories[0].id) : null;
      
      await prisma.pricebookEquipment.upsert({
        where: { stId: BigInt(eq.id) },
        create: {
          stId: BigInt(eq.id),
          tenantId: BigInt(TENANT_ID),
          categoryId: categoryId,
          code: eq.code || `EQ-${eq.id}`,
          name: eq.displayName || eq.code || `Equipment ${eq.id}`,
          description: eq.description === 'Null' ? null : eq.description,
          displayName: eq.displayName,
          manufacturer: eq.manufacturer || null,
          modelNumber: eq.model || null,
          price: eq.price ? parseFloat(eq.price) : null,
          cost: eq.cost ? parseFloat(eq.cost) : null,
          active: eq.active !== false,
          stCreatedOn: eq.createdOn ? new Date(eq.createdOn) : null,
          stModifiedOn: eq.modifiedOn ? new Date(eq.modifiedOn) : null,
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
        },
        update: {
          categoryId: categoryId,
          name: eq.displayName || eq.code || `Equipment ${eq.id}`,
          description: eq.description === 'Null' ? null : eq.description,
          price: eq.price ? parseFloat(eq.price) : null,
          cost: eq.cost ? parseFloat(eq.cost) : null,
          active: eq.active !== false,
          stModifiedOn: eq.modifiedOn ? new Date(eq.modifiedOn) : null,
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
        },
      });
      created++;
    } catch (error) {
      console.error(`Error upserting equipment ${eq.id}: ${error.message}`);
    }
  }
  
  console.log(`Equipment: ${created} upserted`);
  return created;
}

async function main() {
  console.log('========================================');
  console.log('Pricebook Database Population Script');
  console.log('========================================');
  console.log(`API Base: ${API_BASE}`);
  console.log(`Tenant ID: ${TENANT_ID}`);
  console.log('');

  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    console.log('✓ Database connection successful\n');

    const results = {
      categories: await populateCategories(),
      materials: await populateMaterials(),
      services: await populateServices(),
      equipment: await populateEquipment(),
    };

    console.log('\n========================================');
    console.log('Population Complete!');
    console.log('========================================');
    console.log(`Categories: ${results.categories}`);
    console.log(`Materials:  ${results.materials}`);
    console.log(`Services:   ${results.services}`);
    console.log(`Equipment:  ${results.equipment}`);
    console.log(`Total:      ${Object.values(results).reduce((a, b) => a + b, 0)}`);

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
