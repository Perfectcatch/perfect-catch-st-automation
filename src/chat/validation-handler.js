/**
 * Validation Handler
 * Validates pricebook entities and identifies missing required fields
 */

import { createLogger } from '../lib/logger.js';

const logger = createLogger('validation-handler');

export class ValidationHandler {
  constructor() {
    this.logger = logger;

    // Required fields for each entity type
    this.requiredFields = {
      material: ['name', 'code', 'price', 'unitOfMeasure'],
      service: ['name', 'code', 'price'],
      equipment: ['name', 'code', 'price'],
      category: ['name'],
    };

    // Optional fields with defaults
    this.defaults = {
      material: {
        unitOfMeasure: 'Each',
        active: true,
        taxable: true,
      },
      service: {
        active: true,
        taxable: true,
      },
      equipment: {
        active: true,
        taxable: true,
      },
    };
  }

  /**
   * Validate a material
   * @param {Object} data - Material data
   * @returns {Object} Validation result
   */
  validateMaterial(data) {
    return this.validate(data, 'material');
  }

  /**
   * Validate a service
   * @param {Object} data - Service data
   * @returns {Object} Validation result
   */
  validateService(data) {
    return this.validate(data, 'service');
  }

  /**
   * Validate equipment
   * @param {Object} data - Equipment data
   * @returns {Object} Validation result
   */
  validateEquipment(data) {
    return this.validate(data, 'equipment');
  }

  /**
   * Validate a category
   * @param {Object} data - Category data
   * @returns {Object} Validation result
   */
  validateCategory(data) {
    return this.validate(data, 'category');
  }

  /**
   * Generic validation
   * @param {Object} data - Entity data
   * @param {string} entityType - Type of entity
   * @returns {Object} Validation result
   */
  validate(data, entityType) {
    const result = {
      valid: true,
      missingFields: [],
      errors: [],
      warnings: [],
    };

    const required = this.requiredFields[entityType] || [];

    // Check required fields
    for (const field of required) {
      if (!this.hasValue(data[field])) {
        result.missingFields.push(field);
        result.valid = false;
      }
    }

    // Validate specific fields
    if (data.price !== undefined && data.price !== null) {
      const priceValidation = this.validatePrice(data.price);
      if (!priceValidation.valid) {
        result.errors.push(priceValidation.error);
        result.valid = false;
      }
    }

    if (data.cost !== undefined && data.cost !== null) {
      const costValidation = this.validatePrice(data.cost, 'cost');
      if (!costValidation.valid) {
        result.errors.push(costValidation.error);
        result.valid = false;
      }
    }

    if (data.code) {
      const codeValidation = this.validateCode(data.code);
      if (!codeValidation.valid) {
        result.errors.push(codeValidation.error);
        result.valid = false;
      }
    }

    if (data.name) {
      const nameValidation = this.validateName(data.name);
      if (!nameValidation.valid) {
        result.errors.push(nameValidation.error);
        result.valid = false;
      }
    }

    // Add warnings for recommended fields
    if (entityType === 'material') {
      if (!data.cost && data.price) {
        result.warnings.push('Cost not specified - profit margin cannot be calculated');
      }
      if (!data.description) {
        result.warnings.push('Description not specified - recommended for searchability');
      }
    }

    return result;
  }

  /**
   * Check if a value is present (not null, undefined, or empty string)
   * @param {any} value
   * @returns {boolean}
   */
  hasValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    return true;
  }

  /**
   * Validate a price value
   * @param {any} price
   * @param {string} fieldName
   * @returns {Object}
   */
  validatePrice(price, fieldName = 'price') {
    const numPrice = Number(price);

    if (isNaN(numPrice)) {
      return { valid: false, error: `${fieldName} must be a valid number` };
    }

    if (numPrice < 0) {
      return { valid: false, error: `${fieldName} cannot be negative` };
    }

    if (numPrice > 1000000) {
      return { valid: false, error: `${fieldName} seems unusually high (${numPrice})` };
    }

    return { valid: true };
  }

  /**
   * Validate a code/SKU
   * @param {string} code
   * @returns {Object}
   */
  validateCode(code) {
    if (typeof code !== 'string') {
      return { valid: false, error: 'Code must be a string' };
    }

    if (code.length < 1) {
      return { valid: false, error: 'Code cannot be empty' };
    }

    if (code.length > 100) {
      return { valid: false, error: 'Code cannot exceed 100 characters' };
    }

    // Check for invalid characters
    if (/[<>\"\'\\]/.test(code)) {
      return { valid: false, error: 'Code contains invalid characters' };
    }

    return { valid: true };
  }

  /**
   * Validate a name
   * @param {string} name
   * @returns {Object}
   */
  validateName(name) {
    if (typeof name !== 'string') {
      return { valid: false, error: 'Name must be a string' };
    }

    if (name.trim().length < 1) {
      return { valid: false, error: 'Name cannot be empty' };
    }

    if (name.length > 500) {
      return { valid: false, error: 'Name cannot exceed 500 characters' };
    }

    return { valid: true };
  }

  /**
   * Apply defaults to entity data
   * @param {Object} data - Entity data
   * @param {string} entityType - Type of entity
   * @returns {Object} Data with defaults applied
   */
  applyDefaults(data, entityType) {
    const defaults = this.defaults[entityType] || {};
    return { ...defaults, ...data };
  }

  /**
   * Sanitize entity data
   * @param {Object} data - Entity data
   * @returns {Object} Sanitized data
   */
  sanitize(data) {
    const sanitized = {};

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;

      if (typeof value === 'string') {
        // Trim strings and remove dangerous characters
        sanitized[key] = value.trim().replace(/[<>]/g, '');
      } else if (typeof value === 'number') {
        // Round prices to 4 decimal places
        if (['price', 'cost', 'memberPrice', 'addOnPrice'].includes(key)) {
          sanitized[key] = Math.round(value * 10000) / 10000;
        } else {
          sanitized[key] = value;
        }
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Get human-readable field labels
   * @param {string} field
   * @returns {string}
   */
  getFieldLabel(field) {
    const labels = {
      name: 'Name',
      code: 'Code/SKU',
      price: 'Price',
      cost: 'Cost',
      unitOfMeasure: 'Unit of Measure',
      description: 'Description',
      manufacturer: 'Manufacturer',
      categoryId: 'Category',
      active: 'Active Status',
    };

    return labels[field] || field;
  }

  /**
   * Format validation errors for display
   * @param {Object} validationResult
   * @returns {string}
   */
  formatErrors(validationResult) {
    const lines = [];

    if (validationResult.missingFields.length > 0) {
      lines.push('**Missing required fields:**');
      for (const field of validationResult.missingFields) {
        lines.push(`• ${this.getFieldLabel(field)}`);
      }
    }

    if (validationResult.errors.length > 0) {
      lines.push('\n**Errors:**');
      for (const error of validationResult.errors) {
        lines.push(`• ${error}`);
      }
    }

    if (validationResult.warnings.length > 0) {
      lines.push('\n**Warnings:**');
      for (const warning of validationResult.warnings) {
        lines.push(`• ${warning}`);
      }
    }

    return lines.join('\n');
  }
}

export default ValidationHandler;
