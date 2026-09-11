import * as activityRepository from '../repositories/activityRepository.js';
import { getUserRepositoryContext } from './userHelper.js';

export async function getRecentActivity(limit = 50) {
  const user = await getUserRepositoryContext();
  return activityRepository.findByUserId(user.id, limit);
}