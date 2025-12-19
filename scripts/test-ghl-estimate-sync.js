#!/usr/bin/env node
/**
 * Test GHL Estimate Sync
 * Creates a test opportunity in GHL from a mock estimate
 */

import 'dotenv/config';
import { syncEstimateToGHL, syncCustomerToGHL } from '../src/integrations/ghl/sync-estimate-to-ghl.js';
import { getPool } from '../src/services/sync/sync-base.js';

async function testGHLSync() {
  console.log('🧪 Testing GHL Estimate Sync...\n');
  
  const client = await getPool().connect();
  
  try {
    // Check if we have any estimates
    const estimateResult = await client.query(`
      SELECT e.st_id, e.name, e.total, e.status,
             c.name as customer_name, c.st_id as customer_id,
             bu.name as business_unit, bu.ghl_pipeline_id
      FROM st_estimates e
      LEFT JOIN st_customers c ON e.customer_id = c.st_id
      LEFT JOIN st_jobs j ON e.job_id = j.st_id
      LEFT JOIN st_business_units bu ON j.business_unit_id = bu.st_id
      WHERE bu.ghl_pipeline_id IS NOT NULL
      LIMIT 5
    `);
    
    if (estimateResult.rows.length > 0) {
      console.log('📋 Found estimates to sync:');
      for (const est of estimateResult.rows) {
        console.log(`  - ${est.st_id}: ${est.name} ($${est.total}) - ${est.business_unit}`);
      }
      
      // Try to sync the first one
      const testEstimate = estimateResult.rows[0];
      console.log(`\n🔄 Syncing estimate ${testEstimate.st_id}...`);
      
      const result = await syncEstimateToGHL(Number(testEstimate.st_id));
      console.log('✅ Result:', result);
    } else {
      console.log('⚠️  No estimates found with mapped business units.');
      console.log('\n📊 Checking data status...');
      
      // Check what we have
      const stats = await client.query(`
        SELECT 
          (SELECT COUNT(*) FROM st_estimates) as estimates,
          (SELECT COUNT(*) FROM st_jobs) as jobs,
          (SELECT COUNT(*) FROM st_customers) as customers,
          (SELECT COUNT(*) FROM st_business_units WHERE ghl_pipeline_id IS NOT NULL) as mapped_bus
      `);
      
      console.log('  Estimates:', stats.rows[0].estimates);
      console.log('  Jobs:', stats.rows[0].jobs);
      console.log('  Customers:', stats.rows[0].customers);
      console.log('  Mapped Business Units:', stats.rows[0].mapped_bus);
      
      // Test creating a contact instead
      console.log('\n🧪 Testing customer → GHL contact sync...');
      
      const customerResult = await client.query(`
        SELECT st_id, name, email, phone 
        FROM st_customers 
        WHERE name IS NOT NULL AND name != ''
        LIMIT 1
      `);
      
      if (customerResult.rows.length > 0) {
        const testCustomer = customerResult.rows[0];
        console.log(`  Testing with customer: ${testCustomer.name} (${testCustomer.st_id})`);
        
        try {
          const contactId = await syncCustomerToGHL(Number(testCustomer.st_id));
          console.log('✅ Created GHL contact:', contactId);
        } catch (error) {
          console.log('❌ Error:', error.message);
        }
      }
    }
    
    // Show GHL sync stats
    console.log('\n📈 GHL Sync Stats:');
    const ghlStats = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM ghl_contacts) as contacts,
        (SELECT COUNT(*) FROM ghl_contacts WHERE st_customer_id IS NOT NULL) as matched_contacts,
        (SELECT COUNT(*) FROM ghl_opportunities) as opportunities,
        (SELECT COUNT(*) FROM ghl_opportunities WHERE st_job_id IS NOT NULL) as linked_opportunities
    `);
    
    console.log('  GHL Contacts:', ghlStats.rows[0].contacts);
    console.log('  Matched to ST:', ghlStats.rows[0].matched_contacts);
    console.log('  GHL Opportunities:', ghlStats.rows[0].opportunities);
    console.log('  Linked to ST Jobs:', ghlStats.rows[0].linked_opportunities);
    
  } finally {
    client.release();
    process.exit(0);
  }
}

testGHLSync().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
