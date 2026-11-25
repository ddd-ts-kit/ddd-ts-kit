/**
 * Waits for `work`, or for `ms`, whichever ends first, and tells whether `work` did: a broker that
 * stopped answering (stalled, or a connection cut that the client has not noticed yet) never holds
 * a close forever.
 */
export async function within(ms: number, work: Promise<unknown> | undefined): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<false>((resolve) => (timer = setTimeout(resolve, ms, false)));

  try {
    return await Promise.race([work?.then(() => true) ?? true, late]);
  } finally {
    clearTimeout(timer);
  }
}
