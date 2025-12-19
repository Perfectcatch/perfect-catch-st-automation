-- ============================================
-- Messaging System Schema
-- Migration: 005_messaging_system.sql
-- ============================================
-- SMS/Email logging, templates, and delivery tracking
-- ============================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE: messaging_log
-- Complete log of all sent messages
-- ============================================
CREATE TABLE messaging_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Message Details
  channel VARCHAR(50) NOT NULL, -- 'sms', 'email', 'voice'
  direction VARCHAR(20) NOT NULL, -- 'outbound', 'inbound'
  
  -- Recipients
  to_phone VARCHAR(50),
  to_email VARCHAR(255),
  from_phone VARCHAR(50),
  from_email VARCHAR(255),
  
  -- Content
  subject VARCHAR(500), -- For emails
  body TEXT NOT NULL,
  
  -- Relations
  customer_id BIGINT, -- Reference to st_customers(st_id)
  job_id BIGINT, -- Reference to st_jobs(st_id)
  workflow_instance_id UUID, -- Reference to workflow_instances(id)
  
  -- Provider Details
  provider VARCHAR(50), -- 'twilio', 'sendgrid', 'vapi'
  provider_message_id VARCHAR(255), -- SID for Twilio, etc.
  provider_status VARCHAR(50), -- 'queued', 'sent', 'delivered', 'failed'
  provider_error TEXT,
  
  -- Tracking
  tracking_id VARCHAR(255), -- For campaign tracking
  template_id UUID, -- Reference to messaging_templates(id) if used
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'pending', 
  -- 'pending', 'sent', 'delivered', 'failed', 'bounced', 'opened', 'clicked'
  
  -- Delivery Tracking
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ, -- For emails
  clicked_at TIMESTAMPTZ, -- For emails with links
  failed_at TIMESTAMPTZ,
  
  -- Cost Tracking
  cost DECIMAL(10,6), -- Provider cost per message
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messaging_log_channel ON messaging_log(channel);
CREATE INDEX idx_messaging_log_direction ON messaging_log(direction);
CREATE INDEX idx_messaging_log_to_phone ON messaging_log(to_phone);
CREATE INDEX idx_messaging_log_to_email ON messaging_log(to_email);
CREATE INDEX idx_messaging_log_customer ON messaging_log(customer_id);
CREATE INDEX idx_messaging_log_job ON messaging_log(job_id);
CREATE INDEX idx_messaging_log_workflow ON messaging_log(workflow_instance_id);
CREATE INDEX idx_messaging_log_status ON messaging_log(status);
CREATE INDEX idx_messaging_log_created ON messaging_log(created_at DESC);
CREATE INDEX idx_messaging_log_provider_id ON messaging_log(provider_message_id);
CREATE INDEX idx_messaging_log_tracking ON messaging_log(tracking_id) 
  WHERE tracking_id IS NOT NULL;

-- ============================================
-- TABLE: messaging_templates
-- Reusable message templates
-- ============================================
CREATE TABLE messaging_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Template Info
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  channel VARCHAR(50) NOT NULL, -- 'sms', 'email', 'both'
  
  -- Content
  subject_template VARCHAR(500), -- For emails (supports variables)
  body_template TEXT NOT NULL, -- Supports {variable} syntax
  
  -- Variables
  required_variables JSONB DEFAULT '[]',
  -- Example: ["customer.name", "appointment.date", "business.phone"]
  
  -- Settings
  active BOOLEAN DEFAULT true,
  category VARCHAR(100), -- 'appointment', 'estimate', 'invoice', 'general'
  
  -- Usage Tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255)
);

CREATE INDEX idx_messaging_templates_name ON messaging_templates(name);
CREATE INDEX idx_messaging_templates_channel ON messaging_templates(channel);
CREATE INDEX idx_messaging_templates_category ON messaging_templates(category);
CREATE INDEX idx_messaging_templates_active ON messaging_templates(active);

-- ============================================
-- VIEWS: Messaging insights
-- ============================================

-- Daily messaging summary
CREATE VIEW v_messaging_daily_summary AS
SELECT 
  DATE(created_at) as date,
  channel,
  COUNT(*) as total_messages,
  COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE direction = 'inbound') as inbound,
  COUNT(*) FILTER (WHERE direction = 'outbound') as outbound,
  SUM(cost) as total_cost
FROM messaging_log
GROUP BY DATE(created_at), channel
ORDER BY date DESC, channel;

-- Template performance
CREATE VIEW v_template_performance AS
SELECT 
  t.name as template_name,
  t.category,
  t.channel,
  t.usage_count,
  t.last_used_at,
  COUNT(m.id) as messages_sent,
  COUNT(m.id) FILTER (WHERE m.status = 'delivered') as delivered_count,
  ROUND(100.0 * COUNT(m.id) FILTER (WHERE m.status = 'delivered') / NULLIF(COUNT(m.id), 0), 2) as delivery_rate
FROM messaging_templates t
LEFT JOIN messaging_log m ON m.template_id = t.id
GROUP BY t.id, t.name, t.category, t.channel, t.usage_count, t.last_used_at
ORDER BY t.usage_count DESC;

-- Customer communication history
CREATE VIEW v_customer_communication_history AS
SELECT 
  c.st_id as customer_id,
  c.name as customer_name,
  c.phone as customer_phone,
  c.email as customer_email,
  COUNT(m.id) as total_messages,
  COUNT(m.id) FILTER (WHERE m.channel = 'sms') as sms_count,
  COUNT(m.id) FILTER (WHERE m.channel = 'email') as email_count,
  MAX(m.created_at) as last_message_at,
  COUNT(m.id) FILTER (WHERE m.created_at >= CURRENT_DATE) as messages_today
FROM st_customers c
LEFT JOIN messaging_log m ON m.customer_id = c.st_id
GROUP BY c.st_id, c.name, c.phone, c.email;

-- Failed messages needing retry
CREATE VIEW v_failed_messages AS
SELECT 
  m.id as message_id,
  m.channel,
  m.to_phone,
  m.to_email,
  c.name as customer_name,
  m.body,
  m.provider_error,
  m.failed_at,
  m.created_at
FROM messaging_log m
LEFT JOIN st_customers c ON m.customer_id = c.st_id
WHERE m.status = 'failed'
  AND m.failed_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY m.failed_at DESC;

-- ============================================
-- FUNCTIONS: Messaging utilities
-- ============================================

-- Function to render template with variables
CREATE OR REPLACE FUNCTION render_template(
  template_body TEXT,
  variables JSONB
)
RETURNS TEXT AS $$
DECLARE
  rendered TEXT;
  key TEXT;
  value TEXT;
BEGIN
  rendered := template_body;
  
  -- Replace each variable in template
  FOR key, value IN SELECT * FROM jsonb_each_text(variables)
  LOOP
    rendered := replace(rendered, '{' || key || '}', value);
  END LOOP;
  
  RETURN rendered;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to increment template usage
CREATE OR REPLACE FUNCTION increment_template_usage(template_id_input UUID)
RETURNS void AS $$
BEGIN
  UPDATE messaging_templates
  SET 
    usage_count = usage_count + 1,
    last_used_at = NOW()
  WHERE id = template_id_input;
END;
$$ LANGUAGE plpgsql;

-- Function to get customer message count today
CREATE OR REPLACE FUNCTION get_customer_message_count_today(customer_id_input BIGINT)
RETURNS INTEGER AS $$
DECLARE
  message_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO message_count
  FROM messaging_log
  WHERE customer_id = customer_id_input
    AND created_at >= CURRENT_DATE;
  
  RETURN COALESCE(message_count, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to record inbound message (for SMS replies)
CREATE OR REPLACE FUNCTION record_inbound_message(
  p_channel VARCHAR,
  p_from_phone VARCHAR,
  p_to_phone VARCHAR,
  p_body TEXT,
  p_provider VARCHAR,
  p_provider_message_id VARCHAR
)
RETURNS UUID AS $$
DECLARE
  v_message_id UUID;
  v_customer_id BIGINT;
BEGIN
  -- Try to match customer by phone
  SELECT st_id INTO v_customer_id
  FROM st_customers
  WHERE phone = p_from_phone
  LIMIT 1;
  
  -- Insert message
  INSERT INTO messaging_log (
    channel,
    direction,
    to_phone,
    from_phone,
    body,
    customer_id,
    provider,
    provider_message_id,
    status,
    sent_at,
    delivered_at
  ) VALUES (
    p_channel,
    'inbound',
    p_to_phone,
    p_from_phone,
    p_body,
    v_customer_id,
    p_provider,
    p_provider_message_id,
    'delivered',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_message_id;
  
  RETURN v_message_id;
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

CREATE TRIGGER update_messaging_log_updated_at
  BEFORE UPDATE ON messaging_log
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messaging_templates_updated_at
  BEFORE UPDATE ON messaging_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SAMPLE TEMPLATES
-- ============================================

-- Template: Appointment Confirmation
INSERT INTO messaging_templates (
  name,
  description,
  channel,
  subject_template,
  body_template,
  required_variables,
  category
) VALUES (
  'appointment_confirmation',
  'Sent immediately after appointment is scheduled',
  'sms',
  NULL,
  '✅ Your Perfect Catch appointment is confirmed!
📅 {appointment.date} at {appointment.time}
🏠 {location.address}
👷 Technician: {technician.name}
📞 Questions? Call {business.phone}',
  '["appointment.date", "appointment.time", "location.address", "technician.name", "business.phone"]',
  'appointment'
);

-- Template: Appointment Reminder (24hr)
INSERT INTO messaging_templates (
  name,
  description,
  channel,
  body_template,
  required_variables,
  category
) VALUES (
  'appointment_reminder_24hr',
  'Sent 24 hours before appointment',
  'sms',
  '⏰ Reminder: Your Perfect Catch appointment is tomorrow at {appointment.time}
👷 {technician.name} will see you at {location.address}
Need to reschedule? Call {business.phone}',
  '["appointment.time", "technician.name", "location.address", "business.phone"]',
  'appointment'
);

-- Template: Estimate Sent
INSERT INTO messaging_templates (
  name,
  description,
  channel,
  body_template,
  required_variables,
  category
) VALUES (
  'estimate_sent',
  'Sent when estimate is created',
  'sms',
  'Hi {customer.name}! We sent your ${estimate.total} estimate for {estimate.name}. Any questions? Reply YES to approve or call {business.phone}',
  '["customer.name", "estimate.total", "estimate.name", "business.phone"]',
  'estimate'
);

-- Template: Post-Service Review Request
INSERT INTO messaging_templates (
  name,
  description,
  channel,
  body_template,
  required_variables,
  category
) VALUES (
  'post_service_review',
  'Sent 2 hours after job completion',
  'sms',
  'Thanks for choosing Perfect Catch! How did we do? Leave a quick review: {review.link}',
  '["review.link"]',
  'general'
);

-- Template: Payment Reminder
INSERT INTO messaging_templates (
  name,
  description,
  channel,
  body_template,
  required_variables,
  category
) VALUES (
  'payment_reminder',
  'Sent before invoice due date',
  'sms',
  'Friendly reminder: Invoice #{invoice.number} for ${invoice.balance} is due on {invoice.due_date}. Pay online: {payment.link}',
  '["invoice.number", "invoice.balance", "invoice.due_date", "payment.link"]',
  'invoice'
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
COMMENT ON TABLE messaging_log IS 'Complete log of all SMS/email messages sent and received';
COMMENT ON TABLE messaging_templates IS 'Reusable message templates with variable substitution';

COMMENT ON FUNCTION render_template IS 'Replace template variables with actual values';
COMMENT ON FUNCTION record_inbound_message IS 'Log inbound SMS/email from customer';
COMMENT ON FUNCTION get_customer_message_count_today IS 'Get number of messages sent to customer today';

-- ============================================
-- END OF MIGRATION
-- ============================================
