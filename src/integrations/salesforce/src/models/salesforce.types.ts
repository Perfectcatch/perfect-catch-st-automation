/**
 * Type Definitions for Salesforce Integration
 * 
 * Maps ServiceTitan customer schema to Salesforce Contact/Account fields
 */

// ============================================================
// Salesforce Configuration
// ============================================================

export interface SalesforceConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  loginUrl: string;
  tenantId: string;
  apiVersion?: string;
}

export interface SalesforceTokens {
  accessToken: string;
  refreshToken: string;
  instanceUrl: string;
  tokenType: string;
  issuedAt: Date;
  expiresIn: number;
}

export interface SalesforceError {
  message: string;
  errorCode: string;
  fields?: string[];
  statusCode?: number;
}

// ============================================================
// ServiceTitan Customer (Your Database Schema)
// ============================================================

export interface ServiceTitanCustomer {
  // Identity
  id?: string;                    // uuid - Internal primary key
  st_id: number;                  // bigint - ServiceTitan customer ID
  tenant_id?: number;             // bigint - ST tenant ID
  
  // Basic Info
  name?: string;                  // varchar - Full customer name
  first_name?: string;            // varchar - First name (parsed)
  last_name?: string;             // varchar - Last name (parsed)
  type?: string;                  // varchar - Customer type (Residential/Commercial)
  
  // Contact
  email?: string;                 // varchar - Primary email
  phone?: string;                 // varchar - Primary phone
  phone_numbers?: any[];          // jsonb - All phone numbers array
  email_addresses?: any[];        // jsonb - All email addresses array
  
  // Address
  address_line1?: string;         // varchar - Street address
  address_line2?: string;         // varchar - Unit/Apt
  city?: string;                  // varchar - City
  state?: string;                 // varchar - State
  zip?: string;                   // varchar - ZIP code
  postal_code?: string;           // varchar - Alternate postal code
  country?: string;               // varchar - Country
  addresses?: any[];              // jsonb - All addresses array
  location_id?: number;           // bigint - Primary location ID
  
  // Account Status
  balance?: number;               // numeric - Account balance
  active?: boolean;               // boolean - Is active
  do_not_service?: boolean;       // boolean - DnS flag
  do_not_mail?: boolean;          // boolean - No marketing flag
  
  // Tags & Custom
  tag_type_ids?: number[];        // array - Tag type IDs
  tags?: any;                     // jsonb - Tag details
  custom_fields?: any;            // jsonb - Custom field values
  
  // Analytics
  total_jobs?: number;            // integer - Total job count
  completed_jobs?: number;        // integer - Completed job count
  lifetime_value?: number;        // numeric - Total revenue
  first_job_date?: string | Date; // timestamp - First job date
  last_job_date?: string | Date;  // timestamp - Most recent job
  
  // Sync Metadata
  st_created_on?: string | Date;  // timestamp - Created in ST
  st_modified_on?: string | Date; // timestamp - Last modified in ST
  local_synced_at?: string | Date;// timestamp - Last sync time
  local_created_at?: string | Date;// timestamp - Created locally
  last_synced_at?: string | Date; // timestamp - Last sync
  aggregates_updated_at?: string | Date; // timestamp - Analytics refresh
  full_data?: any;                // jsonb - Complete ST API response
}

// ============================================================
// Salesforce Contact (Custom Fields You Created)
// ============================================================

export interface SalesforceContact {
  Id?: string;
  
  // Standard Fields
  FirstName?: string;
  LastName: string;
  Email?: string;
  Phone?: string;
  MobilePhone?: string;
  
  // Standard Mailing Address
  MailingStreet?: string;
  MailingCity?: string;
  MailingState?: string;
  MailingPostalCode?: string;
  MailingCountry?: string;
  
  // Relationships
  AccountId?: string;
  OwnerId?: string;
  
  // Standard Email Opt-Out (maps to do_not_mail)
  HasOptedOutOfEmail?: boolean;
  
  // Metadata
  CreatedDate?: string;
  LastModifiedDate?: string;
  
  // ==========================================
  // Custom Fields - Identity
  // ==========================================
  
  /** External ID - Format: st_[st_id] */
  ServiceTitan_Customer_Id__c?: string;
  
  /** ServiceTitan tenant ID */
  ServiceTitan_Tenant_Id__c?: number;
  
  // ==========================================
  // Custom Fields - Status
  // ==========================================
  
  /** Is customer active */
  Active__c?: boolean;
  
  /** Do Not Service flag */
  Do_Not_Service__c?: boolean;
  
  // ==========================================
  // Custom Fields - Analytics
  // ==========================================
  
  /** Total job count */
  Total_Jobs__c?: number;
  
  /** Completed job count */
  Completed_Jobs__c?: number;
  
  /** Date of first service */
  First_Service_Date__c?: string;
  
  /** Date of most recent service */
  Last_Service_Date__c?: string;
  
  // ==========================================
  // Custom Fields - Sync Metadata
  // ==========================================
  
  /** Last modified timestamp in ServiceTitan */
  ServiceTitan_Last_Modified__c?: string;
  
  /** Last sync timestamp */
  Last_Sync_DateTime__c?: string;
}

// ============================================================
// Salesforce Account (Custom Fields You Created)
// ============================================================

export interface SalesforceAccount {
  Id?: string;
  
  // Standard Fields
  Name: string;
  Type?: string;  // Picklist: Residential, Commercial
  Phone?: string;
  Website?: string;
  
  // Standard Billing Address
  BillingStreet?: string;
  BillingCity?: string;
  BillingState?: string;
  BillingPostalCode?: string;
  BillingCountry?: string;
  
  // Relationships
  OwnerId?: string;
  ParentId?: string;
  
  // Metadata
  CreatedDate?: string;
  LastModifiedDate?: string;
  
  // ==========================================
  // Custom Fields
  // ==========================================
  
  /** External ID - Format: st_[st_id] */
  ServiceTitan_Account_Id__c?: string;
  
  /** Account balance (currency) */
  Account_Balance__c?: number;
  
  /** Customer lifetime value (currency) */
  Lifetime_Value__c?: number;
  
  /** Customer segment: VIP, High Value, Standard, At Risk, Churning */
  Customer_Segment__c?: string;
}

// ============================================================
// Sync Types
// ============================================================

export type SyncDirection = 'inbound' | 'outbound';

export interface CustomerSyncResult {
  success: boolean;
  stId?: number;
  salesforceContactId?: string;
  salesforceAccountId?: string;
  created?: boolean;
  direction: SyncDirection;
  error?: string;
  duration?: number;
}

export interface SyncStatus {
  entityType: 'customer' | 'estimate' | 'job';
  stId: number;
  lastOutboundSync?: string;
  lastInboundSync?: string;
  salesforceId?: string;
  syncError?: string;
  retryCount?: number;
}
