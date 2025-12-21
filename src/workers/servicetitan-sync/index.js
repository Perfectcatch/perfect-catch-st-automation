/**
 * ServiceTitan Automated Sync Workers
 *
 * This module contains automated sync workers for syncing ServiceTitan data
 * to the local PostgreSQL database.
 *
 * Available syncs:
 * - Customer Contacts: Syncs phone/email from ST contacts endpoint
 */

export {
  syncCustomerContacts,
  fullSyncContacts,
  incrementalSyncContacts,
  getContactsStats
} from './sync-customer-contacts.js';

// Re-export as default for convenience
import * as customerContacts from './sync-customer-contacts.js';

export default {
  customerContacts
};
