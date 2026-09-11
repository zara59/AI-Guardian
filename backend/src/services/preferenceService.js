import * as preferenceRepository from '../repositories/preferenceRepository.js';
import * as activityRepository from '../repositories/activityRepository.js';
import { getUserRepositoryContext } from './userHelper.js';

export async function getPreferences() {
  const user = await getUserRepositoryContext();
  return preferenceRepository.findByUserId(user.id);
}

export async function savePreferences(input) {
  const user = await getUserRepositoryContext();
  const saved = await preferenceRepository.upsert(user.id, input);

  await activityRepository.insert({
    userId: user.id,
    type: 'preference',
    title: 'Preferences updated',
    description: 'Your allocation and risk preference were updated.',
    metadata: input,
  });

  return saved;
}