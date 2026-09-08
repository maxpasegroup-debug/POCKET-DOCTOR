import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';
import { authenticate, authorize } from '../auth/authorization.js';
import { IdentityService } from '../auth/identity-service.js';
import { CommerceService } from './commerce-service.js';
import { addressInput, productInput, discoveryInput } from './contracts.js';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, 'INVALID_REQUEST', 'Please check your details and try again.');
  return result.data;
}
export function registerCommerceRoutes(app: FastifyInstance, env: Environment, db?: PrismaClient) {
  const service = db ? new CommerceService(db, env) : undefined;
  const identity = db ? new IdentityService(db, env) : undefined;
  async function context(request: FastifyRequest, admin = false) {
    if (!service || !identity) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Wellness is unavailable right now.');
    const principal = await authenticate(request, identity); authorize(principal, admin ? ['ADMIN'] : ['USER']);
    return { service, userId: principal.userId };
  }
  const id = (r: FastifyRequest) => parse(z.object({ id: z.string().uuid() }), r.params).id;
  const empty = (r: FastifyRequest) => parse(z.object({}).strict(), r.body ?? {});
  app.get('/api/v1/wellness/products', async r => ({ data: await (await context(r)).service.discover(parse(discoveryInput, r.query)) }));
  app.get('/api/v1/wellness/featured', async r => ({ data: await (await context(r)).service.discover({ page: 1, featured: 'true' }) }));
  app.get('/api/v1/wellness/categories', async r => ({ data: { categories: await (await context(r)).service.categories() } }));
  app.get('/api/v1/wellness/products/:id', async r => { const c = await context(r); return { data: { product: await c.service.product(id(r), c.userId) } }; });
  app.get('/api/v1/me/cart', async r => { const c = await context(r); return { data: await c.service.cart(c.userId) }; });
  app.post('/api/v1/me/cart/items', async r => { const c = await context(r);
    const b = parse(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(10) }).strict(), r.body);
    return { data: await c.service.setCart(c.userId, b.productId, b.quantity) }; });
  // Absolute quantity updates use product IDs; repeated retries do not increment again.
  app.patch('/api/v1/me/cart/items/:id', async r => { const c = await context(r);
    const item = await db!.cartItem.findFirst({ where: { id: id(r), userId: c.userId } });
    if (!item) throw new ApiError(404, 'NOT_FOUND', 'Cart item not found.');
    return { data: await c.service.setCart(c.userId, item.productId, parse(z.object({ quantity: z.number().int().min(1).max(10) }).strict(), r.body).quantity) }; });
  app.delete('/api/v1/me/cart/items/:id', async r => { const c = await context(r); return { data: await c.service.removeCart(c.userId, id(r)) }; });
  app.get('/api/v1/me/addresses', async r => { const c = await context(r); return { data: { addresses: await c.service.addresses(c.userId) } }; });
  app.post('/api/v1/me/addresses', async r => { const c = await context(r); return { data: { address: await c.service.saveAddress(c.userId, parse(addressInput, r.body)) } }; });
  app.patch('/api/v1/me/addresses/:id', async r => { const c = await context(r); return { data: { address: await c.service.saveAddress(c.userId, parse(addressInput, r.body), id(r)) } }; });
  app.delete('/api/v1/me/addresses/:id', async r => { const c = await context(r); return { data: await c.service.deleteAddress(c.userId, id(r)) }; });
  app.post('/api/v1/checkout', async r => { const c = await context(r); return { data: await c.service.checkout(c.userId, parse(z.object({ addressId: z.string().uuid() }).strict(), r.body).addressId) }; });
  app.post('/api/v1/orders', async r => { const c = await context(r); const b = parse(z.object({ addressId: z.string().uuid(), quote: z.string().regex(/^[a-f0-9]{64}$/), idempotencyKey: z.string().uuid() }).strict(), r.body);
    return { data: { order: await c.service.createOrder(c.userId, b.addressId, b.quote, b.idempotencyKey) } }; });
  app.get('/api/v1/me/orders', async r => { const c = await context(r); return { data: await c.service.mine(c.userId, parse(z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) }).strict(), r.query).page) }; });
  app.get('/api/v1/me/orders/:id', async r => { const c = await context(r); return { data: { order: await c.service.detail(c.userId, id(r)) } }; });
  app.post('/api/v1/orders/:id/payment', async r => { const c = await context(r); empty(r); return { data: { payment: await c.service.payment(c.userId, id(r)) } }; });
  app.post('/api/v1/order-payments/:id/development-settle', async r => { const c = await context(r); const b = parse(z.object({ outcome: z.enum(['capture', 'fail']) }).strict(), r.body);
    return { data: { order: await c.service.settle(c.userId, id(r), b.outcome) } }; });
  app.post('/api/v1/orders/:id/cancel', async r => { const c = await context(r); empty(r); return { data: { order: await c.service.cancel(c.userId, id(r)) } }; });
  app.post('/api/v1/admin/wellness/categories', async r => { const c = await context(r, true); const b = parse(z.object({ id: z.string().regex(/^[a-z0-9-]{1,60}$/), name: z.string().trim().min(1).max(100), position: z.number().int().min(0).max(1000) }).strict(), r.body);
    return { data: { category: await c.service.saveCategory(b.id, b.name, b.position) } }; });
  app.post('/api/v1/admin/wellness/products', async r => ({ data: { product: await (await context(r, true)).service.saveProduct(parse(productInput, r.body)) } }));
  app.get('/api/v1/admin/wellness/products', async r => { await context(r, true); const { page } = parse(z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) }).strict(), r.query);
    return { data: { products: await db!.wellnessProduct.findMany({ orderBy: { id: 'asc' }, take: 20, skip: (page - 1) * 20 }) } }; });
  app.patch('/api/v1/admin/wellness/products/:id', async r => ({ data: { product: await (await context(r, true)).service.saveProduct(parse(productInput, r.body), id(r)) } }));
  app.post('/api/v1/admin/wellness/products/:id/inventory', async r => ({ data: { inventory: await (await context(r, true)).service.inventory(id(r), parse(z.object({ delta: z.number().int().min(-1000000).max(1000000) }).strict(), r.body).delta) } }));
  app.get('/api/v1/admin/wellness/orders', async r => { await context(r, true); const { page } = parse(z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) }).strict(), r.query);
    return { data: { orders: await db!.order.findMany({ select: { id: true, status: true, totalPaise: true, createdAt: true, refundStatus: true }, orderBy: { createdAt: 'desc' }, take: 20, skip: (page - 1) * 20 }) } }; });
  app.post('/api/v1/admin/wellness/orders/:id/status', async r => { const c = await context(r, true); const b = parse(z.object({ status: z.enum(['PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED']), carrier: z.string().trim().min(1).max(100).optional(), trackingNumber: z.string().trim().min(1).max(100).optional() }).strict(), r.body);
    return { data: { order: await c.service.transition(id(r), b.status, b.carrier, b.trackingNumber) } }; });
  app.get('/api/v1/admin/wellness/orders/:id', async r => ({ data: { order: await (await context(r, true)).service.adminDetail(id(r)) } }));
}
