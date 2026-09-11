// Phase 5: sleep helper — simple promise-based sleep.

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}