/**
 * ServiceTitan API Tool
 * Call any ServiceTitan API endpoint with proper authentication
 */

// Token cache
let tokenCache = {
  accessToken: null,
  expiresAt: null,
};

/**
 * Get ServiceTitan access token
 */
async function getAccessToken() {
  // Check if we have a valid cached token
  if (tokenCache.accessToken && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt - 60000) {
    return tokenCache.accessToken;
  }

  const clientId = process.env.SERVICE_TITAN_CLIENT_ID;
  const clientSecret = process.env.SERVICE_TITAN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('ServiceTitan credentials not configured. Set SERVICE_TITAN_CLIENT_ID and SERVICE_TITAN_CLIENT_SECRET.');
  }

  const response = await fetch('https://auth.servicetitan.io/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  tokenCache.accessToken = data.access_token;
  tokenCache.expiresAt = Date.now() + (data.expires_in * 1000);

  return tokenCache.accessToken;
}

/**
 * Make authenticated request to ServiceTitan API
 */
export async function callServiceTitanAPI(endpoint, options = {}) {
  const tenantId = process.env.SERVICE_TITAN_TENANT_ID;
  const appKey = process.env.SERVICE_TITAN_APP_KEY;

  if (!tenantId) {
    throw new Error('SERVICE_TITAN_TENANT_ID not configured');
  }

  const accessToken = await getAccessToken();
  
  // Build URL
  const baseUrl = 'https://api.servicetitan.io';
  let url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;
  
  // Replace {tenant} placeholder
  url = url.replace('{tenant}', tenantId);

  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'ST-App-Key': appKey,
    ...options.headers,
  };

  const fetchOptions = {
    method: options.method || 'GET',
    headers,
  };

  if (options.body && ['POST', 'PUT', 'PATCH'].includes(fetchOptions.method)) {
    fetchOptions.body = typeof options.body === 'string' 
      ? options.body 
      : JSON.stringify(options.body);
  }

  const response = await fetch(url, fetchOptions);
  
  const responseData = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      success: false,
      status: response.status,
      statusText: response.statusText,
      error: responseData?.message || responseData?.error || response.statusText,
      data: responseData,
    };
  }

  return {
    success: true,
    status: response.status,
    data: responseData,
  };
}

/**
 * Common API endpoints helper
 */
export const endpoints = {
  // Customers
  getCustomers: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return `/crm/v2/tenant/{tenant}/customers${query ? '?' + query : ''}`;
  },
  getCustomer: (id) => `/crm/v2/tenant/{tenant}/customers/${id}`,
  
  // Jobs
  getJobs: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return `/jpm/v2/tenant/{tenant}/jobs${query ? '?' + query : ''}`;
  },
  getJob: (id) => `/jpm/v2/tenant/{tenant}/jobs/${id}`,
  
  // Estimates
  getEstimates: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return `/jpm/v2/tenant/{tenant}/estimates${query ? '?' + query : ''}`;
  },
  getEstimate: (id) => `/jpm/v2/tenant/{tenant}/estimates/${id}`,
  
  // Appointments
  getAppointments: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return `/dispatch/v2/tenant/{tenant}/appointments${query ? '?' + query : ''}`;
  },
  
  // Invoices
  getInvoices: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return `/accounting/v2/tenant/{tenant}/invoices${query ? '?' + query : ''}`;
  },
  
  // Technicians
  getTechnicians: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return `/dispatch/v2/tenant/{tenant}/technicians${query ? '?' + query : ''}`;
  },
  
  // Pricebook
  getServices: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return `/pricebook/v2/tenant/{tenant}/services${query ? '?' + query : ''}`;
  },
  getMaterials: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return `/pricebook/v2/tenant/{tenant}/materials${query ? '?' + query : ''}`;
  },
};

// Tool definition for MCP
export const toolDefinition = {
  name: 'call_st_api',
  description: 'Call any ServiceTitan API endpoint. Supports GET, POST, PUT, PATCH methods. Use for fetching customers, jobs, estimates, appointments, invoices, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      endpoint: {
        type: 'string',
        description: 'API endpoint path (e.g., "/crm/v2/tenant/{tenant}/customers" or use shorthand like "customers", "jobs", "estimates")',
      },
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'PATCH'],
        description: 'HTTP method (default: GET)',
      },
      params: {
        type: 'object',
        description: 'Query parameters for GET requests or body for POST/PUT/PATCH',
      },
    },
    required: ['endpoint'],
  },
};

/**
 * Handle tool call with shorthand endpoints
 */
export async function handleToolCall(args) {
  let endpoint = args.endpoint;
  const method = args.method || 'GET';
  const params = args.params || {};

  // Handle shorthand endpoints
  const shorthandMap = {
    'customers': endpoints.getCustomers,
    'jobs': endpoints.getJobs,
    'estimates': endpoints.getEstimates,
    'appointments': endpoints.getAppointments,
    'invoices': endpoints.getInvoices,
    'technicians': endpoints.getTechnicians,
    'services': endpoints.getServices,
    'materials': endpoints.getMaterials,
  };

  if (shorthandMap[endpoint.toLowerCase()]) {
    endpoint = shorthandMap[endpoint.toLowerCase()](method === 'GET' ? params : {});
  }

  const options = { method };
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    options.body = params;
  }

  return callServiceTitanAPI(endpoint, options);
}

export default {
  callServiceTitanAPI,
  handleToolCall,
  endpoints,
  toolDefinition,
};
