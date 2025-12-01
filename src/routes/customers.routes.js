/**
 * Customers Routes
 * ServiceTitan CRM Customer endpoints
 */

import { Router } from 'express';
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  listContacts,
  getCustomerContacts,
} from '../controllers/customers.controller.js';

const router = Router();

// List all contacts (bulk) - GET /customers/contacts
// Note: This must be before /:id to avoid conflict
router.get('/contacts', listContacts);

// List all customers - GET /customers
router.get('/', listCustomers);

// Get single customer - GET /customers/:id
router.get('/:id', getCustomer);

// Create customer - POST /customers
router.post('/', createCustomer);

// Update customer - PUT /customers/:id
router.put('/:id', updateCustomer);

// Get customer contacts - GET /customers/:id/contacts
router.get('/:id/contacts', getCustomerContacts);

export default router;
