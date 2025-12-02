/**
 * Equipment Systems Routes
 * ServiceTitan Equipment Systems API endpoints
 * Includes: Installed Equipment
 */

import { Router } from 'express';
import { stEndpoints } from '../lib/stEndpoints.js';
import {
  createListHandler,
  createGetHandler,
  createCreateHandler,
  createUpdateHandler,
  createDeleteHandler,
  createExportHandler,
} from '../controllers/generic.controller.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════
// INSTALLED EQUIPMENT
// ═══════════════════════════════════════════════════════════════
router.get('/installed-equipment', createListHandler(stEndpoints.installedEquipment.list));
router.get('/installed-equipment/export', createExportHandler(stEndpoints.installedEquipment.export));
router.get('/installed-equipment/:id', createGetHandler(stEndpoints.installedEquipment.get));
router.post('/installed-equipment', createCreateHandler(stEndpoints.installedEquipment.create));
router.patch('/installed-equipment/:id', createUpdateHandler(stEndpoints.installedEquipment.update, 'PATCH'));
router.delete('/installed-equipment/:id', createDeleteHandler(stEndpoints.installedEquipment.delete));

export default router;
