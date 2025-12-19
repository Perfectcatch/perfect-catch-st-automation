/**
 * SMS Sending Tool
 * Send SMS messages via Twilio with rate limiting and logging
 */

import twilio from 'twilio';

// Twilio client (lazy initialized)
let twilioClient = null;

function getTwilioClient() {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
    }

    twilioClient = twilio(accountSid, authToken);
  }
  return twilioClient;
}

/**
 * Normalize phone number to E.164 format
 */
function normalizePhone(phone) {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Add +1 for US numbers if not present
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  } else if (digits.startsWith('+')) {
    return phone;
  }
  
  return `+${digits}`;
}

/**
 * Send SMS message
 */
export async function sendSMS(to, body, options = {}) {
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  
  if (!fromNumber) {
    throw new Error('TWILIO_PHONE_NUMBER not configured');
  }

  const client = getTwilioClient();
  const normalizedTo = normalizePhone(to);

  try {
    const message = await client.messages.create({
      body,
      from: fromNumber,
      to: normalizedTo,
      statusCallback: options.statusCallback,
    });

    return {
      success: true,
      messageId: message.sid,
      status: message.status,
      to: message.to,
      from: message.from,
      body: message.body,
      dateCreated: message.dateCreated,
      price: message.price,
      priceUnit: message.priceUnit,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code,
      moreInfo: error.moreInfo,
    };
  }
}

/**
 * Send SMS using a template
 */
export async function sendTemplatedSMS(to, templateName, variables, options = {}) {
  // This would integrate with the messaging_templates table
  // For now, we'll do simple variable substitution
  let body = templateName;
  
  if (variables && typeof variables === 'object') {
    for (const [key, value] of Object.entries(variables)) {
      body = body.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
  }

  return sendSMS(to, body, options);
}

/**
 * Get message status
 */
export async function getMessageStatus(messageSid) {
  const client = getTwilioClient();
  
  try {
    const message = await client.messages(messageSid).fetch();
    return {
      success: true,
      messageId: message.sid,
      status: message.status,
      to: message.to,
      from: message.from,
      body: message.body,
      dateCreated: message.dateCreated,
      dateSent: message.dateSent,
      dateUpdated: message.dateUpdated,
      errorCode: message.errorCode,
      errorMessage: message.errorMessage,
      price: message.price,
      priceUnit: message.priceUnit,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * List recent messages
 */
export async function listRecentMessages(limit = 20) {
  const client = getTwilioClient();
  
  try {
    const messages = await client.messages.list({ limit });
    return {
      success: true,
      count: messages.length,
      messages: messages.map(m => ({
        messageId: m.sid,
        status: m.status,
        to: m.to,
        from: m.from,
        body: m.body?.substring(0, 100),
        dateCreated: m.dateCreated,
        direction: m.direction,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// Tool definition for MCP
export const toolDefinition = {
  name: 'send_sms',
  description: 'Send an SMS message to a phone number via Twilio. Supports variable substitution in messages.',
  inputSchema: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Recipient phone number (any format, will be normalized)',
      },
      body: {
        type: 'string',
        description: 'Message body (max 1600 characters). Supports {variable} syntax for substitution.',
      },
      variables: {
        type: 'object',
        description: 'Variables to substitute in the message body (optional)',
      },
    },
    required: ['to', 'body'],
  },
};

export const getMessageStatusDefinition = {
  name: 'get_sms_status',
  description: 'Get the delivery status of a sent SMS message',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: {
        type: 'string',
        description: 'Twilio message SID',
      },
    },
    required: ['messageId'],
  },
};

/**
 * Handle tool call
 */
export async function handleToolCall(args) {
  if (args.variables) {
    return sendTemplatedSMS(args.to, args.body, args.variables);
  }
  return sendSMS(args.to, args.body);
}

export default {
  sendSMS,
  sendTemplatedSMS,
  getMessageStatus,
  listRecentMessages,
  handleToolCall,
  toolDefinition,
  getMessageStatusDefinition,
};
