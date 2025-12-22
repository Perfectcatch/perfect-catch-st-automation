-- Raw Tables Migration
-- Maps ServiceTitan API endpoints to raw database tables
-- Each table mirrors the exact structure returned by the API

-- ============================================================================
-- CRM MODULE
-- ============================================================================

-- raw_st_customers: GET /crm/v2/tenant/{tenant}/customers
CREATE TABLE IF NOT EXISTS raw_st_customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL UNIQUE,
    tenant_id BIGINT NOT NULL,

    -- Core fields from API
    active BOOLEAN DEFAULT true,
    name VARCHAR(500),
    type VARCHAR(50),
    address JSONB DEFAULT '{}',
    custom_fields JSONB DEFAULT '[]',
    balance DECIMAL(18,4) DEFAULT 0,
    tax_exempt BOOLEAN DEFAULT false,
    tag_type_ids BIGINT[] DEFAULT '{}',
    do_not_mail BOOLEAN DEFAULT false,
    do_not_service BOOLEAN DEFAULT false,
    national_account BOOLEAN DEFAULT false,
    created_by_id BIGINT,
    merged_to_id BIGINT,
    payment_term_id BIGINT,
    credit_limit DECIMAL(18,4),
    credit_limit_balance DECIMAL(18,4),
    external_data JSONB,

    -- Timestamps
    st_created_on TIMESTAMPTZ,
    st_modified_on TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL
);

CREATE INDEX idx_raw_st_customers_st_id ON raw_st_customers(st_id);
CREATE INDEX idx_raw_st_customers_modified ON raw_st_customers(st_modified_on);
CREATE INDEX idx_raw_st_customers_fetched ON raw_st_customers(fetched_at);
CREATE INDEX idx_raw_st_customers_active ON raw_st_customers(active) WHERE active = true;

-- ============================================================================

-- raw_st_customer_contacts: GET /crm/v2/tenant/{tenant}/customers/contacts
CREATE TABLE IF NOT EXISTS raw_st_customer_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL,
    tenant_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL,

    -- Core fields from API
    type VARCHAR(50),           -- Email, Phone, MobilePhone
    value TEXT,                 -- The actual email/phone number
    memo TEXT,
    phone_settings JSONB,       -- {phoneNumber, doNotText}
    preferences JSONB,          -- {jobRemindersEnabled, etc}

    -- Timestamps
    st_created_on TIMESTAMPTZ,
    st_modified_on TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL,

    -- Unique constraint: one contact record per ST contact ID
    UNIQUE(st_id, customer_id)
);

CREATE INDEX idx_raw_st_customer_contacts_customer ON raw_st_customer_contacts(customer_id);
CREATE INDEX idx_raw_st_customer_contacts_type ON raw_st_customer_contacts(type);
CREATE INDEX idx_raw_st_customer_contacts_modified ON raw_st_customer_contacts(st_modified_on);
CREATE INDEX idx_raw_st_customer_contacts_fetched ON raw_st_customer_contacts(fetched_at);

-- ============================================================================

-- raw_st_locations: GET /crm/v2/tenant/{tenant}/locations
CREATE TABLE IF NOT EXISTS raw_st_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL UNIQUE,
    tenant_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL,

    -- Core fields from API
    active BOOLEAN DEFAULT true,
    name VARCHAR(500),
    address JSONB DEFAULT '{}',
    custom_fields JSONB DEFAULT '[]',
    created_by_id BIGINT,
    merged_to_id BIGINT,
    zone_id BIGINT,
    tax_zone_id BIGINT,
    tax_exempt BOOLEAN DEFAULT false,
    tag_type_ids BIGINT[] DEFAULT '{}',
    external_data JSONB,

    -- Timestamps
    st_created_on TIMESTAMPTZ,
    st_modified_on TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL
);

CREATE INDEX idx_raw_st_locations_st_id ON raw_st_locations(st_id);
CREATE INDEX idx_raw_st_locations_customer ON raw_st_locations(customer_id);
CREATE INDEX idx_raw_st_locations_modified ON raw_st_locations(st_modified_on);
CREATE INDEX idx_raw_st_locations_fetched ON raw_st_locations(fetched_at);

-- ============================================================================

-- raw_st_location_contacts: GET /crm/v2/tenant/{tenant}/locations/contacts
CREATE TABLE IF NOT EXISTS raw_st_location_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL,
    tenant_id BIGINT NOT NULL,
    location_id BIGINT NOT NULL,

    -- Core fields from API
    type VARCHAR(50),
    value TEXT,
    memo TEXT,
    phone_settings JSONB,
    preferences JSONB,

    -- Timestamps
    st_created_on TIMESTAMPTZ,
    st_modified_on TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL,

    UNIQUE(st_id, location_id)
);

CREATE INDEX idx_raw_st_location_contacts_location ON raw_st_location_contacts(location_id);
CREATE INDEX idx_raw_st_location_contacts_type ON raw_st_location_contacts(type);
CREATE INDEX idx_raw_st_location_contacts_modified ON raw_st_location_contacts(st_modified_on);

-- ============================================================================
-- JPM MODULE
-- ============================================================================

-- raw_st_jobs: GET /jpm/v2/tenant/{tenant}/jobs
CREATE TABLE IF NOT EXISTS raw_st_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL UNIQUE,
    tenant_id BIGINT NOT NULL,

    -- Core fields from API
    job_number VARCHAR(50),
    project_id BIGINT,
    customer_id BIGINT,
    location_id BIGINT,
    job_status VARCHAR(50),
    completed_on TIMESTAMPTZ,
    business_unit_id BIGINT,
    job_type_id BIGINT,
    priority VARCHAR(20) DEFAULT 'Normal',
    campaign_id BIGINT,
    appointment_count INT DEFAULT 0,
    first_appointment_id BIGINT,
    last_appointment_id BIGINT,
    recall_for_id BIGINT,
    warranty_id BIGINT,
    job_generated_lead_source JSONB,
    no_charge BOOLEAN DEFAULT false,
    notifications_enabled BOOLEAN DEFAULT true,
    created_by_id BIGINT,
    tag_type_ids BIGINT[] DEFAULT '{}',
    lead_call_id BIGINT,
    partner_lead_call_id BIGINT,
    booking_id BIGINT,
    sold_by_id BIGINT,
    customer_po VARCHAR(100),
    invoice_id BIGINT,
    membership_id BIGINT,
    total DECIMAL(18,4) DEFAULT 0,
    created_from_estimate_id BIGINT,
    estimate_ids BIGINT[] DEFAULT '{}',
    summary TEXT,
    custom_fields JSONB DEFAULT '[]',
    external_data JSONB,

    -- Timestamps
    st_created_on TIMESTAMPTZ,
    st_modified_on TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL
);

CREATE INDEX idx_raw_st_jobs_st_id ON raw_st_jobs(st_id);
CREATE INDEX idx_raw_st_jobs_customer ON raw_st_jobs(customer_id);
CREATE INDEX idx_raw_st_jobs_location ON raw_st_jobs(location_id);
CREATE INDEX idx_raw_st_jobs_status ON raw_st_jobs(job_status);
CREATE INDEX idx_raw_st_jobs_modified ON raw_st_jobs(st_modified_on);
CREATE INDEX idx_raw_st_jobs_fetched ON raw_st_jobs(fetched_at);
CREATE INDEX idx_raw_st_jobs_job_number ON raw_st_jobs(job_number);

-- ============================================================================

-- raw_st_appointments: GET /jpm/v2/tenant/{tenant}/appointments
CREATE TABLE IF NOT EXISTS raw_st_appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL UNIQUE,
    tenant_id BIGINT NOT NULL,

    -- Core fields from API
    job_id BIGINT NOT NULL,
    appointment_number VARCHAR(50),
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    arrival_window_start TIMESTAMPTZ,
    arrival_window_end TIMESTAMPTZ,
    status VARCHAR(50),
    special_instructions TEXT,
    customer_id BIGINT,
    unused BOOLEAN DEFAULT false,
    created_by_id BIGINT,
    is_confirmed BOOLEAN DEFAULT false,
    active BOOLEAN DEFAULT true,

    -- Timestamps
    st_created_on TIMESTAMPTZ,
    st_modified_on TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL
);

CREATE INDEX idx_raw_st_appointments_st_id ON raw_st_appointments(st_id);
CREATE INDEX idx_raw_st_appointments_job ON raw_st_appointments(job_id);
CREATE INDEX idx_raw_st_appointments_status ON raw_st_appointments(status);
CREATE INDEX idx_raw_st_appointments_start ON raw_st_appointments(start_time);
CREATE INDEX idx_raw_st_appointments_modified ON raw_st_appointments(st_modified_on);

-- ============================================================================

-- raw_st_job_types: GET /jpm/v2/tenant/{tenant}/job-types
CREATE TABLE IF NOT EXISTS raw_st_job_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL UNIQUE,
    tenant_id BIGINT NOT NULL,

    -- Core fields from API
    name VARCHAR(255),
    business_unit_ids BIGINT[] DEFAULT '{}',
    skills JSONB DEFAULT '[]',
    tag_type_ids BIGINT[] DEFAULT '{}',
    priority VARCHAR(20),
    duration INT,
    sold_threshold DECIMAL(18,4),
    class VARCHAR(50),
    summary TEXT,
    no_charge BOOLEAN DEFAULT false,
    active BOOLEAN DEFAULT true,
    external_data JSONB,

    -- Timestamps
    st_created_on TIMESTAMPTZ,
    st_modified_on TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL
);

CREATE INDEX idx_raw_st_job_types_st_id ON raw_st_job_types(st_id);
CREATE INDEX idx_raw_st_job_types_active ON raw_st_job_types(active);

-- ============================================================================
-- ACCOUNTING MODULE
-- ============================================================================

-- raw_st_invoices: GET /accounting/v2/tenant/{tenant}/invoices
CREATE TABLE IF NOT EXISTS raw_st_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL UNIQUE,
    tenant_id BIGINT NOT NULL,

    -- Core fields from API
    reference_number VARCHAR(100),
    invoice_date DATE,
    due_date DATE,
    subtotal DECIMAL(18,4) DEFAULT 0,
    sales_tax DECIMAL(18,4) DEFAULT 0,
    total DECIMAL(18,4) DEFAULT 0,
    balance DECIMAL(18,4) DEFAULT 0,
    invoice_type VARCHAR(50),
    customer JSONB,              -- {id, name}
    customer_address JSONB,
    location JSONB,              -- {id, name}
    location_address JSONB,
    business_unit JSONB,         -- {id, name}
    job JSONB,                   -- {id, number, type}
    items JSONB DEFAULT '[]',
    custom_fields JSONB DEFAULT '[]',
    active BOOLEAN DEFAULT true,
    sync_status VARCHAR(50),
    paid_on TIMESTAMPTZ,
    summary TEXT,
    discount_total DECIMAL(18,4) DEFAULT 0,

    -- Timestamps
    st_created_on TIMESTAMPTZ,
    st_modified_on TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL
);

CREATE INDEX idx_raw_st_invoices_st_id ON raw_st_invoices(st_id);
CREATE INDEX idx_raw_st_invoices_reference ON raw_st_invoices(reference_number);
CREATE INDEX idx_raw_st_invoices_modified ON raw_st_invoices(st_modified_on);
CREATE INDEX idx_raw_st_invoices_fetched ON raw_st_invoices(fetched_at);

-- ============================================================================

-- raw_st_payments: GET /accounting/v2/tenant/{tenant}/payments
CREATE TABLE IF NOT EXISTS raw_st_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL UNIQUE,
    tenant_id BIGINT NOT NULL,

    -- Core fields from API
    active BOOLEAN DEFAULT true,
    applied_to JSONB DEFAULT '[]',
    auth_code VARCHAR(50),
    batch JSONB,                 -- {id, number, name}
    business_unit JSONB,         -- {id, name}
    check_number VARCHAR(50),
    created_by VARCHAR(100),
    customer JSONB,              -- {id, name}
    custom_fields JSONB DEFAULT '[]',
    payment_date TIMESTAMPTZ,
    deposit JSONB,
    gl_account JSONB,
    memo TEXT,
    reference_number VARCHAR(100),
    total DECIMAL(18,4) DEFAULT 0,
    payment_type VARCHAR(50),
    type_id VARCHAR(50),
    unapplied_amount DECIMAL(18,4) DEFAULT 0,
    sync_status VARCHAR(50),

    -- Timestamps
    st_created_on TIMESTAMPTZ,
    st_modified_on TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL
);

CREATE INDEX idx_raw_st_payments_st_id ON raw_st_payments(st_id);
CREATE INDEX idx_raw_st_payments_date ON raw_st_payments(payment_date);
CREATE INDEX idx_raw_st_payments_modified ON raw_st_payments(st_modified_on);

-- ============================================================================
-- SETTINGS MODULE
-- ============================================================================

-- raw_st_technicians: GET /settings/v2/tenant/{tenant}/technicians
CREATE TABLE IF NOT EXISTS raw_st_technicians (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL UNIQUE,
    tenant_id BIGINT NOT NULL,

    -- Core fields from API
    user_id BIGINT,
    name VARCHAR(255),
    role_ids BIGINT[] DEFAULT '{}',
    business_unit_id BIGINT,
    main_zone_id BIGINT,
    zone_ids BIGINT[] DEFAULT '{}',
    email VARCHAR(255),
    phone VARCHAR(50),
    login_name VARCHAR(100),
    home JSONB,                  -- Address object
    daily_goal DECIMAL(18,4),
    is_managed_tech BOOLEAN DEFAULT false,
    custom_fields JSONB DEFAULT '[]',
    active BOOLEAN DEFAULT true,
    burden_rate DECIMAL(18,4),
    team VARCHAR(100),
    job_filter VARCHAR(100),
    permissions JSONB DEFAULT '[]',

    -- Timestamps
    st_created_on TIMESTAMPTZ,
    st_modified_on TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL
);

CREATE INDEX idx_raw_st_technicians_st_id ON raw_st_technicians(st_id);
CREATE INDEX idx_raw_st_technicians_active ON raw_st_technicians(active);
CREATE INDEX idx_raw_st_technicians_bu ON raw_st_technicians(business_unit_id);

-- ============================================================================

-- raw_st_employees: GET /settings/v2/tenant/{tenant}/employees
CREATE TABLE IF NOT EXISTS raw_st_employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL UNIQUE,
    tenant_id BIGINT NOT NULL,

    -- Core fields from API
    user_id BIGINT,
    name VARCHAR(255),
    role VARCHAR(100),
    role_ids BIGINT[] DEFAULT '{}',
    business_unit_id BIGINT,
    email VARCHAR(255),
    phone VARCHAR(50),
    login_name VARCHAR(100),
    active BOOLEAN DEFAULT true,
    permissions JSONB DEFAULT '[]',
    custom_fields JSONB DEFAULT '[]',

    -- Timestamps
    st_created_on TIMESTAMPTZ,
    st_modified_on TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL
);

CREATE INDEX idx_raw_st_employees_st_id ON raw_st_employees(st_id);
CREATE INDEX idx_raw_st_employees_active ON raw_st_employees(active);

-- ============================================================================

-- raw_st_business_units: GET /settings/v2/tenant/{tenant}/business-units
CREATE TABLE IF NOT EXISTS raw_st_business_units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL UNIQUE,
    tenant_id BIGINT NOT NULL,

    -- Core fields from API
    active BOOLEAN DEFAULT true,
    name VARCHAR(255),
    official_name VARCHAR(255),
    email VARCHAR(255),
    currency VARCHAR(10),
    phone VARCHAR(50),
    invoice_header TEXT,
    invoice_message TEXT,
    default_tax_rate DECIMAL(8,4),
    address JSONB,
    trade VARCHAR(100),
    division VARCHAR(100),
    tag_type_ids BIGINT[] DEFAULT '{}',
    external_data JSONB,

    -- Timestamps
    st_created_on TIMESTAMPTZ,
    st_modified_on TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL
);

CREATE INDEX idx_raw_st_business_units_st_id ON raw_st_business_units(st_id);
CREATE INDEX idx_raw_st_business_units_active ON raw_st_business_units(active);

-- ============================================================================

-- raw_st_tag_types: GET /settings/v2/tenant/{tenant}/tag-types
CREATE TABLE IF NOT EXISTS raw_st_tag_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL UNIQUE,
    tenant_id BIGINT NOT NULL,

    -- Core fields from API
    name VARCHAR(255),
    active BOOLEAN DEFAULT true,
    code VARCHAR(50),
    color VARCHAR(20),
    entity_type VARCHAR(50),

    -- Timestamps
    st_modified_on TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL
);

CREATE INDEX idx_raw_st_tag_types_st_id ON raw_st_tag_types(st_id);

-- ============================================================================
-- DISPATCH MODULE
-- ============================================================================

-- raw_st_appointment_assignments: GET /dispatch/v2/tenant/{tenant}/appointment-assignments
CREATE TABLE IF NOT EXISTS raw_st_appointment_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id BIGINT NOT NULL,

    -- Core fields from API
    appointment_id BIGINT NOT NULL,
    technician_id BIGINT NOT NULL,
    assigned_on TIMESTAMPTZ,

    -- Timestamps
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL,

    UNIQUE(appointment_id, technician_id)
);

CREATE INDEX idx_raw_st_appt_assign_appt ON raw_st_appointment_assignments(appointment_id);
CREATE INDEX idx_raw_st_appt_assign_tech ON raw_st_appointment_assignments(technician_id);

-- ============================================================================

-- raw_st_teams: GET /dispatch/v2/tenant/{tenant}/teams
CREATE TABLE IF NOT EXISTS raw_st_teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL UNIQUE,
    tenant_id BIGINT NOT NULL,

    -- Core fields from API
    name VARCHAR(255),
    active BOOLEAN DEFAULT true,

    -- Timestamps
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL
);

CREATE INDEX idx_raw_st_teams_st_id ON raw_st_teams(st_id);

-- ============================================================================

-- raw_st_zones: GET /dispatch/v2/tenant/{tenant}/zones
CREATE TABLE IF NOT EXISTS raw_st_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL UNIQUE,
    tenant_id BIGINT NOT NULL,

    -- Core fields from API
    name VARCHAR(255),
    active BOOLEAN DEFAULT true,

    -- Timestamps
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL
);

CREATE INDEX idx_raw_st_zones_st_id ON raw_st_zones(st_id);

-- ============================================================================
-- MARKETING MODULE
-- ============================================================================

-- raw_st_campaigns: GET /marketing/v2/tenant/{tenant}/campaigns
CREATE TABLE IF NOT EXISTS raw_st_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL UNIQUE,
    tenant_id BIGINT NOT NULL,

    -- Core fields from API
    name VARCHAR(255),
    active BOOLEAN DEFAULT true,
    category_id BIGINT,
    code VARCHAR(50),

    -- Timestamps
    st_created_on TIMESTAMPTZ,
    st_modified_on TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL
);

CREATE INDEX idx_raw_st_campaigns_st_id ON raw_st_campaigns(st_id);
CREATE INDEX idx_raw_st_campaigns_active ON raw_st_campaigns(active);

-- ============================================================================
-- EQUIPMENT SYSTEMS MODULE
-- ============================================================================

-- raw_st_installed_equipment: GET /equipmentsystems/v2/tenant/{tenant}/installed-equipment
CREATE TABLE IF NOT EXISTS raw_st_installed_equipment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL UNIQUE,
    tenant_id BIGINT NOT NULL,

    -- Core fields from API
    active BOOLEAN DEFAULT true,
    equipment_id BIGINT,
    location_id BIGINT,
    customer_id BIGINT,
    invoice_item_id BIGINT,
    name VARCHAR(255),
    type VARCHAR(100),
    installed_on TIMESTAMPTZ,
    serial_number VARCHAR(100),
    barcode_id VARCHAR(100),
    memo TEXT,
    manufacturer VARCHAR(255),
    model VARCHAR(255),
    cost DECIMAL(18,4),
    status INT,
    manufacturer_warranty_start DATE,
    manufacturer_warranty_end DATE,
    service_warranty_start DATE,
    service_warranty_end DATE,
    tags JSONB DEFAULT '[]',

    -- Timestamps
    st_created_on TIMESTAMPTZ,
    st_modified_on TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL
);

CREATE INDEX idx_raw_st_installed_equip_st_id ON raw_st_installed_equipment(st_id);
CREATE INDEX idx_raw_st_installed_equip_location ON raw_st_installed_equipment(location_id);
CREATE INDEX idx_raw_st_installed_equip_customer ON raw_st_installed_equipment(customer_id);

-- ============================================================================
-- SALES MODULE
-- ============================================================================

-- raw_st_estimates: GET /sales/v2/tenant/{tenant}/estimates
CREATE TABLE IF NOT EXISTS raw_st_estimates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL UNIQUE,
    tenant_id BIGINT NOT NULL,

    -- Core fields from API
    job_id BIGINT,
    project_id BIGINT,
    location_id BIGINT,
    customer_id BIGINT,
    name VARCHAR(255),
    job_number VARCHAR(50),
    status VARCHAR(50),
    review_status VARCHAR(50),
    summary TEXT,
    sold_on TIMESTAMPTZ,
    sold_by BIGINT,
    active BOOLEAN DEFAULT true,
    items JSONB DEFAULT '[]',
    subtotal DECIMAL(18,4) DEFAULT 0,
    tax DECIMAL(18,4) DEFAULT 0,
    business_unit_id BIGINT,
    business_unit_name VARCHAR(255),
    external_links JSONB DEFAULT '[]',
    is_recommended BOOLEAN DEFAULT false,

    -- Timestamps
    st_created_on TIMESTAMPTZ,
    st_modified_on TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL
);

CREATE INDEX idx_raw_st_estimates_st_id ON raw_st_estimates(st_id);
CREATE INDEX idx_raw_st_estimates_job ON raw_st_estimates(job_id);
CREATE INDEX idx_raw_st_estimates_customer ON raw_st_estimates(customer_id);
CREATE INDEX idx_raw_st_estimates_status ON raw_st_estimates(status);
CREATE INDEX idx_raw_st_estimates_modified ON raw_st_estimates(st_modified_on);

-- ============================================================================
-- PRICEBOOK MODULE
-- ============================================================================

-- raw_st_pricebook_materials: GET /pricebook/v2/tenant/{tenant}/materials
CREATE TABLE IF NOT EXISTS raw_st_pricebook_materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL UNIQUE,
    tenant_id BIGINT NOT NULL,

    -- Core fields from API
    code VARCHAR(100),
    display_name VARCHAR(500),
    description TEXT,
    cost DECIMAL(18,4),
    price DECIMAL(18,4),
    member_price DECIMAL(18,4),
    add_on_price DECIMAL(18,4),
    active BOOLEAN DEFAULT true,
    taxable BOOLEAN DEFAULT false,
    hours DECIMAL(8,4),
    unit_of_measure VARCHAR(50),
    is_inventory BOOLEAN DEFAULT false,
    account VARCHAR(100),
    cost_of_sale_account VARCHAR(100),
    asset_account VARCHAR(100),
    primary_vendor JSONB,
    other_vendors JSONB DEFAULT '[]',
    categories JSONB DEFAULT '[]',
    assets JSONB DEFAULT '[]',

    -- Timestamps
    st_created_on TIMESTAMPTZ,
    st_modified_on TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL
);

CREATE INDEX idx_raw_st_pb_materials_st_id ON raw_st_pricebook_materials(st_id);
CREATE INDEX idx_raw_st_pb_materials_code ON raw_st_pricebook_materials(code);
CREATE INDEX idx_raw_st_pb_materials_active ON raw_st_pricebook_materials(active);

-- ============================================================================

-- raw_st_pricebook_services: GET /pricebook/v2/tenant/{tenant}/services
CREATE TABLE IF NOT EXISTS raw_st_pricebook_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL UNIQUE,
    tenant_id BIGINT NOT NULL,

    -- Core fields from API
    code VARCHAR(100),
    display_name VARCHAR(500),
    description TEXT,
    price DECIMAL(18,4),
    member_price DECIMAL(18,4),
    add_on_price DECIMAL(18,4),
    active BOOLEAN DEFAULT true,
    taxable BOOLEAN DEFAULT false,
    hours DECIMAL(8,4),
    is_labor BOOLEAN DEFAULT false,
    account VARCHAR(100),
    warranty JSONB,
    categories JSONB DEFAULT '[]',
    assets JSONB DEFAULT '[]',
    service_materials JSONB DEFAULT '[]',
    service_equipment JSONB DEFAULT '[]',
    recommendations JSONB DEFAULT '[]',
    upgrades JSONB DEFAULT '[]',

    -- Timestamps
    st_created_on TIMESTAMPTZ,
    st_modified_on TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL
);

CREATE INDEX idx_raw_st_pb_services_st_id ON raw_st_pricebook_services(st_id);
CREATE INDEX idx_raw_st_pb_services_code ON raw_st_pricebook_services(code);
CREATE INDEX idx_raw_st_pb_services_active ON raw_st_pricebook_services(active);

-- ============================================================================

-- raw_st_pricebook_equipment: GET /pricebook/v2/tenant/{tenant}/equipment
CREATE TABLE IF NOT EXISTS raw_st_pricebook_equipment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL UNIQUE,
    tenant_id BIGINT NOT NULL,

    -- Core fields from API
    code VARCHAR(100),
    display_name VARCHAR(500),
    description TEXT,
    price DECIMAL(18,4),
    member_price DECIMAL(18,4),
    add_on_price DECIMAL(18,4),
    cost DECIMAL(18,4),
    active BOOLEAN DEFAULT true,
    taxable BOOLEAN DEFAULT false,
    manufacturer VARCHAR(255),
    model VARCHAR(255),
    manufacturer_warranty JSONB,
    service_warranty JSONB,
    categories JSONB DEFAULT '[]',
    assets JSONB DEFAULT '[]',
    primary_vendor JSONB,
    other_vendors JSONB DEFAULT '[]',
    equipment_materials JSONB DEFAULT '[]',
    recommendations JSONB DEFAULT '[]',

    -- Timestamps
    st_created_on TIMESTAMPTZ,
    st_modified_on TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL
);

CREATE INDEX idx_raw_st_pb_equipment_st_id ON raw_st_pricebook_equipment(st_id);
CREATE INDEX idx_raw_st_pb_equipment_code ON raw_st_pricebook_equipment(code);
CREATE INDEX idx_raw_st_pb_equipment_active ON raw_st_pricebook_equipment(active);

-- ============================================================================

-- raw_st_pricebook_categories: GET /pricebook/v2/tenant/{tenant}/categories
CREATE TABLE IF NOT EXISTS raw_st_pricebook_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_id BIGINT NOT NULL UNIQUE,
    tenant_id BIGINT NOT NULL,

    -- Core fields from API
    name VARCHAR(255),
    active BOOLEAN DEFAULT true,
    description TEXT,
    image TEXT,
    parent_id BIGINT,
    position INT,
    category_type VARCHAR(50),
    subcategories JSONB DEFAULT '[]',
    business_unit_ids BIGINT[] DEFAULT '{}',

    -- Timestamps
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full API response
    full_data JSONB NOT NULL
);

CREATE INDEX idx_raw_st_pb_categories_st_id ON raw_st_pricebook_categories(st_id);
CREATE INDEX idx_raw_st_pb_categories_parent ON raw_st_pricebook_categories(parent_id);
CREATE INDEX idx_raw_st_pb_categories_type ON raw_st_pricebook_categories(category_type);

-- ============================================================================
-- SYNC TRACKING TABLE
-- ============================================================================

-- Track sync state for each raw table
CREATE TABLE IF NOT EXISTS raw_sync_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(100) NOT NULL UNIQUE,
    endpoint VARCHAR(255) NOT NULL,
    last_full_sync TIMESTAMPTZ,
    last_incremental_sync TIMESTAMPTZ,
    last_modified_on_cursor TIMESTAMPTZ,
    continuation_token TEXT,
    records_count BIGINT DEFAULT 0,
    sync_status VARCHAR(50) DEFAULT 'pending',
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize sync state for all raw tables
INSERT INTO raw_sync_state (table_name, endpoint) VALUES
    ('raw_st_customers', '/crm/v2/tenant/{tenant}/customers'),
    ('raw_st_customer_contacts', '/crm/v2/tenant/{tenant}/customers/contacts'),
    ('raw_st_locations', '/crm/v2/tenant/{tenant}/locations'),
    ('raw_st_location_contacts', '/crm/v2/tenant/{tenant}/locations/contacts'),
    ('raw_st_jobs', '/jpm/v2/tenant/{tenant}/jobs'),
    ('raw_st_appointments', '/jpm/v2/tenant/{tenant}/appointments'),
    ('raw_st_job_types', '/jpm/v2/tenant/{tenant}/job-types'),
    ('raw_st_invoices', '/accounting/v2/tenant/{tenant}/invoices'),
    ('raw_st_payments', '/accounting/v2/tenant/{tenant}/payments'),
    ('raw_st_technicians', '/settings/v2/tenant/{tenant}/technicians'),
    ('raw_st_employees', '/settings/v2/tenant/{tenant}/employees'),
    ('raw_st_business_units', '/settings/v2/tenant/{tenant}/business-units'),
    ('raw_st_tag_types', '/settings/v2/tenant/{tenant}/tag-types'),
    ('raw_st_appointment_assignments', '/dispatch/v2/tenant/{tenant}/appointment-assignments'),
    ('raw_st_teams', '/dispatch/v2/tenant/{tenant}/teams'),
    ('raw_st_zones', '/dispatch/v2/tenant/{tenant}/zones'),
    ('raw_st_campaigns', '/marketing/v2/tenant/{tenant}/campaigns'),
    ('raw_st_installed_equipment', '/equipmentsystems/v2/tenant/{tenant}/installed-equipment'),
    ('raw_st_estimates', '/sales/v2/tenant/{tenant}/estimates'),
    ('raw_st_pricebook_materials', '/pricebook/v2/tenant/{tenant}/materials'),
    ('raw_st_pricebook_services', '/pricebook/v2/tenant/{tenant}/services'),
    ('raw_st_pricebook_equipment', '/pricebook/v2/tenant/{tenant}/equipment'),
    ('raw_st_pricebook_categories', '/pricebook/v2/tenant/{tenant}/categories')
ON CONFLICT (table_name) DO NOTHING;
