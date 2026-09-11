import * as userRepository from '../repositories/userRepository.js';
import { ApiError } from '../utils/response.js';

/**
 * Phase 2 has no authentication. All work is scoped to the demo user
 * created during database setup. This helper keeps repositories decoupled
 * from the request lifecycle while remaining a single seam to replace when
 * real authentication arrives.
 */
export async function getUserRepositoryContext() {
  const user = await userRepository.getDefaultUser();
  if (!user) {
    throw new ApiError(500, 'No user configured. Run the database setup.', 'NO_USER');
  }
  return user;
}