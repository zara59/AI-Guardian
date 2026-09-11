import * as preferenceService from '../services/preferenceService.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok, created } from '../utils/response.js';
import { validatePreferenceInput } from '../utils/validators.js';

export const get = asyncHandler(async (_req, res) => {
  const prefs = await preferenceService.getPreferences();
  return ok(res, prefs || null);
});

export const update = asyncHandler(async (req, res) => {
  const input = validatePreferenceInput(req.body);
  const saved = await preferenceService.savePreferences(input);
  return created(res, saved, 'PREFERENCES_UPDATED');
});