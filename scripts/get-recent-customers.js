#!/usr/bin/env node

/**
 * Get Recent Customers Script
 * Retrieves all ServiceTitan customers created within the last 7 days
 *
 * Usage: node scripts/get-recent-customers.js [baseUrl] [days]
 *
 * Examples:
 *   node scripts/get-recent-customers.js
 *   node scripts/get-recent-customers.js http://localhost:3001 7
 *   node scripts/get-recent-customers.js http://localhost:3001 30
 */

const BASE_URL = process.argv[2] || 'http://localhost:3001';
const DAYS_BACK = parseInt(process.argv[3], 10) || 7;
const MAX_DISPLAY = 5; // Number of customers to display in detail

/**
 * Compute date range for the query
 * @param {number} daysBack - Number of days to look back
 * @returns {{ createdOnOrAfter: string, createdOnOrBefore: string }}
 */
function computeDateRange(daysBack) {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - daysBack);

  // Set start to beginning of day (midnight UTC)
  startDate.setUTCHours(0, 0, 0, 0);

  return {
    createdOnOrAfter: startDate.toISOString(),
    createdOnOrBefore: now.toISOString(),
  };
}

/**
 * Build URL with query parameters
 */
function buildUrl(base, path, params) {
  const url = new URL(path, base);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });
  return url.toString();
}

/**
 * Validate the response shape matches ST API structure
 */
function validateResponse(data) {
  const errors = [];

  if (typeof data !== 'object' || data === null) {
    errors.push('Response is not an object');
    return { valid: false, errors };
  }

  if (!Array.isArray(data.data)) {
    errors.push('Response missing "data" array');
  }

  if (data.page !== undefined && typeof data.page !== 'number') {
    errors.push('"page" should be a number');
  }

  if (data.pageSize !== undefined && typeof data.pageSize !== 'number') {
    errors.push('"pageSize" should be a number');
  }

  if (data.hasMore !== undefined && typeof data.hasMore !== 'boolean') {
    errors.push('"hasMore" should be a boolean');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate that a customer's createdOn date is within the date range
 */
function isWithinDateRange(createdOn, startDate, endDate) {
  const created = new Date(createdOn);
  return created >= new Date(startDate) && created <= new Date(endDate);
}

/**
 * Format customer for display
 */
function formatCustomer(customer) {
  return {
    id: customer.id,
    name: customer.name,
    type: customer.type,
    createdOn: customer.createdOn,
    address: customer.address
      ? `${customer.address.city}, ${customer.address.state}`
      : 'N/A',
  };
}

/**
 * Main function
 */
async function main() {
  const dateRange = computeDateRange(DAYS_BACK);

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║   Get Recent Customers - ServiceTitan API                      ║
╠════════════════════════════════════════════════════════════════╣
║   Target:     ${BASE_URL.padEnd(47)}║
║   Days Back:  ${DAYS_BACK.toString().padEnd(47)}║
║   From:       ${dateRange.createdOnOrAfter.padEnd(47)}║
║   To:         ${dateRange.createdOnOrBefore.padEnd(47)}║
╚════════════════════════════════════════════════════════════════╝
`);

  // Build the request URL
  const queryParams = {
    createdOnOrAfter: dateRange.createdOnOrAfter,
    createdOnOrBefore: dateRange.createdOnOrBefore,
    page: 1,
    pageSize: 50, // Fetch up to 50 for initial check
  };

  const url = buildUrl(BASE_URL, '/customers', queryParams);

  console.log('📡 Request URL:');
  console.log(`   ${url}\n`);

  try {
    const start = Date.now();
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const duration = Date.now() - start;
    const data = await response.json();

    console.log(`⏱️  Response Time: ${duration}ms`);
    console.log(`📊 HTTP Status: ${response.status}\n`);

    // Validate response shape
    const validation = validateResponse(data);
    if (!validation.valid) {
      console.log('❌ Response Validation Failed:');
      validation.errors.forEach((err) => console.log(`   - ${err}`));
      process.exit(1);
    }

    console.log('✅ Response Validation: Passed\n');

    // Display summary
    const customers = data.data || [];
    const totalCount = data.totalCount || customers.length;
    const hasMore = data.hasMore || false;

    console.log('═'.repeat(64));
    console.log('📈 RESULTS SUMMARY');
    console.log('═'.repeat(64));
    console.log(`   Total in response:  ${customers.length}`);
    console.log(`   Total count:        ${totalCount || 'N/A'}`);
    console.log(`   Has more pages:     ${hasMore}`);
    console.log(`   Page:               ${data.page || 1}`);
    console.log(`   Page size:          ${data.pageSize || queryParams.pageSize}`);
    console.log('');

    // Validate dates are within range
    let validDates = 0;
    let invalidDates = 0;

    customers.forEach((customer) => {
      if (customer.createdOn) {
        if (isWithinDateRange(customer.createdOn, dateRange.createdOnOrAfter, dateRange.createdOnOrBefore)) {
          validDates++;
        } else {
          invalidDates++;
        }
      }
    });

    console.log(`   Dates within range: ${validDates}`);
    console.log(`   Dates out of range: ${invalidDates}`);
    console.log('');

    // Display first few customers
    if (customers.length > 0) {
      console.log('═'.repeat(64));
      console.log(`📋 FIRST ${Math.min(MAX_DISPLAY, customers.length)} CUSTOMERS`);
      console.log('═'.repeat(64));

      customers.slice(0, MAX_DISPLAY).forEach((customer, index) => {
        const formatted = formatCustomer(customer);
        console.log(`\n[${index + 1}] ${formatted.name}`);
        console.log(`    ID:        ${formatted.id}`);
        console.log(`    Type:      ${formatted.type}`);
        console.log(`    Location:  ${formatted.address}`);
        console.log(`    Created:   ${formatted.createdOn}`);
      });

      console.log('');
    } else {
      console.log('ℹ️  No customers found in the specified date range.\n');
    }

    // Exit code based on results
    if (invalidDates > 0) {
      console.log('⚠️  Warning: Some customers have createdOn dates outside the requested range.');
      console.log('   This may be expected if ServiceTitan filters differently.\n');
    }

    console.log('═'.repeat(64));
    console.log('✅ Script completed successfully');
    console.log('═'.repeat(64));

    process.exit(0);
  } catch (error) {
    console.error('❌ Request Failed:', error.message);

    if (error.cause?.code === 'ECONNREFUSED') {
      console.error('\n💡 Tip: Make sure the server is running:');
      console.error('   npm start');
    }

    process.exit(1);
  }
}

// Run the script
main();
