/**
 * Email Sending Tool
 * Send emails via SendGrid with template support
 */

import sgMail from '@sendgrid/mail';

// Initialize SendGrid (lazy)
let initialized = false;

function initSendGrid() {
  if (!initialized) {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      throw new Error('SENDGRID_API_KEY not configured');
    }
    sgMail.setApiKey(apiKey);
    initialized = true;
  }
}

/**
 * Send a simple email
 */
export async function sendEmail(to, subject, body, options = {}) {
  initSendGrid();

  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME || 'Perfect Catch';

  if (!fromEmail) {
    throw new Error('SENDGRID_FROM_EMAIL not configured');
  }

  const msg = {
    to,
    from: {
      email: fromEmail,
      name: fromName,
    },
    subject,
    text: options.textOnly ? body : undefined,
    html: options.textOnly ? undefined : body,
    replyTo: options.replyTo,
    categories: options.categories || ['automated'],
    customArgs: options.customArgs,
    trackingSettings: {
      clickTracking: { enable: true },
      openTracking: { enable: true },
    },
  };

  // Add attachments if provided
  if (options.attachments && options.attachments.length > 0) {
    msg.attachments = options.attachments.map(att => ({
      content: att.content, // Base64 encoded
      filename: att.filename,
      type: att.type || 'application/octet-stream',
      disposition: att.disposition || 'attachment',
    }));
  }

  try {
    const [response] = await sgMail.send(msg);
    return {
      success: true,
      statusCode: response.statusCode,
      messageId: response.headers['x-message-id'],
      to,
      subject,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code,
      response: error.response?.body,
    };
  }
}

/**
 * Send email using a template with variable substitution
 */
export async function sendTemplatedEmail(to, subject, template, variables, options = {}) {
  let body = template;
  let processedSubject = subject;

  if (variables && typeof variables === 'object') {
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      body = body.replace(regex, value);
      processedSubject = processedSubject.replace(regex, value);
    }
  }

  return sendEmail(to, processedSubject, body, options);
}

/**
 * Send email to multiple recipients
 */
export async function sendBulkEmail(recipients, subject, body, options = {}) {
  initSendGrid();

  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME || 'Perfect Catch';

  if (!fromEmail) {
    throw new Error('SENDGRID_FROM_EMAIL not configured');
  }

  // SendGrid supports up to 1000 recipients per request
  const messages = recipients.map(recipient => {
    let personalizedBody = body;
    let personalizedSubject = subject;

    // Handle personalization if recipient is an object
    if (typeof recipient === 'object' && recipient.variables) {
      for (const [key, value] of Object.entries(recipient.variables)) {
        const regex = new RegExp(`\\{${key}\\}`, 'g');
        personalizedBody = personalizedBody.replace(regex, value);
        personalizedSubject = personalizedSubject.replace(regex, value);
      }
    }

    return {
      to: typeof recipient === 'string' ? recipient : recipient.email,
      from: { email: fromEmail, name: fromName },
      subject: personalizedSubject,
      html: personalizedBody,
      categories: options.categories || ['bulk', 'automated'],
    };
  });

  try {
    await sgMail.send(messages);
    return {
      success: true,
      sent: recipients.length,
      recipients: recipients.map(r => typeof r === 'string' ? r : r.email),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code,
    };
  }
}

// Tool definition for MCP
export const toolDefinition = {
  name: 'send_email',
  description: 'Send an email via SendGrid. Supports HTML content, variable substitution, and attachments.',
  inputSchema: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Recipient email address',
      },
      subject: {
        type: 'string',
        description: 'Email subject line. Supports {variable} syntax.',
      },
      body: {
        type: 'string',
        description: 'Email body (HTML supported). Supports {variable} syntax.',
      },
      variables: {
        type: 'object',
        description: 'Variables to substitute in subject and body (optional)',
      },
      textOnly: {
        type: 'boolean',
        description: 'Send as plain text instead of HTML (default: false)',
      },
      replyTo: {
        type: 'string',
        description: 'Reply-to email address (optional)',
      },
    },
    required: ['to', 'subject', 'body'],
  },
};

export const sendBulkEmailDefinition = {
  name: 'send_bulk_email',
  description: 'Send the same email to multiple recipients with optional personalization',
  inputSchema: {
    type: 'object',
    properties: {
      recipients: {
        type: 'array',
        items: {
          oneOf: [
            { type: 'string' },
            {
              type: 'object',
              properties: {
                email: { type: 'string' },
                variables: { type: 'object' },
              },
              required: ['email'],
            },
          ],
        },
        description: 'Array of email addresses or objects with email and variables',
      },
      subject: {
        type: 'string',
        description: 'Email subject line',
      },
      body: {
        type: 'string',
        description: 'Email body (HTML supported)',
      },
    },
    required: ['recipients', 'subject', 'body'],
  },
};

/**
 * Handle tool call
 */
export async function handleToolCall(args) {
  if (args.variables) {
    return sendTemplatedEmail(args.to, args.subject, args.body, args.variables, {
      textOnly: args.textOnly,
      replyTo: args.replyTo,
    });
  }
  return sendEmail(args.to, args.subject, args.body, {
    textOnly: args.textOnly,
    replyTo: args.replyTo,
  });
}

export default {
  sendEmail,
  sendTemplatedEmail,
  sendBulkEmail,
  handleToolCall,
  toolDefinition,
  sendBulkEmailDefinition,
};
