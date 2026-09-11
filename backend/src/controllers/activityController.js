import * as activityService from '../services/activityService.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';

export const list = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const items = await activityService.getRecentActivity(limit);
  return ok(res, { items });
});