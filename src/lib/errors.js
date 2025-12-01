/**
 * Custom Error Classes
 * Standardized error types for consistent error handling
 */

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter = null) {
    super('Too many requests', 429, 'RATE_LIMIT_EXCEEDED', { retryAfter });
    this.name = 'RateLimitError';
  }
}

export class ServiceTitanError extends AppError {
  constructor(message, statusCode, stResponse = null) {
    super(message, statusCode, 'SERVICE_TITAN_ERROR', stResponse);
    this.name = 'ServiceTitanError';
  }
}

export class TokenError extends AppError {
  constructor(message = 'Failed to obtain access token') {
    super(message, 500, 'TOKEN_ERROR');
    this.name = 'TokenError';
  }
}

// Error factory for ServiceTitan API responses
export function fromServiceTitanResponse(status, data) {
  const message = data?.message || data?.error?.message || 'ServiceTitan API error';

  switch (status) {
    case 400:
      return new ValidationError(message, data);
    case 401:
      return new AuthenticationError(message);
    case 403:
      return new AuthorizationError(message);
    case 404:
      return new NotFoundError('ServiceTitan resource');
    case 429:
      return new RateLimitError(data?.retryAfter);
    default:
      return new ServiceTitanError(message, status, data);
  }
}
