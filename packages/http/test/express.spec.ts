import type { AddressInfo } from 'node:net';
import express, { type Request } from 'express';
import { describe, expect, it } from 'vitest';
import { mountExpress, problemErrorHandler } from '../src/express';
import { describeAdapter } from './support/behaviour';
import { presenceRoutes } from './support/every-method';
import { orderRoutes } from './support/orders';

describeAdapter(
  'Express',
  async (routes, options) => {
    const app = express();

    // No parser of the application: the adapter reads the body of each route, and leaves a raw one alone.
    // Mounted on a router to prove a router is as good a target as the application.
    const router = express.Router();

    mountExpress(router, routes, options);
    app.use(router);
    const server = app.listen(0);

    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;

    return {
      url: `http://127.0.0.1:${port}`,
      close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
  },
  (raw) => (raw as Request).headers.authorization,
);

describe('routes mounted on Express, by method', () => {
  it('registers a HEAD and an OPTIONS route as written, each answered as declared', async () => {
    const app = express();

    mountExpress(app, presenceRoutes);
    const server = app.listen(0);

    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${String(port)}/orders/o-1/presence`;

    try {
      expect((await fetch(url, { method: 'HEAD' })).status).toBe(204);
      expect((await fetch(url, { method: 'OPTIONS' })).status).toBe(204);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('the body of a route, read by the Express adapter', () => {
  /** The order routes on an application of their own, and one request posted to them. */
  async function posted(
    mount: (app: express.Express) => void,
    body: string,
    contentType = 'application/json',
  ): Promise<Response> {
    const app = express();

    mount(app);
    app.use(problemErrorHandler());
    const server = app.listen(0, '127.0.0.1');

    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;

    try {
      return await fetch(`http://127.0.0.1:${String(port)}/orders`, {
        method: 'POST',
        headers: { 'content-type': contentType },
        body,
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  const order = JSON.stringify({ customerId: 'c-1', items: [{ sku: 'A-1', quantity: 2 }] });

  it('is read up to bodyLimit, and refused 413 as a problem beyond it', async () => {
    const response = await posted((app) => mountExpress(app, orderRoutes, { bodyLimit: 16 }), order);

    expect(response.status).toBe(413);

    expect(await response.json()).toMatchObject({
      code: 'BODY_TOO_LARGE',
      detail: 'The body is larger than 16 bytes.',
    });
  });

  it('is read as JSON under a media type with the +json suffix', async () => {
    const response = await posted((app) => mountExpress(app, orderRoutes), order, 'application/vnd.order+json');

    expect(response.status).toBe(201);
  });

  it('is taken as a parser of the application read it, when one ran first', async () => {
    const response = await posted((app) => {
      // Strict, the default of Express: null is refused by this parser before the adapter reads anything.
      app.use(express.json());
      mountExpress(app, orderRoutes);
    }, 'null');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'MALFORMED_BODY' });
  });
});
