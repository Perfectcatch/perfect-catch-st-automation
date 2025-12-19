/**
 * Shared logging utility
 * Outputs structured JSON logs
 */

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function timestamp() {
  return new Date().toISOString();
}

function shouldLog(level) {
  return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL];
}

function formatLog(level, message, meta = {}) {
  return JSON.stringify({
    ts: timestamp(),
    level,
    message,
    ...meta
  });
}

function log(level, message, meta = {}) {
  if (!shouldLog(level)) return;
  
  const formatted = formatLog(level, message, meta);
  
  if (level === 'error') {
    console.error(formatted);
  } else {
    console.log(formatted);
  }
}

module.exports = {
  debug: (msg, meta) => log('debug', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  
  // Simple console-style logging for backwards compatibility
  simple: {
    log: (...args) => console.log(`[${timestamp()}]`, ...args),
    error: (...args) => console.error(`[${timestamp()}]`, ...args)
  }
};
