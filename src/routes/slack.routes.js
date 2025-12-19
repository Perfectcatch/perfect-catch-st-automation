/**
 * Slack Routes
 * Express routes for Slack integration
 */

import express from 'express';
import crypto from 'crypto';

const router = express.Router();

/**
 * Verify Slack request signature
 */
function verifySlackSignature(req, res, next) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  
  // Skip verification in development if no secret
  if (!signingSecret) {
    console.warn('SLACK_SIGNING_SECRET not set - skipping signature verification');
    return next();
  }
  
  const timestamp = req.headers['x-slack-request-timestamp'];
  const slackSignature = req.headers['x-slack-signature'];
  
  // Check timestamp to prevent replay attacks
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp) < fiveMinutesAgo) {
    return res.status(400).json({ error: 'Request too old' });
  }
  
  // Compute signature
  const sigBasestring = `v0:${timestamp}:${req.rawBody || JSON.stringify(req.body)}`;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(sigBasestring)
    .digest('hex');
  
  if (!crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature || ''))) {
    return res.status(400).json({ error: 'Invalid signature' });
  }
  
  next();
}

/**
 * Slack Events Endpoint
 * Receives events from Slack (mentions, DMs, etc.)
 */
router.post('/events', verifySlackSignature, async (req, res) => {
  const { type, event, challenge } = req.body;
  
  // Handle URL verification (Slack setup)
  if (type === 'url_verification') {
    return res.json({ challenge });
  }
  
  // Acknowledge immediately (Slack requires response within 3 seconds)
  res.sendStatus(200);
  
  // Process event asynchronously
  try {
    const { slackClient } = await import('../integrations/slack/slack-client.js');
    
    if (event) {
      switch (event.type) {
        case 'app_mention':
          await slackClient.handleMention(event);
          break;
        
        case 'message':
          if (event.channel_type === 'im' && !event.bot_id) {
            await slackClient.handleDirectMessage(event);
          }
          break;
        
        default:
          console.log(`Unhandled Slack event type: ${event.type}`);
      }
    }
  } catch (error) {
    console.error('Slack event processing error:', error);
  }
});

/**
 * Slash Commands Endpoint
 * Handles /quote, /schedule, /customer, /revenue, /status, etc.
 */
router.post('/commands/:command', verifySlackSignature, async (req, res) => {
  const { command } = req.params;
  const commandData = req.body;
  
  try {
    const { slashCommands } = await import('../integrations/slack/slash-commands.js');
    
    // Map command name (remove leading slash if present)
    const cmdName = command.replace(/^\//, '');
    const handler = slashCommands[cmdName];
    
    if (!handler) {
      return res.json({
        response_type: 'ephemeral',
        text: `Unknown command: /${cmdName}\n\nAvailable commands:\n• /quote [description]\n• /schedule\n• /customer [search]\n• /revenue [today/week/month]\n• /status\n• /jobs [status]\n• /techs`
      });
    }
    
    const result = await handler(commandData);
    res.json(result);
    
  } catch (error) {
    console.error(`Slack command error (${command}):`, error);
    res.json({
      response_type: 'ephemeral',
      text: `❌ Error: ${error.message}`
    });
  }
});

/**
 * Interactive Components Endpoint
 * Handles buttons, modals, select menus
 */
router.post('/interactive', verifySlackSignature, async (req, res) => {
  let payload;
  
  try {
    payload = typeof req.body.payload === 'string' 
      ? JSON.parse(req.body.payload) 
      : req.body.payload || req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  
  const { interactiveHandlers } = await import('../integrations/slack/interactive-handlers.js');
  
  try {
    switch (payload.type) {
      case 'view_submission':
        const result = await interactiveHandlers.handleViewSubmission(payload);
        return res.json(result || { response_action: 'clear' });
      
      case 'block_actions':
        // Acknowledge immediately
        res.sendStatus(200);
        // Process asynchronously
        await interactiveHandlers.handleButtonAction(payload);
        break;
      
      case 'view_closed':
        // User cancelled modal - just acknowledge
        res.sendStatus(200);
        break;
      
      default:
        console.log(`Unhandled interactive type: ${payload.type}`);
        res.sendStatus(200);
    }
  } catch (error) {
    console.error('Slack interactive error:', error);
    
    if (payload.type === 'view_submission') {
      return res.json({
        response_action: 'errors',
        errors: { general: error.message }
      });
    }
    
    res.sendStatus(200);
  }
});

/**
 * Options Endpoint
 * Provides options for external select menus
 */
router.post('/options', verifySlackSignature, async (req, res) => {
  let payload;
  
  try {
    payload = typeof req.body.payload === 'string'
      ? JSON.parse(req.body.payload)
      : req.body.payload || req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  
  try {
    const { interactiveHandlers } = await import('../integrations/slack/interactive-handlers.js');
    const result = await interactiveHandlers.handleOptionsLoad(payload);
    res.json(result);
  } catch (error) {
    console.error('Slack options error:', error);
    res.json({ options: [] });
  }
});

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    integration: 'slack',
    configured: !!process.env.SLACK_BOT_TOKEN
  });
});

export default router;
