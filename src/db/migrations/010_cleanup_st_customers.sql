-- ============================================================
-- Migration: Cleanup st_customers table
-- Date: 2025-12-20
-- Description: Remove unused columns, clean and normalize data
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: Parse names into first_name and last_name
-- ============================================================

-- For Residential customers, parse "First Last" into separate fields
UPDATE servicetitan.st_customers
SET
  first_name = TRIM(SPLIT_PART(REGEXP_REPLACE(name, '^\\.\\s*', ''), ' ', 1)),
  last_name = TRIM(SUBSTRING(REGEXP_REPLACE(name, '^\\.\\s*', '') FROM POSITION(' ' IN REGEXP_REPLACE(name, '^\\.\\s*', '')) + 1))
WHERE type = 'Residential'
  AND name LIKE '% %'
  AND (first_name IS NULL OR first_name = '');

-- For single-word names, use as first_name
UPDATE servicetitan.st_customers
SET first_name = TRIM(REGEXP_REPLACE(name, '^\\.\\s*', ''))
WHERE type = 'Residential'
  AND name NOT LIKE '% %'
  AND (first_name IS NULL OR first_name = '');

-- ============================================================
-- STEP 2: Normalize email addresses (lowercase)
-- ============================================================

UPDATE servicetitan.st_customers
SET email = LOWER(TRIM(email))
WHERE email IS NOT NULL AND email != LOWER(email);

-- ============================================================
-- STEP 3: Clean phone numbers (consistent format)
-- ============================================================

-- Normalize phones that are just digits to (XXX) XXX-XXXX format
UPDATE servicetitan.st_customers
SET phone = '(' || SUBSTRING(phone, 1, 3) || ') ' ||
            SUBSTRING(phone, 4, 3) || '-' ||
            SUBSTRING(phone, 7, 4)
WHERE phone ~ '^[0-9]{10}$';

-- Handle 11-digit phones starting with 1
UPDATE servicetitan.st_customers
SET phone = '(' || SUBSTRING(phone, 2, 3) || ') ' ||
            SUBSTRING(phone, 5, 3) || '-' ||
            SUBSTRING(phone, 8, 4)
WHERE phone ~ '^1[0-9]{10}$';

-- ============================================================
-- STEP 4: Clean invalid data
-- ============================================================

-- Clear invalid zip codes
UPDATE servicetitan.st_customers
SET zip = NULL
WHERE zip IN ('00000', '0', '00', '000', '0000');

-- Clear invalid cities
UPDATE servicetitan.st_customers
SET city = NULL
WHERE city ~* '^[a-z]$' OR city IN ('get', 'test', 'xxx', 'n/a', 'na', 'none');

-- Standardize state codes to uppercase
UPDATE servicetitan.st_customers
SET state = UPPER(TRIM(state))
WHERE state IS NOT NULL AND state != UPPER(state);

-- Clean names that start with dots
UPDATE servicetitan.st_customers
SET name = TRIM(REGEXP_REPLACE(name, '^\\.\\s*', ''))
WHERE name ~ '^\\.';

-- ============================================================
-- STEP 5: Migrate postal_code data to zip (if zip is empty)
-- ============================================================

UPDATE servicetitan.st_customers
SET zip = postal_code
WHERE (zip IS NULL OR zip = '')
  AND postal_code IS NOT NULL
  AND postal_code != '';

-- ============================================================
-- STEP 6: Drop unused/redundant columns
-- ============================================================

-- Drop postal_code (duplicate of zip)
ALTER TABLE servicetitan.st_customers DROP COLUMN IF EXISTS postal_code;

-- Drop addresses JSON (always empty, we have address fields)
ALTER TABLE servicetitan.st_customers DROP COLUMN IF EXISTS addresses;

-- Drop tags JSON (always empty, we use tag_type_ids instead)
ALTER TABLE servicetitan.st_customers DROP COLUMN IF EXISTS tags;

-- Drop location_id (always null, not used)
ALTER TABLE servicetitan.st_customers DROP COLUMN IF EXISTS location_id;

-- Drop last_synced_at (duplicate of local_synced_at)
ALTER TABLE servicetitan.st_customers DROP COLUMN IF EXISTS last_synced_at;

-- ============================================================
-- STEP 7: Add useful computed columns
-- ============================================================

-- Add display_name column for consistent name display
ALTER TABLE servicetitan.st_customers
ADD COLUMN IF NOT EXISTS display_name VARCHAR(500)
GENERATED ALWAYS AS (
  CASE
    WHEN first_name IS NOT NULL AND last_name IS NOT NULL
    THEN first_name || ' ' || last_name
    ELSE name
  END
) STORED;

-- Add has_contact column for quick filtering
ALTER TABLE servicetitan.st_customers
ADD COLUMN IF NOT EXISTS has_contact BOOLEAN
GENERATED ALWAYS AS (
  phone IS NOT NULL OR email IS NOT NULL
) STORED;

-- ============================================================
-- STEP 8: Create index on new columns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_st_customers_has_contact
ON servicetitan.st_customers(has_contact) WHERE has_contact = true;

CREATE INDEX IF NOT EXISTS idx_st_customers_first_name
ON servicetitan.st_customers(first_name) WHERE first_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_st_customers_last_name
ON servicetitan.st_customers(last_name) WHERE last_name IS NOT NULL;

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES (run separately)
-- ============================================================
-- SELECT COUNT(*) as total,
--        COUNT(first_name) as has_first_name,
--        COUNT(last_name) as has_last_name,
--        COUNT(phone) as has_phone,
--        COUNT(email) as has_email,
--        COUNT(*) FILTER (WHERE has_contact) as has_any_contact
-- FROM servicetitan.st_customers;
