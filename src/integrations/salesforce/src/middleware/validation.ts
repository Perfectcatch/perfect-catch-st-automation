/**
 * Validation Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Validate sync request body
 */
export function validateSyncRequest(req: Request, res: Response, next: NextFunction): void {
  const { customerId, customer } = req.body;
  
  if (!customerId && !customer) {
    res.status(400).json({ 
      error: 'Validation failed',
      message: 'Either customerId or customer object is required'
    });
    return;
  }
  
  if (customer) {
    // Validate required customer fields
    const errors: string[] = [];
    
    if (!customer.id) errors.push('customer.id is required');
    if (!customer.lastName && !customer.companyName) {
      errors.push('customer.lastName or customer.companyName is required');
    }
    
    if (errors.length > 0) {
      res.status(400).json({ 
        error: 'Validation failed',
        messages: errors
      });
      return;
    }
  }
  
  next();
}

/**
 * Validate Salesforce is connected before sync operations
 */
export async function requireSalesforceConnection(
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> {
  try {
    const { getSalesforceService } = await import('../services/salesforce.service');
    const sf = getSalesforceService();
    
    if (!sf.isConnected()) {
      const loaded = await sf.loadStoredTokens();
      if (!loaded) {
        res.status(503).json({
          error: 'Salesforce not connected',
          message: 'Please connect to Salesforce first via /api/salesforce/auth'
        });
        return;
      }
    }
    
    next();
  } catch (error) {
    logger.error('Salesforce connection check failed', { error });
    res.status(503).json({
      error: 'Salesforce connection error',
      message: 'Failed to verify Salesforce connection'
    });
  }
}

/**
 * Error handling middleware
 */
export function errorHandler(
  error: any, 
  req: Request, 
  res: Response, 
  next: NextFunction
): void {
  logger.error('Unhandled error', { 
    error: error.message, 
    stack: error.stack,
    path: req.path,
    method: req.method
  });
  
  // Salesforce-specific errors
  if (error.errorCode) {
    res.status(error.statusCode || 500).json({
      error: error.errorCode,
      message: error.message,
      fields: error.fields
    });
    return;
  }
  
  // Generic error
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
  });
}
