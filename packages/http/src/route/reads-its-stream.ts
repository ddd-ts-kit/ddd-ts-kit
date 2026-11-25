import type { Route } from './route';

/** Whether the route reads its body as it arrives, an upload or a raw body: no parser may read it first. */
export function readsItsStream(route: Pick<Route, 'upload' | 'rawBody'>): boolean {
  return route.upload !== undefined || route.rawBody === true;
}
