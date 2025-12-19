-- ============================================
-- Workflow Automation Engine Schema
-- Migration: 003_workflow_engine.sql
-- ============================================
-- Event-driven workflow automation with
-- smart triggers and stop conditions
-- ============================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE: workflow_definitions
-- Configured workflows (templates)
-- ============================================
CREATE TABLE workflow_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Basic Info
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  
  -- Trigger Configuration
  trigger_event VARCHAR(100) NOT NULL, 
  -- Examples: 'estimate_created', 'job_completed', 'invoice_overdue'
  trigger_conditions JSONB DEFAULT '{}',
  -- JSON object of conditions that must be met
  -- Example: {"estimate.status": "Open", "estimate.total": {"$gte": 1000}}
  
  -- Stop Conditions (array of condition strings)
  stop_conditions JSONB NOT NULL DEFAULT '[]',
  -- Examples: ["estimate.status == 'Sold'", "workflow.message_count >= 4"]
  
  -- Workflow Steps (array of step objects)
  steps JSONB NOT NULL DEFAULT '[]',
  -- Each step: {delay: "2 hours", condition: "...", action: "..."}
  
  -- Settings
  enabled BOOLEAN DEFAULT true,
  max_concurrent_per_customer INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 0, -- Higher = runs first
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  
  -- Tags for organization
  tags VARCHAR(100)[]
);

CREATE INDEX idx_workflow_defs_enabled ON workflow_definitions(enabled);
CREATE INDEX idx_workflow_defs_trigger ON workflow_definitions(trigger_event);
CREATE INDEX idx_workflow_defs_name ON workflow_definitions(name);

-- ============================================
-- TABLE: workflow_instances
-- Active/historical workflow executions
-- ============================================
CREATE TABLE workflow_instances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  
  -- Entity References
  entity_type VARCHAR(50) NOT NULL, -- 'estimate', 'job', 'invoice', etc.
  entity_id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL, -- Reference to st_customers(st_id)
  
  -- State Tracking
  status VARCHAR(50) NOT NULL DEFAULT 'active', 
  -- 'active', 'completed', 'stopped', 'failed', 'paused'
  current_step INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  
  -- Execution Tracking
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  stopped_reason VARCHAR(255),
  -- Examples: 'goal_achieved', 'max_messages', 'customer_opted_out', 'manual_stop'
  
  -- Step Execution Log (append-only history)
  execution_log JSONB DEFAULT '[]',
  -- Array of: {step: 0, executed_at: "...", result: {...}}
  
  -- Next Scheduled Action
  next_action_at TIMESTAMPTZ,
  
  -- Context Data (available to all steps)
  context JSONB DEFAULT '{}',
  -- Stores workflow-specific data, enriched entity data, etc.
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflow_instances_status ON workflow_instances(status);
CREATE INDEX idx_workflow_instances_next_action ON workflow_instances(next_action_at) 
  WHERE status = 'active' AND next_action_at IS NOT NULL;
CREATE INDEX idx_workflow_instances_entity ON workflow_instances(entity_type, entity_id);
CREATE INDEX idx_workflow_instances_customer ON workflow_instances(customer_id);
CREATE INDEX idx_workflow_instances_workflow ON workflow_instances(workflow_id);
CREATE INDEX idx_workflow_instances_active ON workflow_instances(status) 
  WHERE status = 'active';

-- ============================================
-- TABLE: workflow_step_executions
-- Detailed audit log of each step execution
-- ============================================
CREATE TABLE workflow_step_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_instance_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  
  -- Execution Details
  action_type VARCHAR(50), -- 'send_sms', 'send_email', 'call_api', 'query_database'
  action_description TEXT, -- Natural language action from workflow definition
  action_input JSONB, -- Parameters sent to agent/tool
  action_output JSONB, -- Response from agent/tool
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'pending', 
  -- 'pending', 'executing', 'completed', 'failed', 'skipped'
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Timing
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_step_executions_instance ON workflow_step_executions(workflow_instance_id);
CREATE INDEX idx_step_executions_status ON workflow_step_executions(status);
CREATE INDEX idx_step_executions_scheduled ON workflow_step_executions(scheduled_for);

-- ============================================
-- TABLE: customer_communication_preferences
-- Opt-out management and rate limiting
-- ============================================
CREATE TABLE customer_communication_preferences (
  customer_id BIGINT PRIMARY KEY, -- Reference to st_customers(st_id)
  
  -- Opt-out Status
  sms_opted_out BOOLEAN DEFAULT false,
  email_opted_out BOOLEAN DEFAULT false,
  phone_opted_out BOOLEAN DEFAULT false,
  opted_out_at TIMESTAMPTZ,
  opt_out_reason VARCHAR(255),
  
  -- Preferences
  preferred_channel VARCHAR(50), -- 'sms', 'email', 'phone', 'none'
  do_not_contact BOOLEAN DEFAULT false,
  
  -- Frequency Limits (to prevent spam)
  max_messages_per_day INTEGER DEFAULT 3,
  max_messages_per_week INTEGER DEFAULT 10,
  
  -- Message Count Tracking
  messages_today INTEGER DEFAULT 0,
  messages_this_week INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  
  -- Quiet Hours (optional)
  quiet_hours_start TIME, -- Example: '21:00:00'
  quiet_hours_end TIME,   -- Example: '09:00:00'
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customer_prefs_opted_out ON customer_communication_preferences(sms_opted_out);
CREATE INDEX idx_customer_prefs_do_not_contact ON customer_communication_preferences(do_not_contact);

-- ============================================
-- VIEWS: Useful workflow monitoring
-- ============================================

-- Active workflows by customer
CREATE VIEW v_active_workflows AS
SELECT 
  wi.id as workflow_instance_id,
  wi.status,
  wi.current_step,
  wi.message_count,
  wi.started_at,
  wi.next_action_at,
  wd.name as workflow_name,
  wd.enabled as workflow_enabled,
  wi.entity_type,
  wi.entity_id,
  c.name as customer_name,
  c.phone as customer_phone,
  c.email as customer_email
FROM workflow_instances wi
JOIN workflow_definitions wd ON wi.workflow_id = wd.id
JOIN st_customers c ON wi.customer_id = c.st_id
WHERE wi.status = 'active';

-- Workflow performance summary
CREATE VIEW v_workflow_performance AS
SELECT 
  wd.name as workflow_name,
  COUNT(*) as total_executions,
  COUNT(*) FILTER (WHERE wi.status = 'completed') as completed,
  COUNT(*) FILTER (WHERE wi.status = 'stopped') as stopped,
  COUNT(*) FILTER (WHERE wi.status = 'failed') as failed,
  COUNT(*) FILTER (WHERE wi.stopped_reason = 'goal_achieved') as goals_achieved,
  COUNT(*) FILTER (WHERE wi.stopped_reason = 'max_messages') as max_messages_reached,
  AVG(EXTRACT(EPOCH FROM (wi.completed_at - wi.started_at))) as avg_duration_seconds
FROM workflow_definitions wd
LEFT JOIN workflow_instances wi ON wd.id = wi.workflow_id
GROUP BY wd.id, wd.name;

-- Pending workflow actions (due soon)
CREATE VIEW v_pending_workflow_actions AS
SELECT 
  wi.id as workflow_instance_id,
  wd.name as workflow_name,
  wi.entity_type,
  wi.entity_id,
  c.name as customer_name,
  wi.current_step,
  wi.next_action_at,
  EXTRACT(EPOCH FROM (wi.next_action_at - NOW())) as seconds_until_execution
FROM workflow_instances wi
JOIN workflow_definitions wd ON wi.workflow_id = wd.id
JOIN st_customers c ON wi.customer_id = c.st_id
WHERE wi.status = 'active' 
  AND wi.next_action_at IS NOT NULL
  AND wi.next_action_at <= NOW() + INTERVAL '1 hour'
ORDER BY wi.next_action_at ASC;

-- ============================================
-- FUNCTIONS: Workflow management
-- ============================================

-- Function to reset daily message counters (run daily at midnight)
CREATE OR REPLACE FUNCTION reset_daily_message_counters()
RETURNS void AS $$
BEGIN
  UPDATE customer_communication_preferences
  SET messages_today = 0
  WHERE messages_today > 0;
END;
$$ LANGUAGE plpgsql;

-- Function to reset weekly message counters (run weekly on Monday)
CREATE OR REPLACE FUNCTION reset_weekly_message_counters()
RETURNS void AS $$
BEGIN
  UPDATE customer_communication_preferences
  SET messages_this_week = 0
  WHERE messages_this_week > 0;
END;
$$ LANGUAGE plpgsql;

-- Function to check if customer can receive message
CREATE OR REPLACE FUNCTION can_send_message_to_customer(
  p_customer_id BIGINT,
  p_channel VARCHAR(50)
)
RETURNS BOOLEAN AS $$
DECLARE
  v_prefs RECORD;
  v_current_time TIME;
  v_is_quiet_hours BOOLEAN;
BEGIN
  -- Get customer preferences
  SELECT * INTO v_prefs
  FROM customer_communication_preferences
  WHERE customer_id = p_customer_id;
  
  -- If no preferences, allow (default behavior)
  IF v_prefs IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Check opt-out status
  IF v_prefs.do_not_contact THEN
    RETURN FALSE;
  END IF;
  
  IF p_channel = 'sms' AND v_prefs.sms_opted_out THEN
    RETURN FALSE;
  END IF;
  
  IF p_channel = 'email' AND v_prefs.email_opted_out THEN
    RETURN FALSE;
  END IF;
  
  IF p_channel = 'phone' AND v_prefs.phone_opted_out THEN
    RETURN FALSE;
  END IF;
  
  -- Check rate limits
  IF v_prefs.messages_today >= v_prefs.max_messages_per_day THEN
    RETURN FALSE;
  END IF;
  
  IF v_prefs.messages_this_week >= v_prefs.max_messages_per_week THEN
    RETURN FALSE;
  END IF;
  
  -- Check quiet hours (if configured)
  IF v_prefs.quiet_hours_start IS NOT NULL AND v_prefs.quiet_hours_end IS NOT NULL THEN
    v_current_time := (CURRENT_TIME AT TIME ZONE v_prefs.timezone)::TIME;
    
    -- Handle quiet hours that span midnight
    IF v_prefs.quiet_hours_start < v_prefs.quiet_hours_end THEN
      v_is_quiet_hours := v_current_time BETWEEN v_prefs.quiet_hours_start AND v_prefs.quiet_hours_end;
    ELSE
      v_is_quiet_hours := v_current_time >= v_prefs.quiet_hours_start OR v_current_time <= v_prefs.quiet_hours_end;
    END IF;
    
    IF v_is_quiet_hours THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  -- All checks passed
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to record message sent (increment counters)
CREATE OR REPLACE FUNCTION record_message_sent(
  p_customer_id BIGINT,
  p_channel VARCHAR(50)
)
RETURNS void AS $$
BEGIN
  INSERT INTO customer_communication_preferences (
    customer_id, 
    messages_today, 
    messages_this_week, 
    last_message_at
  )
  VALUES (
    p_customer_id, 
    1, 
    1, 
    NOW()
  )
  ON CONFLICT (customer_id) DO UPDATE SET
    messages_today = customer_communication_preferences.messages_today + 1,
    messages_this_week = customer_communication_preferences.messages_this_week + 1,
    last_message_at = NOW();
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

CREATE TRIGGER update_workflow_definitions_updated_at
  BEFORE UPDATE ON workflow_definitions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_instances_updated_at
  BEFORE UPDATE ON workflow_instances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_prefs_updated_at
  BEFORE UPDATE ON customer_communication_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SAMPLE WORKFLOW DEFINITIONS
-- ============================================

-- Example 1: Estimate Follow-Up (4 messages max)
INSERT INTO workflow_definitions (
  name,
  description,
  trigger_event,
  trigger_conditions,
  stop_conditions,
  steps,
  enabled
) VALUES (
  'Estimate Follow-Up - 4 Message Max',
  'Automated follow-up sequence for open estimates. Stops when estimate is sold or after 4 messages.',
  'estimate_created',
  '{"estimate.status": "Open", "estimate.total": {"$gte": 1000}}',
  '["estimate.status == ''Sold''", "estimate.status == ''Dismissed''", "workflow.message_count >= 4", "customer.opted_out == true"]',
  '[
    {
      "step": 1,
      "delay": "2 hours",
      "action": "Send SMS to customer: ''Hi {customer.name}! We sent your ${estimate.total} estimate for {estimate.name}. Any questions? Reply or call us at {business.phone}''"
    },
    {
      "step": 2,
      "delay": "2 days",
      "condition": "estimate.status == ''Open''",
      "action": "Send SMS to customer: ''Following up on your ${estimate.total} estimate. We can start as early as {next_available_date}. Ready to schedule?''"
    },
    {
      "step": 3,
      "delay": "5 days",
      "condition": "estimate.status == ''Open''",
      "action": "Send SMS to customer: ''Any questions about the estimate? Call {technician.name} directly at {technician.phone}. We''re here to help!''"
    },
    {
      "step": 4,
      "delay": "10 days",
      "condition": "estimate.status == ''Open''",
      "action": "Send SMS to customer: ''FINAL follow-up on estimate #{estimate.number}. Special offer: 10% off if you approve by {deadline_date}. Let us know!''"
    }
  ]',
  true
);

-- Example 2: Post-Service Review Request
INSERT INTO workflow_definitions (
  name,
  description,
  trigger_event,
  stop_conditions,
  steps,
  enabled
) VALUES (
  'Post-Service Review Request',
  'Request review after job completion. Max 2 attempts.',
  'job_completed',
  '["workflow.message_count >= 2", "review_received == true"]',
  '[
    {
      "step": 1,
      "delay": "2 hours",
      "action": "Send SMS to customer: ''Thanks for choosing Perfect Catch! How did we do? Leave a quick review: {review_link}''"
    },
    {
      "step": 2,
      "delay": "3 days",
      "condition": "review_received == false",
      "action": "Send SMS to customer: ''We''d love your feedback! Quick 1-minute review would help us improve: {review_link}''"
    }
  ]',
  true
);

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
-- Adjust based on your user setup
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO your_app_user;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE workflow_definitions IS 'Workflow templates with trigger and stop conditions';
COMMENT ON TABLE workflow_instances IS 'Active and historical workflow executions with state tracking';
COMMENT ON TABLE workflow_step_executions IS 'Detailed audit log of each step execution';
COMMENT ON TABLE customer_communication_preferences IS 'Customer opt-out preferences and rate limiting';

COMMENT ON FUNCTION can_send_message_to_customer IS 'Check if customer can receive message based on preferences and limits';
COMMENT ON FUNCTION record_message_sent IS 'Increment message counters when message is sent';

-- ============================================
-- END OF MIGRATION
-- ============================================
