-- ============================================
-- CallRail Conversion Tracking Schema
-- Migration: 004_callrail_tracking.sql
-- ============================================
-- Track phone calls from CallRail to ServiceTitan
-- jobs/estimates and push conversions to Google Ads
-- ============================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE: callrail_calls
-- Complete call tracking with attribution
-- ============================================
CREATE TABLE callrail_calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  callrail_id VARCHAR(255) UNIQUE NOT NULL,
  
  -- Call Details
  caller_phone VARCHAR(50),
  tracking_number VARCHAR(50),
  duration_seconds INTEGER,
  call_start TIMESTAMPTZ,
  call_end TIMESTAMPTZ,
  recording_url TEXT,
  call_status VARCHAR(50), -- 'completed', 'missed', 'voicemail'
  
  -- Attribution Data
  gclid TEXT, -- Google Click ID for conversion tracking
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(255),
  utm_term VARCHAR(255),
  utm_content VARCHAR(255),
  landing_page_url TEXT,
  referrer_url TEXT,
  
  -- Device & Location
  device_type VARCHAR(50), -- 'desktop', 'mobile', 'tablet'
  caller_city VARCHAR(255),
  caller_state VARCHAR(100),
  caller_zip VARCHAR(20),
  caller_country VARCHAR(100),
  
  -- Matching to ServiceTitan
  st_customer_id BIGINT, -- Reference to st_customers(st_id)
  matched_at TIMESTAMPTZ,
  match_confidence VARCHAR(20), -- 'exact', 'fuzzy', 'manual', 'none'
  match_method VARCHAR(50), -- 'phone_exact', 'phone_fuzzy', 'manual_assignment'
  
  -- Conversion Tracking
  converted_to_job BOOLEAN DEFAULT false,
  converted_to_estimate BOOLEAN DEFAULT false,
  estimate_sold BOOLEAN DEFAULT false,
  st_job_id BIGINT, -- Reference to st_jobs(st_id)
  st_estimate_id BIGINT, -- Reference to st_estimates(st_id)
  conversion_value DECIMAL(18,4), -- Total invoice/estimate amount
  conversion_date TIMESTAMPTZ,
  
  -- Google Ads Conversion Push
  gads_conversion_sent BOOLEAN DEFAULT false,
  gads_conversion_sent_at TIMESTAMPTZ,
  gads_conversion_error TEXT,
  gads_retry_count INTEGER DEFAULT 0,
  
  -- CallRail Tags & Notes
  tags JSONB DEFAULT '[]',
  notes TEXT,
  
  -- Full API Response (for reference)
  full_data JSONB NOT NULL,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_callrail_calls_id ON callrail_calls(callrail_id);
CREATE INDEX idx_callrail_calls_phone ON callrail_calls(caller_phone);
CREATE INDEX idx_callrail_calls_gclid ON callrail_calls(gclid) WHERE gclid IS NOT NULL;
CREATE INDEX idx_callrail_calls_customer ON callrail_calls(st_customer_id);
CREATE INDEX idx_callrail_calls_job ON callrail_calls(st_job_id);
CREATE INDEX idx_callrail_calls_estimate ON callrail_calls(st_estimate_id);
CREATE INDEX idx_callrail_calls_start ON callrail_calls(call_start DESC);
CREATE INDEX idx_callrail_calls_pending_match ON callrail_calls(matched_at) 
  WHERE matched_at IS NULL;
CREATE INDEX idx_callrail_calls_pending_gads ON callrail_calls(gads_conversion_sent) 
  WHERE gads_conversion_sent = false AND converted_to_job = true AND gclid IS NOT NULL;

-- ============================================
-- TABLE: callrail_conversion_log
-- Detailed log of conversion tracking attempts
-- ============================================
CREATE TABLE callrail_conversion_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id UUID NOT NULL REFERENCES callrail_calls(id) ON DELETE CASCADE,
  
  -- Conversion Details
  conversion_type VARCHAR(50) NOT NULL, -- 'job_created', 'estimate_sold', 'invoice_paid'
  conversion_value DECIMAL(18,4),
  
  -- Google Ads Push
  gads_attempt_number INTEGER DEFAULT 1,
  gads_status VARCHAR(50), -- 'pending', 'sent', 'failed'
  gads_response JSONB,
  gads_error TEXT,
  
  -- Attribution
  gclid TEXT,
  campaign_id VARCHAR(255),
  conversion_action VARCHAR(100), -- 'JOB_BOOKED', 'ESTIMATE_SOLD', 'INVOICE_PAID'
  
  -- Timing
  attempted_at TIMESTAMPTZ DEFAULT NOW(),
  succeeded_at TIMESTAMPTZ,
  
  -- Metadata
  triggered_by VARCHAR(100) -- 'webhook', 'sync_job', 'manual'
);

CREATE INDEX idx_conversion_log_call ON callrail_conversion_log(call_id);
CREATE INDEX idx_conversion_log_status ON callrail_conversion_log(gads_status);
CREATE INDEX idx_conversion_log_attempted ON callrail_conversion_log(attempted_at DESC);

-- ============================================
-- VIEWS: CallRail insights
-- ============================================

-- Unmatched calls (need customer assignment)
CREATE VIEW v_unmatched_calls AS
SELECT 
  id as call_id,
  callrail_id,
  caller_phone,
  call_start,
  duration_seconds,
  landing_page_url,
  utm_campaign
FROM callrail_calls
WHERE matched_at IS NULL
  AND call_status = 'completed'
ORDER BY call_start DESC;

-- Conversion funnel
CREATE VIEW v_conversion_funnel AS
SELECT 
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE st_customer_id IS NOT NULL) as matched_calls,
  COUNT(*) FILTER (WHERE converted_to_job) as converted_to_job,
  COUNT(*) FILTER (WHERE converted_to_estimate) as converted_to_estimate,
  COUNT(*) FILTER (WHERE estimate_sold) as estimates_sold,
  SUM(conversion_value) FILTER (WHERE estimate_sold) as total_revenue,
  COUNT(*) FILTER (WHERE gads_conversion_sent) as gads_conversions_sent
FROM callrail_calls
WHERE call_start >= CURRENT_DATE - INTERVAL '30 days';

-- Pending Google Ads conversions
CREATE VIEW v_pending_gads_conversions AS
SELECT 
  c.id as call_id,
  c.callrail_id,
  c.gclid,
  c.caller_phone,
  j.job_number,
  j.invoice_total as conversion_value,
  c.call_start,
  j.st_created_on as job_created_at,
  c.gads_retry_count
FROM callrail_calls c
JOIN st_jobs j ON c.st_job_id = j.st_id
WHERE c.gads_conversion_sent = false
  AND c.converted_to_job = true
  AND c.gclid IS NOT NULL
ORDER BY c.call_start DESC;

-- Call attribution by campaign
CREATE VIEW v_call_attribution_by_campaign AS
SELECT 
  utm_campaign,
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE converted_to_job) as converted_calls,
  ROUND(100.0 * COUNT(*) FILTER (WHERE converted_to_job) / NULLIF(COUNT(*), 0), 2) as conversion_rate,
  SUM(conversion_value) FILTER (WHERE estimate_sold) as total_revenue,
  AVG(conversion_value) FILTER (WHERE estimate_sold) as avg_deal_size
FROM callrail_calls
WHERE call_start >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY utm_campaign
ORDER BY total_revenue DESC NULLS LAST;

-- ============================================
-- FUNCTIONS: CallRail utilities
-- ============================================

-- Function to normalize phone numbers for matching
CREATE OR REPLACE FUNCTION normalize_phone(phone_input VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
  -- Remove all non-digit characters
  RETURN regexp_replace(phone_input, '[^0-9]', '', 'g');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to attempt automatic customer matching
CREATE OR REPLACE FUNCTION match_call_to_customer(call_id_input UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_call RECORD;
  v_normalized_phone VARCHAR;
  v_customer_id BIGINT;
BEGIN
  -- Get call details
  SELECT * INTO v_call
  FROM callrail_calls
  WHERE id = call_id_input;
  
  IF v_call IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Already matched
  IF v_call.st_customer_id IS NOT NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Normalize phone number
  v_normalized_phone := normalize_phone(v_call.caller_phone);
  
  -- Try exact match first
  SELECT st_id INTO v_customer_id
  FROM st_customers
  WHERE normalize_phone(phone) = v_normalized_phone
  LIMIT 1;
  
  IF v_customer_id IS NOT NULL THEN
    -- Found exact match
    UPDATE callrail_calls
    SET st_customer_id = v_customer_id,
        matched_at = NOW(),
        match_confidence = 'exact',
        match_method = 'phone_exact'
    WHERE id = call_id_input;
    
    RETURN TRUE;
  END IF;
  
  -- Try fuzzy match (last 10 digits)
  IF LENGTH(v_normalized_phone) >= 10 THEN
    SELECT st_id INTO v_customer_id
    FROM st_customers
    WHERE RIGHT(normalize_phone(phone), 10) = RIGHT(v_normalized_phone, 10)
    LIMIT 1;
    
    IF v_customer_id IS NOT NULL THEN
      -- Found fuzzy match
      UPDATE callrail_calls
      SET st_customer_id = v_customer_id,
          matched_at = NOW(),
          match_confidence = 'fuzzy',
          match_method = 'phone_fuzzy'
      WHERE id = call_id_input;
      
      RETURN TRUE;
    END IF;
  END IF;
  
  -- No match found
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to check for conversions (run after job/estimate created)
CREATE OR REPLACE FUNCTION check_call_conversions()
RETURNS INTEGER AS $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  -- Update calls that converted to jobs
  UPDATE callrail_calls c
  SET 
    converted_to_job = true,
    st_job_id = j.st_id,
    conversion_value = j.invoice_total,
    conversion_date = j.st_created_on
  FROM st_jobs j
  WHERE c.st_customer_id = j.customer_id
    AND c.converted_to_job = false
    AND j.st_created_on >= c.call_start
    AND j.st_created_on <= c.call_start + INTERVAL '7 days';
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  
  -- Update calls that have sold estimates
  UPDATE callrail_calls c
  SET 
    converted_to_estimate = true,
    estimate_sold = true,
    st_estimate_id = e.st_id,
    conversion_value = e.total,
    conversion_date = e.sold_on
  FROM st_estimates e
  WHERE c.st_customer_id = e.customer_id
    AND c.estimate_sold = false
    AND e.status = 'Sold'
    AND e.sold_on >= c.call_start
    AND e.sold_on <= c.call_start + INTERVAL '30 days';
  
  GET DIAGNOSTICS v_updated = v_updated + ROW_COUNT;
  
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS: Auto-update timestamps
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_callrail_calls_updated_at
  BEFORE UPDATE ON callrail_calls
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
-- Adjust based on your user setup
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO your_app_user;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE callrail_calls IS 'Complete call tracking from CallRail with attribution data';
COMMENT ON TABLE callrail_conversion_log IS 'Detailed log of Google Ads conversion push attempts';

COMMENT ON FUNCTION normalize_phone IS 'Remove non-digit characters from phone number for matching';
COMMENT ON FUNCTION match_call_to_customer IS 'Attempt automatic customer matching using phone number';
COMMENT ON FUNCTION check_call_conversions IS 'Check if any calls converted to jobs/estimates';

-- ============================================
-- END OF MIGRATION
-- ============================================
