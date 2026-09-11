import * as rankingService from '../services/rankingService.js';
import * as rankingRepository from '../repositories/rankingRepository.js';
import { getUserRepositoryContext } from '../services/userHelper.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok, created } from '../utils/response.js';
import { validateRankingInput } from '../utils/validators.js';

export const create = asyncHandler(async (req, res) => {
  const input = validateRankingInput(req.body);
  const result = await rankingService.createRanking(input);
  return created(res, result, 'RANKING_CREATED');
});

export const history = asyncHandler(async (req, res) => {
  const user = await getUserRepositoryContext();
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const items = await rankingRepository.findLatestByUser(user.id, limit);
  return ok(res, { items });
});