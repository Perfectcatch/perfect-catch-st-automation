# ServiceTitan Raw Table Architecture

## Overview

This document defines the mapping between ServiceTitan API endpoints and raw database tables.
Each GET endpoint maps to exactly ONE raw table that mirrors the API response structure.

---

## CRM Module (`/crm/v2`)

### 1. `raw_st_customers`
**Endpoint:** `GET /crm/v2/tenant/{tenant}/customers`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | Primary identifier |
| active | active | BOOLEAN | |
| name | name | VARCHAR(500) | |
| type | type | VARCHAR(50) | Residential/Commercial |
| address | address | JSONB | {street, unit, city, state, zip, country, latitude, longitude} |
| customFields | custom_fields | JSONB | |
| balance | balance | DECIMAL(18,4) | |
| taxExempt | tax_exempt | BOOLEAN | |
| tagTypeIds | tag_type_ids | BIGINT[] | |
| doNotMail | do_not_mail | BOOLEAN | |
| doNotService | do_not_service | BOOLEAN | |
| nationalAccount | national_account | BOOLEAN | |
| createdOn | st_created_on | TIMESTAMPTZ | |
| createdById | created_by_id | BIGINT | |
| modifiedOn | st_modified_on | TIMESTAMPTZ | |
| mergedToId | merged_to_id | BIGINT | |
| paymentTermId | payment_term_id | BIGINT | |
| creditLimit | credit_limit | DECIMAL | |
| creditLimitBalance | credit_limit_balance | DECIMAL | |
| externalData | external_data | JSONB | |
| - | fetched_at | TIMESTAMPTZ | When we fetched this |
| - | full_data | JSONB | Complete API response |

---

### 2. `raw_st_customer_contacts`
**Endpoint:** `GET /crm/v2/tenant/{tenant}/customers/contacts`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | Contact ID |
| customerId | customer_id | BIGINT | FK to customer |
| type | type | VARCHAR(50) | Email, Phone, MobilePhone |
| value | value | TEXT | The actual email/phone |
| memo | memo | TEXT | |
| phoneSettings | phone_settings | JSONB | {phoneNumber, doNotText} |
| preferences | preferences | JSONB | {jobRemindersEnabled, etc} |
| createdOn | st_created_on | TIMESTAMPTZ | |
| modifiedOn | st_modified_on | TIMESTAMPTZ | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

### 3. `raw_st_locations`
**Endpoint:** `GET /crm/v2/tenant/{tenant}/locations`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | |
| customerId | customer_id | BIGINT | FK to customer |
| active | active | BOOLEAN | |
| name | name | VARCHAR(500) | |
| address | address | JSONB | {street, unit, city, state, zip, country, lat, lng} |
| customFields | custom_fields | JSONB | |
| createdOn | st_created_on | TIMESTAMPTZ | |
| createdById | created_by_id | BIGINT | |
| modifiedOn | st_modified_on | TIMESTAMPTZ | |
| mergedToId | merged_to_id | BIGINT | |
| zoneId | zone_id | BIGINT | |
| taxZoneId | tax_zone_id | BIGINT | |
| taxExempt | tax_exempt | BOOLEAN | |
| tagTypeIds | tag_type_ids | BIGINT[] | |
| externalData | external_data | JSONB | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

### 4. `raw_st_location_contacts`
**Endpoint:** `GET /crm/v2/tenant/{tenant}/locations/contacts`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | Contact ID |
| locationId | location_id | BIGINT | FK to location |
| type | type | VARCHAR(50) | Email, Phone, MobilePhone |
| value | value | TEXT | |
| memo | memo | TEXT | |
| phoneSettings | phone_settings | JSONB | |
| preferences | preferences | JSONB | |
| createdOn | st_created_on | TIMESTAMPTZ | |
| modifiedOn | st_modified_on | TIMESTAMPTZ | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

## JPM Module (`/jpm/v2`)

### 5. `raw_st_jobs`
**Endpoint:** `GET /jpm/v2/tenant/{tenant}/jobs`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | |
| jobNumber | job_number | VARCHAR(50) | |
| projectId | project_id | BIGINT | |
| customerId | customer_id | BIGINT | |
| locationId | location_id | BIGINT | |
| jobStatus | job_status | VARCHAR(50) | |
| completedOn | completed_on | TIMESTAMPTZ | |
| businessUnitId | business_unit_id | BIGINT | |
| jobTypeId | job_type_id | BIGINT | |
| priority | priority | VARCHAR(20) | Normal, High, etc |
| campaignId | campaign_id | BIGINT | |
| appointmentCount | appointment_count | INT | |
| firstAppointmentId | first_appointment_id | BIGINT | |
| lastAppointmentId | last_appointment_id | BIGINT | |
| recallForId | recall_for_id | BIGINT | |
| warrantyId | warranty_id | BIGINT | |
| jobGeneratedLeadSource | job_generated_lead_source | JSONB | |
| noCharge | no_charge | BOOLEAN | |
| notificationsEnabled | notifications_enabled | BOOLEAN | |
| createdOn | st_created_on | TIMESTAMPTZ | |
| createdById | created_by_id | BIGINT | |
| modifiedOn | st_modified_on | TIMESTAMPTZ | |
| tagTypeIds | tag_type_ids | BIGINT[] | |
| leadCallId | lead_call_id | BIGINT | |
| bookingId | booking_id | BIGINT | |
| soldById | sold_by_id | BIGINT | |
| customerPo | customer_po | VARCHAR(100) | |
| invoiceId | invoice_id | BIGINT | |
| membershipId | membership_id | BIGINT | |
| total | total | DECIMAL(18,4) | |
| createdFromEstimateId | created_from_estimate_id | BIGINT | |
| estimateIds | estimate_ids | BIGINT[] | |
| summary | summary | TEXT | |
| customFields | custom_fields | JSONB | |
| externalData | external_data | JSONB | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

### 6. `raw_st_appointments`
**Endpoint:** `GET /jpm/v2/tenant/{tenant}/appointments`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | |
| jobId | job_id | BIGINT | |
| appointmentNumber | appointment_number | VARCHAR(50) | |
| start | start_time | TIMESTAMPTZ | |
| end | end_time | TIMESTAMPTZ | |
| arrivalWindowStart | arrival_window_start | TIMESTAMPTZ | |
| arrivalWindowEnd | arrival_window_end | TIMESTAMPTZ | |
| status | status | VARCHAR(50) | |
| specialInstructions | special_instructions | TEXT | |
| createdOn | st_created_on | TIMESTAMPTZ | |
| modifiedOn | st_modified_on | TIMESTAMPTZ | |
| customerId | customer_id | BIGINT | |
| unused | unused | BOOLEAN | |
| createdById | created_by_id | BIGINT | |
| isConfirmed | is_confirmed | BOOLEAN | |
| active | active | BOOLEAN | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

### 7. `raw_st_job_types`
**Endpoint:** `GET /jpm/v2/tenant/{tenant}/job-types`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | |
| name | name | VARCHAR(255) | |
| businessUnitIds | business_unit_ids | BIGINT[] | |
| skills | skills | JSONB | |
| tagTypeIds | tag_type_ids | BIGINT[] | |
| priority | priority | VARCHAR(20) | |
| duration | duration | INT | |
| soldThreshold | sold_threshold | DECIMAL | |
| class | class | VARCHAR(50) | |
| summary | summary | TEXT | |
| noCharge | no_charge | BOOLEAN | |
| active | active | BOOLEAN | |
| modifiedOn | st_modified_on | TIMESTAMPTZ | |
| createdOn | st_created_on | TIMESTAMPTZ | |
| externalData | external_data | JSONB | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

## Accounting Module (`/accounting/v2`)

### 8. `raw_st_invoices`
**Endpoint:** `GET /accounting/v2/tenant/{tenant}/invoices`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | |
| referenceNumber | reference_number | VARCHAR(100) | |
| invoiceDate | invoice_date | DATE | |
| dueDate | due_date | DATE | |
| subTotal | subtotal | DECIMAL(18,4) | |
| salesTax | sales_tax | DECIMAL(18,4) | |
| total | total | DECIMAL(18,4) | |
| balance | balance | DECIMAL(18,4) | |
| invoiceType | invoice_type | VARCHAR(50) | |
| customer | customer | JSONB | {id, name} |
| customerAddress | customer_address | JSONB | |
| location | location | JSONB | {id, name} |
| locationAddress | location_address | JSONB | |
| businessUnit | business_unit | JSONB | {id, name} |
| job | job | JSONB | {id, number, type} |
| items | items | JSONB | |
| customFields | custom_fields | JSONB | |
| active | active | BOOLEAN | |
| syncStatus | sync_status | VARCHAR(50) | |
| paidOn | paid_on | TIMESTAMPTZ | |
| createdOn | st_created_on | TIMESTAMPTZ | |
| modifiedOn | st_modified_on | TIMESTAMPTZ | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

### 9. `raw_st_payments`
**Endpoint:** `GET /accounting/v2/tenant/{tenant}/payments`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | |
| active | active | BOOLEAN | |
| appliedTo | applied_to | JSONB | Array of applications |
| authCode | auth_code | VARCHAR(50) | |
| batch | batch | JSONB | {id, number, name} |
| businessUnit | business_unit | JSONB | {id, name} |
| checkNumber | check_number | VARCHAR(50) | |
| createdBy | created_by | VARCHAR(100) | |
| createdOn | st_created_on | TIMESTAMPTZ | |
| customer | customer | JSONB | {id, name} |
| customFields | custom_fields | JSONB | |
| date | payment_date | TIMESTAMPTZ | |
| deposit | deposit | JSONB | |
| generalLedgerAccount | gl_account | JSONB | |
| memo | memo | TEXT | |
| modifiedOn | st_modified_on | TIMESTAMPTZ | |
| referenceNumber | reference_number | VARCHAR(100) | |
| total | total | DECIMAL(18,4) | |
| type | payment_type | VARCHAR(50) | |
| typeId | type_id | VARCHAR(50) | |
| unappliedAmount | unapplied_amount | DECIMAL(18,4) | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

## Settings Module (`/settings/v2`)

### 10. `raw_st_technicians`
**Endpoint:** `GET /settings/v2/tenant/{tenant}/technicians`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | |
| userId | user_id | BIGINT | |
| name | name | VARCHAR(255) | |
| roleIds | role_ids | BIGINT[] | |
| businessUnitId | business_unit_id | BIGINT | |
| mainZoneId | main_zone_id | BIGINT | |
| zoneIds | zone_ids | BIGINT[] | |
| createdOn | st_created_on | TIMESTAMPTZ | |
| modifiedOn | st_modified_on | TIMESTAMPTZ | |
| email | email | VARCHAR(255) | |
| phoneNumber | phone | VARCHAR(50) | |
| loginName | login_name | VARCHAR(100) | |
| home | home | JSONB | Address object |
| dailyGoal | daily_goal | DECIMAL | |
| isManagedTech | is_managed_tech | BOOLEAN | |
| customFields | custom_fields | JSONB | |
| active | active | BOOLEAN | |
| burdenRate | burden_rate | DECIMAL | |
| team | team | VARCHAR(100) | |
| permissions | permissions | JSONB | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

### 11. `raw_st_employees`
**Endpoint:** `GET /settings/v2/tenant/{tenant}/employees`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | |
| userId | user_id | BIGINT | |
| name | name | VARCHAR(255) | |
| role | role | VARCHAR(100) | |
| roleIds | role_ids | BIGINT[] | |
| businessUnitId | business_unit_id | BIGINT | |
| createdOn | st_created_on | TIMESTAMPTZ | |
| modifiedOn | st_modified_on | TIMESTAMPTZ | |
| email | email | VARCHAR(255) | |
| phoneNumber | phone | VARCHAR(50) | |
| loginName | login_name | VARCHAR(100) | |
| active | active | BOOLEAN | |
| permissions | permissions | JSONB | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

### 12. `raw_st_business_units`
**Endpoint:** `GET /settings/v2/tenant/{tenant}/business-units`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | |
| active | active | BOOLEAN | |
| name | name | VARCHAR(255) | |
| officialName | official_name | VARCHAR(255) | |
| email | email | VARCHAR(255) | |
| currency | currency | VARCHAR(10) | |
| phoneNumber | phone | VARCHAR(50) | |
| invoiceHeader | invoice_header | TEXT | |
| invoiceMessage | invoice_message | TEXT | |
| defaultTaxRate | default_tax_rate | DECIMAL | |
| address | address | JSONB | |
| trade | trade | VARCHAR(100) | |
| division | division | VARCHAR(100) | |
| tagTypeIds | tag_type_ids | BIGINT[] | |
| createdOn | st_created_on | TIMESTAMPTZ | |
| modifiedOn | st_modified_on | TIMESTAMPTZ | |
| externalData | external_data | JSONB | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

### 13. `raw_st_tag_types`
**Endpoint:** `GET /settings/v2/tenant/{tenant}/tag-types`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | |
| name | name | VARCHAR(255) | |
| active | active | BOOLEAN | |
| code | code | VARCHAR(50) | |
| color | color | VARCHAR(20) | |
| entityType | entity_type | VARCHAR(50) | |
| modifiedOn | st_modified_on | TIMESTAMPTZ | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

## Dispatch Module (`/dispatch/v2`)

### 14. `raw_st_appointment_assignments`
**Endpoint:** `GET /dispatch/v2/tenant/{tenant}/appointment-assignments`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| appointmentId | appointment_id | BIGINT | |
| technicianId | technician_id | BIGINT | |
| assignedOn | assigned_on | TIMESTAMPTZ | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

### 15. `raw_st_teams`
**Endpoint:** `GET /dispatch/v2/tenant/{tenant}/teams`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | |
| name | name | VARCHAR(255) | |
| active | active | BOOLEAN | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

### 16. `raw_st_zones`
**Endpoint:** `GET /dispatch/v2/tenant/{tenant}/zones`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | |
| name | name | VARCHAR(255) | |
| active | active | BOOLEAN | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

## Marketing Module (`/marketing/v2`)

### 17. `raw_st_campaigns`
**Endpoint:** `GET /marketing/v2/tenant/{tenant}/campaigns`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | |
| name | name | VARCHAR(255) | |
| active | active | BOOLEAN | |
| categoryId | category_id | BIGINT | |
| code | code | VARCHAR(50) | |
| createdOn | st_created_on | TIMESTAMPTZ | |
| modifiedOn | st_modified_on | TIMESTAMPTZ | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

## Equipment Systems Module (`/equipmentsystems/v2`)

### 18. `raw_st_installed_equipment`
**Endpoint:** `GET /equipmentsystems/v2/tenant/{tenant}/installed-equipment`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | |
| active | active | BOOLEAN | |
| equipmentId | equipment_id | BIGINT | FK to pricebook equipment |
| locationId | location_id | BIGINT | |
| customerId | customer_id | BIGINT | |
| invoiceItemId | invoice_item_id | BIGINT | |
| name | name | VARCHAR(255) | |
| type | type | VARCHAR(100) | |
| installedOn | installed_on | TIMESTAMPTZ | |
| createdOn | st_created_on | TIMESTAMPTZ | |
| modifiedOn | st_modified_on | TIMESTAMPTZ | |
| serialNumber | serial_number | VARCHAR(100) | |
| manufacturer | manufacturer | VARCHAR(255) | |
| model | model | VARCHAR(255) | |
| cost | cost | DECIMAL(18,4) | |
| manufacturerWarrantyEnd | manufacturer_warranty_end | DATE | |
| serviceProviderWarrantyEnd | service_warranty_end | DATE | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

## Sales Module (`/sales/v2`)

### 19. `raw_st_estimates`
**Endpoint:** `GET /sales/v2/tenant/{tenant}/estimates`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | |
| jobId | job_id | BIGINT | |
| projectId | project_id | BIGINT | |
| locationId | location_id | BIGINT | |
| customerId | customer_id | BIGINT | |
| name | name | VARCHAR(255) | |
| jobNumber | job_number | VARCHAR(50) | |
| status | status | VARCHAR(50) | |
| reviewStatus | review_status | VARCHAR(50) | |
| summary | summary | TEXT | |
| createdOn | st_created_on | TIMESTAMPTZ | |
| modifiedOn | st_modified_on | TIMESTAMPTZ | |
| soldOn | sold_on | TIMESTAMPTZ | |
| soldBy | sold_by | BIGINT | |
| active | active | BOOLEAN | |
| items | items | JSONB | Array of line items |
| subtotal | subtotal | DECIMAL(18,4) | |
| tax | tax | DECIMAL(18,4) | |
| businessUnitId | business_unit_id | BIGINT | |
| externalLinks | external_links | JSONB | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

## Pricebook Module (`/pricebook/v2`)

### 20. `raw_st_pricebook_materials`
**Endpoint:** `GET /pricebook/v2/tenant/{tenant}/materials`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | |
| code | code | VARCHAR(100) | |
| displayName | display_name | VARCHAR(500) | |
| description | description | TEXT | |
| cost | cost | DECIMAL(18,4) | |
| price | price | DECIMAL(18,4) | |
| memberPrice | member_price | DECIMAL(18,4) | |
| addOnPrice | add_on_price | DECIMAL(18,4) | |
| active | active | BOOLEAN | |
| taxable | taxable | BOOLEAN | |
| hours | hours | DECIMAL | |
| unitOfMeasure | unit_of_measure | VARCHAR(50) | |
| isInventory | is_inventory | BOOLEAN | |
| account | account | VARCHAR(100) | |
| primaryVendor | primary_vendor | JSONB | |
| otherVendors | other_vendors | JSONB | |
| categories | categories | JSONB | |
| assets | assets | JSONB | |
| modifiedOn | st_modified_on | TIMESTAMPTZ | |
| createdOn | st_created_on | TIMESTAMPTZ | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

### 21. `raw_st_pricebook_services`
**Endpoint:** `GET /pricebook/v2/tenant/{tenant}/services`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | |
| code | code | VARCHAR(100) | |
| displayName | display_name | VARCHAR(500) | |
| description | description | TEXT | |
| price | price | DECIMAL(18,4) | |
| memberPrice | member_price | DECIMAL(18,4) | |
| addOnPrice | add_on_price | DECIMAL(18,4) | |
| active | active | BOOLEAN | |
| taxable | taxable | BOOLEAN | |
| hours | hours | DECIMAL | |
| isLabor | is_labor | BOOLEAN | |
| account | account | VARCHAR(100) | |
| warranty | warranty | JSONB | |
| categories | categories | JSONB | |
| assets | assets | JSONB | |
| serviceMaterials | service_materials | JSONB | |
| serviceEquipment | service_equipment | JSONB | |
| recommendations | recommendations | JSONB | |
| upgrades | upgrades | JSONB | |
| modifiedOn | st_modified_on | TIMESTAMPTZ | |
| createdOn | st_created_on | TIMESTAMPTZ | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

### 22. `raw_st_pricebook_equipment`
**Endpoint:** `GET /pricebook/v2/tenant/{tenant}/equipment`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | |
| code | code | VARCHAR(100) | |
| displayName | display_name | VARCHAR(500) | |
| description | description | TEXT | |
| price | price | DECIMAL(18,4) | |
| memberPrice | member_price | DECIMAL(18,4) | |
| addOnPrice | add_on_price | DECIMAL(18,4) | |
| cost | cost | DECIMAL(18,4) | |
| active | active | BOOLEAN | |
| taxable | taxable | BOOLEAN | |
| manufacturer | manufacturer | VARCHAR(255) | |
| model | model | VARCHAR(255) | |
| manufacturerWarranty | manufacturer_warranty | JSONB | |
| serviceProviderWarranty | service_warranty | JSONB | |
| categories | categories | JSONB | |
| assets | assets | JSONB | |
| primaryVendor | primary_vendor | JSONB | |
| otherVendors | other_vendors | JSONB | |
| equipmentMaterials | equipment_materials | JSONB | |
| recommendations | recommendations | JSONB | |
| modifiedOn | st_modified_on | TIMESTAMPTZ | |
| createdOn | st_created_on | TIMESTAMPTZ | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

### 23. `raw_st_pricebook_categories`
**Endpoint:** `GET /pricebook/v2/tenant/{tenant}/categories`

| API Field | DB Column | Type | Notes |
|-----------|-----------|------|-------|
| id | st_id | BIGINT | |
| name | name | VARCHAR(255) | |
| active | active | BOOLEAN | |
| description | description | TEXT | |
| image | image | TEXT | |
| parentId | parent_id | BIGINT | |
| position | position | INT | |
| categoryType | category_type | VARCHAR(50) | Services/Materials/Equipment |
| subcategories | subcategories | JSONB | Nested categories |
| businessUnitIds | business_unit_ids | BIGINT[] | |
| - | fetched_at | TIMESTAMPTZ | |
| - | full_data | JSONB | |

---

## Summary: API Endpoint to Raw Table Mapping

| Module | Endpoint | Raw Table | Priority |
|--------|----------|-----------|----------|
| CRM | `/customers` | `raw_st_customers` | HIGH |
| CRM | `/customers/contacts` | `raw_st_customer_contacts` | HIGH |
| CRM | `/locations` | `raw_st_locations` | HIGH |
| CRM | `/locations/contacts` | `raw_st_location_contacts` | MEDIUM |
| JPM | `/jobs` | `raw_st_jobs` | HIGH |
| JPM | `/appointments` | `raw_st_appointments` | HIGH |
| JPM | `/job-types` | `raw_st_job_types` | LOW |
| Accounting | `/invoices` | `raw_st_invoices` | HIGH |
| Accounting | `/payments` | `raw_st_payments` | MEDIUM |
| Settings | `/technicians` | `raw_st_technicians` | HIGH |
| Settings | `/employees` | `raw_st_employees` | LOW |
| Settings | `/business-units` | `raw_st_business_units` | LOW |
| Settings | `/tag-types` | `raw_st_tag_types` | LOW |
| Dispatch | `/appointment-assignments` | `raw_st_appointment_assignments` | MEDIUM |
| Dispatch | `/teams` | `raw_st_teams` | LOW |
| Dispatch | `/zones` | `raw_st_zones` | LOW |
| Marketing | `/campaigns` | `raw_st_campaigns` | LOW |
| Equipment | `/installed-equipment` | `raw_st_installed_equipment` | MEDIUM |
| Sales | `/estimates` | `raw_st_estimates` | HIGH |
| Pricebook | `/materials` | `raw_st_pricebook_materials` | MEDIUM |
| Pricebook | `/services` | `raw_st_pricebook_services` | MEDIUM |
| Pricebook | `/equipment` | `raw_st_pricebook_equipment` | MEDIUM |
| Pricebook | `/categories` | `raw_st_pricebook_categories` | LOW |

---

## Merged Tables (Dashboard-Ready)

The existing `st_*` tables become **merged tables** that combine data from multiple raw tables:

| Merged Table | Source Raw Tables | Merge Logic |
|--------------|-------------------|-------------|
| `st_customers` | `raw_st_customers` + `raw_st_customer_contacts` + `raw_st_locations` | Primary contact info, primary address |
| `st_jobs` | `raw_st_jobs` + `raw_st_appointments` + `raw_st_appointment_assignments` | Technician names, appointment times |
| `st_locations` | `raw_st_locations` + `raw_st_location_contacts` | Contact info merged |
| `st_invoices` | `raw_st_invoices` + `raw_st_payments` | Payment info merged |
| `st_estimates` | `raw_st_estimates` | Items expanded |
| `st_technicians` | `raw_st_technicians` | Computed stats added |

---

## Implementation Order

### Phase 1: Critical Data (Week 1)
1. `raw_st_customers`
2. `raw_st_customer_contacts`
3. `raw_st_locations`
4. `raw_st_jobs`
5. `raw_st_appointments`

### Phase 2: Financial Data (Week 2)
6. `raw_st_invoices`
7. `raw_st_payments`
8. `raw_st_estimates`

### Phase 3: Supporting Data (Week 3)
9. `raw_st_technicians`
10. `raw_st_appointment_assignments`
11. `raw_st_installed_equipment`
12. Reference tables (job_types, campaigns, etc.)

### Phase 4: Pricebook (If needed)
13. `raw_st_pricebook_*` tables
