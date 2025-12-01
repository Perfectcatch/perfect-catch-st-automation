/**
 * Customers Controller
 * Handles all customer-related ServiceTitan API operations
 */

import { stRequest } from '../services/stClient.js';
import { stEndpoints } from '../lib/stEndpoints.js';

/**
 * List all customers with query parameter support
 * GET /customers
 */
export async function listCustomers(req, res, next) {
  try {
    const result = await stRequest(stEndpoints.customers.list(), {
      method: 'GET',
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

/**
 * Get a single customer by ID
 * GET /customers/:id
 */
export async function getCustomer(req, res, next) {
  try {
    const { id } = req.params;

    const result = await stRequest(stEndpoints.customers.get(id), {
      method: 'GET',
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new customer
 * POST /customers
 */
export async function createCustomer(req, res, next) {
  try {
    const result = await stRequest(stEndpoints.customers.create(), {
      method: 'POST',
      body: req.body,
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

/**
 * Update a customer
 * PUT /customers/:id
 */
export async function updateCustomer(req, res, next) {
  try {
    const { id } = req.params;

    const result = await stRequest(stEndpoints.customers.update(id), {
      method: 'PUT',
      body: req.body,
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

/**
 * List all contacts (bulk)
 * GET /customers/contacts
 */
export async function listContacts(req, res, next) {
  try {
    const result = await stRequest(stEndpoints.customers.contacts.list(), {
      method: 'GET',
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

/**
 * List contacts for a specific customer
 * GET /customers/:id/contacts
 */
export async function getCustomerContacts(req, res, next) {
  try {
    const { id } = req.params;

    const result = await stRequest(stEndpoints.customers.contacts.byCustomer(id), {
      method: 'GET',
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

export default {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  listContacts,
  getCustomerContacts,
};
