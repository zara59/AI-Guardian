import * as guardianService from '../services/guardianService.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';

export const status = asyncHandler(async (_req, res) => {
  const status = await guardianService.getProtectionStatus();
  return ok(res, status);
});