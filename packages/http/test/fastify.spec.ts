import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import { Representations } from '../src';
import { fastifyRoutes, mountFastify } from '../src/fastify';
import { describeAdapter } from './support/behaviour';
import { catalogRoutes } from './support/catalog';
import { KNOWN_ORDER, orderRoutes } from './support/orders';

describeAdapter(
  'Fastify',
  async (routes, options) => {
    const app = Fastify();

    mountFastify(app, routes, options);
    const url = await app.listen({ port: 0, host: '127.0.0.1' });

    return { url, close: () => app.close() };
  },
  (raw) => (raw as FastifyRequest).headers.authorization,
);

describe('routes registered as a Fastify plugin', () => {
  it('honours the prefix given at registration', async () => {
    const app = Fastify();

    await app.register(fastifyRoutes(orderRoutes), { prefix: '/api' });
    const response = await app.inject({ method: 'GET', url: `/api/orders/${KNOWN_ORDER}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: KNOWN_ORDER });
    await app.close();
  });
});

describe('the parsers of a Fastify instance the routes are mounted on', () => {
  it('stay as they were for the rest of the instance: a media type a route consumes is read in its own context', async () => {
    const app = Fastify();

    app.post('/outside', async (request) => ({ read: typeof request.body }));
    mountFastify(app, catalogRoutes, { representations: Representations.standard() });

    const xml = { 'content-type': 'application/xml' };
    const body = '<addProduct><name>Pot</name><price>2.00</price></addProduct>';

    try {
      const outside = await app.inject({ method: 'POST', url: '/outside', headers: xml, body });
      const inside = await app.inject({ method: 'POST', url: '/products', headers: xml, body });

      expect(outside.statusCode).toBe(415);
      expect(inside.statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });
});
