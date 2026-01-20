/**
 * GET /ghl/pipelines
 * Returns all configured GHL pipelines
 *
 * GET /ghl/pipelines/custom-fields
 * Returns all configured GHL custom field IDs
 */

import { asyncHandler } from '../../../middleware/asyncHandler.js';
import { GHL_PIPELINES, GHL_CUSTOM_FIELDS, GHL_LOCATION_ID } from '../../../config/ghl-pipelines.js';

export const listPipelines = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: GHL_PIPELINES
  });
});

export const listCustomFields = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    locationId: GHL_LOCATION_ID,
    customFields: GHL_CUSTOM_FIELDS
  });
});

export default (router) => {
  router.get('/pipelines', listPipelines);
  router.get('/pipelines/custom-fields', listCustomFields);
};
