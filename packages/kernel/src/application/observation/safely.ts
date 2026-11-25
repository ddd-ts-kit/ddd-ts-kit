/**
 * Runs what observes (a hook, a logger, a meter) and keeps its failure to itself: observation
 * must never break what it observes.
 */
export function safely(observe: () => void): void {
  try {
    observe();
  } catch {
    return;
  }
}
