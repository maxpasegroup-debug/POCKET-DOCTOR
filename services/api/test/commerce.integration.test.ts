import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { buildApp } from '../src/app.js';
import { readEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/database/database.js';
import { hashToken } from '../src/modules/auth/identity-service.js';
import { CommerceService } from '../src/modules/wellness/commerce-service.js';
import { productInput, addressInput } from '../src/modules/wellness/contracts.js';
import { receiptMatches } from '../src/modules/programs/payment-provider.js';

test('commerce input and payment contracts reject unsafe state', () => {
  assert.throws(() => readEnvironment({ APP_ENV: 'production', DATABASE_URL: 'postgresql://localhost/test', DEMO_WELLNESS: 'true' }));
  assert.equal(addressInput.safeParse({ fullName: 'Test', phone: '123', line1: 'Test', line2: '', city: 'Test', state: 'Test', pinCode: '123', country: 'IN', isDefault: true }).success, false);
  assert.equal(productInput.safeParse({ pricePaise: -1 }).success, false);
  assert.equal(receiptMatches({ id: 'order', amountPaise: 100, currency: 'INR' }, { orderId: 'order', reference: 'captured', amountPaise: 1, currency: 'INR', captured: true }), false);
});

test('wellness commerce with real PostgreSQL transactions', { skip: process.env.AUTH_INTEGRATION !== 'true' || !process.env.DATABASE_URL }, async t => {
  const database = createDatabase(process.env.DATABASE_URL!); const db = database.client!;
  const env = readEnvironment({ APP_ENV: 'test', PAYMENT_MODE: 'development', DEMO_WELLNESS: 'true' });
  const app = await buildApp(env, database);
  const users = await Promise.all(['USER', 'USER', 'ADMIN', 'DOCTOR'].map(role => db.user.create({ data: { fullName: 'DEMO commerce tester', roles: { create: { role: role as 'USER' | 'ADMIN' | 'DOCTOR' } } } })));
  const tokens = users.map(() => randomBytes(32).toString('base64url'));
  await db.session.createMany({ data: users.map((u, i) => ({ userId: u.id, tokenHash: hashToken(tokens[i]!), expiresAt: new Date(Date.now() + 3600000) })) });
  const categoryId = `test-${randomUUID()}`;
  const category = await db.wellnessCategory.create({ data: { id: categoryId, name: `DEMO category ${randomUUID()}` } });
  const base = { name: 'DEMO commerce bottle', slug: `demo-${randomUUID()}`, sku: `DEMO-${randomUUID()}`, shortDescription: 'DEMO only', description: 'Synthetic non-medical product', categoryId,
    pricePaise: 30000, mrpPaise: 40000, brand: 'DEMO brand', manufacturer: 'DEMO manufacturer', ingredients: 'Sample materials', usage: 'Sample usage', warnings: 'DEMO only', storage: 'Sample storage', quantityLabel: '1 unit',
    shippingEligible: true, requiresEligibility: false, contentApproved: true, status: 'ACTIVE' as const, isDemo: true, returnPolicy: 'Test policy', featured: true, collection: 'Sample collection', images: [], doctorId: null };
  const product = await db.wellnessProduct.create({ data: { ...base, stockQuantity: 1 } });
  const restricted = await db.wellnessProduct.create({ data: { ...base, name: 'Restricted test', slug: `restricted-${randomUUID()}`, sku: randomUUID(), status: 'DRAFT', requiresEligibility: true } });
  let requests = 0;
  const call = (url: string, body?: object, actor = 0, method?: 'PATCH' | 'DELETE') => app.inject({ method: method ?? (body ? 'POST' : 'GET'), url: `/api/v1${url}`, remoteAddress: `127.4.0.${++requests}`, headers: { authorization: `Bearer ${tokens[actor]}` }, ...(body ? { payload: body } : {}) });
  const address = { fullName: 'DEMO recipient', phone: '+919999900404', line1: 'DEMO address only', line2: '', city: 'Test city', state: 'Test state', pinCode: '560001', country: 'IN', isDefault: true };
  const addressIds: string[] = [];
  let orderId = '', payer = 0, paymentId = '';
  const userIds = users.map(u => u.id);
  t.after(async () => {
    await db.enrollmentPayment.deleteMany({ where: { userId: { in: userIds } } });
    await db.orderEvent.deleteMany({ where: { order: { userId: { in: userIds } } } });
    await db.orderItem.deleteMany({ where: { order: { userId: { in: userIds } } } });
    await db.order.deleteMany({ where: { userId: { in: userIds } } });
    await db.cartItem.deleteMany({ where: { userId: { in: userIds } } });
    await db.wellnessProduct.deleteMany({ where: { categoryId } });
    await db.wellnessCategory.delete({ where: { id: categoryId } });
    await db.user.deleteMany({ where: { id: { in: userIds } } }); await app.close();
  });
  await t.test('discovery, category, search, availability and restricted-product boundaries', async () => {
    assert.equal((await app.inject('/api/v1/wellness/products')).statusCode, 401);
    assert.equal((await call('/wellness/products', undefined, 3)).statusCode, 403);
    assert.equal((await call('/wellness/products/not-an-id')).statusCode, 400);
    assert.equal((await call(`/wellness/products/${restricted.id}`)).statusCode, 404);
    assert.equal((await call(`/wellness/products?category=${categoryId}&q=bottle&available=true`)).json().data.products.length, 1);
    assert.equal((await call(`/wellness/products?category=${categoryId}&q=absent`)).json().data.products.length, 0);
    assert.equal((await call(`/wellness/products?category=${categoryId}&maxPrice=100`)).json().data.products.length, 0);
    const details = (await call(`/wellness/products/${product.id}`)).json().data.product;
    assert.equal(details.availableQuantity, 1); assert.equal(details.soldQuantity, undefined); assert.equal(details.doctorAssociation, null);
    assert.ok((await call('/wellness/categories')).json().data.categories.some((c: { id: string }) => c.id === category.id));
    assert.equal((await call('/admin/wellness/products', base)).statusCode, 403);
    assert.equal((await call('/admin/wellness/products', { ...base, requiresEligibility: true }, 2)).statusCode, 400);
    await assert.rejects(db.wellnessProduct.update({ where: { id: restricted.id }, data: { status: 'ACTIVE' } }));
  });
  await t.test('cart absolute quantities, recalculation, remove and ownership', async () => {
    assert.equal((await call('/me/cart')).json().data.items.length, 0);
    assert.equal((await call('/me/cart/items', { productId: product.id, quantity: 2 })).statusCode, 409);
    assert.equal((await call('/me/cart/items', { productId: restricted.id, quantity: 1 })).statusCode, 404);
    assert.equal((await call('/me/cart/items', { productId: product.id, quantity: 1, pricePaise: 1 })).statusCode, 400);
    const line = (await call('/me/cart/items', { productId: product.id, quantity: 1 })).json().data.items[0];
    await call('/me/cart/items', { productId: product.id, quantity: 1 });
    assert.equal((await call('/me/cart')).json().data.items.length, 1);
    assert.equal((await call(`/me/cart/items/${line.id}`, { quantity: 1 }, 1, 'PATCH')).statusCode, 404);
    await db.wellnessProduct.update({ where: { id: product.id }, data: { pricePaise: 31000 } });
    const refreshed = (await call('/me/cart')).json().data;
    assert.equal(refreshed.items[0].priceChanged, true); assert.equal(refreshed.subtotalPaise, 31000);
    await call(`/me/cart/items/${line.id}`, undefined, 0, 'DELETE');
    assert.equal((await call('/me/cart')).json().data.items.length, 0);
    for (const actor of [0, 1]) assert.equal((await call('/me/cart/items', { productId: product.id, quantity: 1 }, actor)).statusCode, 200);
  });
  await t.test('addresses are validated, owner-scoped, editable and have one default', async () => {
    for (const actor of [0, 1]) addressIds.push((await call('/me/addresses', address, actor)).json().data.address.id);
    assert.equal((await call('/me/addresses')).json().data.addresses.length, 1);
    assert.equal((await call(`/me/addresses/${addressIds[0]}`, address, 1, 'PATCH')).statusCode, 404);
    assert.equal((await call(`/me/addresses/${addressIds[0]}`, undefined, 1, 'DELETE')).statusCode, 404);
    const extra = (await call('/me/addresses', { ...address, line1: 'Other DEMO address' })).json().data.address;
    assert.equal((await call('/me/addresses')).json().data.addresses.filter((a: { isDefault: boolean }) => a.isDefault).length, 1);
    await call(`/me/addresses/${extra.id}`, undefined, 0, 'DELETE');
    assert.equal((await call('/me/addresses')).json().data.addresses[0].isDefault, true);
  });
  await t.test('checkout rejects changed prices and client totals', async () => {
    const quote = (await call('/checkout', { addressId: addressIds[0] })).json().data;
    assert.equal(quote.totalPaise, 36000); assert.equal(quote.deliveryPaise, 5000);
    assert.equal((await call('/checkout', { addressId: addressIds[1] })).statusCode, 404);
    assert.equal((await call('/orders', { addressId: addressIds[0], quote: quote.quote, idempotencyKey: randomUUID(), totalPaise: 1 })).statusCode, 400);
    await db.wellnessProduct.update({ where: { id: product.id }, data: { pricePaise: 32000 } });
    assert.equal((await call('/orders', { addressId: addressIds[0], quote: quote.quote, idempotencyKey: randomUUID() })).statusCode, 409);
    assert.equal(await db.order.count({ where: { userId: { in: userIds } } }), 0);
  });
  await t.test('two buyers reserve the final unit simultaneously; one order succeeds', async () => {
    const quotes = await Promise.all([0, 1].map(async i => (await call('/checkout', { addressId: addressIds[i] }, i)).json().data.quote));
    const keys = [randomUUID(), randomUUID()];
    const results = await Promise.all([0, 1].map(i => call('/orders', { addressId: addressIds[i], quote: quotes[i], idempotencyKey: keys[i] }, i)));
    assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]); payer = results[0]!.statusCode === 200 ? 0 : 1;
    orderId = results[payer]!.json().data.order.id;
    const stock = await db.wellnessProduct.findUniqueOrThrow({ where: { id: product.id } });
    assert.equal(stock.reservedQuantity, 1); assert.equal(stock.stockQuantity, 1);
    const retry = await call('/orders', { addressId: addressIds[payer], quote: quotes[payer], idempotencyKey: keys[payer] }, payer);
    assert.equal(retry.json().data.order.id, orderId);
    const restart = await call('/orders', { addressId: addressIds[payer], quote: quotes[payer], idempotencyKey: randomUUID() }, payer);
    assert.equal(restart.json().data.order.id, orderId);
    assert.equal(await db.order.count({ where: { userId: { in: userIds } } }), 1);
    await assert.rejects(db.wellnessProduct.update({ where: { id: product.id }, data: { reservedQuantity: 2 } }));
  });
  await t.test('payment ownership and replay; one sale, one confirmation', async () => {
    assert.equal((await call(`/me/orders/${orderId}`, undefined, 1 - payer)).statusCode, 404);
    assert.equal((await call(`/orders/${orderId}/payment`, { totalPaise: 1 }, payer)).statusCode, 400);
    const payment = (await call(`/orders/${orderId}/payment`, {}, payer)).json().data.payment;
    paymentId = payment.id; assert.equal(payment.amountPaise, 37000);
    assert.equal((await call(`/orders/${orderId}/payment`, {}, payer)).json().data.payment.id, paymentId);
    assert.equal((await call(`/order-payments/${paymentId}/development-settle`, { outcome: 'capture' }, 1 - payer)).statusCode, 404);
    const results = await Promise.all([1, 2].map(() => call(`/order-payments/${paymentId}/development-settle`, { outcome: 'capture' }, payer)));
    assert.ok(results.every(r => r.statusCode === 200 && r.json().data.order.status === 'CONFIRMED'));
    const stock = await db.wellnessProduct.findUniqueOrThrow({ where: { id: product.id } });
    assert.equal(stock.stockQuantity, 0); assert.equal(stock.reservedQuantity, 0); assert.equal(stock.soldQuantity, 1);
    assert.equal(await db.orderEvent.count({ where: { orderId, status: 'CONFIRMED' } }), 1);
    assert.equal(await db.enrollmentPayment.count({ where: { orderId, status: 'VERIFIED' } }), 1);
    assert.equal((await call(`/order-payments/${paymentId}/development-settle`, { outcome: 'fail' }, payer)).json().data.order.status, 'CONFIRMED');
    assert.equal((await call(`/consultation-payments/${paymentId}/development-settle`, { outcome: 'capture' }, payer)).statusCode, 404);
  });
  await t.test('order snapshots survive catalogue and address changes; private DTO', async () => {
    await db.wellnessProduct.update({ where: { id: product.id }, data: { name: 'Changed catalogue name', pricePaise: 33000 } });
    await call(`/me/addresses/${addressIds[payer]}`, { ...address, line1: 'Changed DEMO address' }, payer, 'PATCH');
    const order = (await call(`/me/orders/${orderId}`, undefined, payer)).json().data.order;
    assert.equal(order.items[0].name, base.name); assert.equal(order.items[0].unitPricePaise, 32000);
    assert.equal(order.addressSnapshot.line1, address.line1); assert.equal(order.payments, undefined); assert.equal(order.userId, undefined); assert.equal(order.requestHash, undefined);
    assert.equal((await call('/me/orders', undefined, 1 - payer)).json().data.orders.length, 0);
  });
  await t.test('cancellation is idempotent, restocks once and records honest refund request', async () => {
    assert.equal((await call(`/orders/${orderId}/cancel`, {}, 1 - payer)).statusCode, 404);
    for (let i = 0; i < 2; i++) {
      const order = (await call(`/orders/${orderId}/cancel`, {}, payer)).json().data.order;
      assert.equal(order.status, 'CANCELLED'); assert.equal(order.refundStatus, 'REQUESTED');
    }
    const stock = await db.wellnessProduct.findUniqueOrThrow({ where: { id: product.id } });
    assert.equal(stock.stockQuantity, 1); assert.equal(stock.soldQuantity, 0);
    assert.equal((await call(`/order-payments/${paymentId}/development-settle`, { outcome: 'capture' }, payer)).json().data.order.status, 'CANCELLED');
  });
  async function newOrder(actor = 0) {
    await call('/me/cart/items', { productId: product.id, quantity: 1 }, actor);
    const quote = (await call('/checkout', { addressId: addressIds[actor] }, actor)).json().data;
    const response = await call('/orders', { addressId: addressIds[actor], quote: quote.quote, idempotencyKey: randomUUID() }, actor);
    assert.equal(response.statusCode, 200, response.body); return response.json().data.order.id as string;
  }
  await t.test('failed and expired payments release stock; late capture cannot claim it', async () => {
    const failedId = await newOrder();
    const payment = (await call(`/orders/${failedId}/payment`, {})).json().data.payment;
    assert.equal((await call(`/order-payments/${payment.id}/development-settle`, { outcome: 'fail' })).json().data.order.status, 'PAYMENT_FAILED');
    assert.equal((await db.wellnessProduct.findUniqueOrThrow({ where: { id: product.id } })).reservedQuantity, 0);
    assert.equal((await call(`/order-payments/${payment.id}/development-settle`, { outcome: 'capture' })).statusCode, 409);
    const expiredId = await newOrder();
    const late = (await call(`/orders/${expiredId}/payment`, {})).json().data.payment;
    await db.order.update({ where: { id: expiredId }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    await new CommerceService(db, env).cleanup();
    assert.equal((await call(`/me/orders/${expiredId}`)).json().data.order.status, 'EXPIRED');
    assert.equal((await call(`/order-payments/${late.id}/development-settle`, { outcome: 'capture' })).statusCode, 409);
    assert.equal((await db.wellnessProduct.findUniqueOrThrow({ where: { id: product.id } })).reservedQuantity, 0);
  });
  await t.test('eligibility revoked after checkout prevents payment confirmation and releases stock', async () => {
    const id = await newOrder(); const payment = (await call(`/orders/${id}/payment`, {})).json().data.payment;
    await db.wellnessProduct.update({ where: { id: product.id }, data: { status: 'DRAFT', requiresEligibility: true } });
    assert.equal((await call(`/order-payments/${payment.id}/development-settle`, { outcome: 'capture' })).json().data.order.status, 'PAYMENT_FAILED');
    assert.equal((await db.wellnessProduct.findUniqueOrThrow({ where: { id: product.id } })).reservedQuantity, 0);
    await db.wellnessProduct.update({ where: { id: product.id }, data: { status: 'ACTIVE', requiresEligibility: false } });
  });
  await t.test('admin catalogue and inventory operations are role restricted and validated', async () => {
    assert.equal((await call('/admin/wellness/products')).statusCode, 403);
    assert.equal((await call('/admin/wellness/products', undefined, 3)).statusCode, 403);
    assert.equal((await call('/admin/wellness/products', undefined, 2)).statusCode, 200);
    assert.equal((await call(`/admin/wellness/products/${product.id}/inventory`, { delta: -2 }, 2)).statusCode, 409);
    assert.equal((await call(`/admin/wellness/products/${product.id}/inventory`, { delta: 1 }, 2)).statusCode, 200);
    assert.equal((await call(`/admin/wellness/products/${product.id}/inventory`, { delta: -1 }, 2)).statusCode, 200);
    assert.equal((await call(`/admin/wellness/products/${product.id}`, { ...base, name: 'DEMO updated by admin' }, 2, 'PATCH')).statusCode, 200);
    assert.equal((await call(`/wellness/products/${product.id}`)).json().data.product.name, 'DEMO updated by admin');
    assert.equal((await call(`/admin/wellness/orders/${orderId}`)).statusCode, 403);
    assert.equal((await call(`/admin/wellness/orders/${orderId}`, undefined, 2)).statusCode, 200);
  });
  await t.test('admin fulfilment is sequential; customer cannot deliver; shipping needs tracking', async () => {
    const id = await newOrder(); const payment = (await call(`/orders/${id}/payment`, {})).json().data.payment;
    await call(`/order-payments/${payment.id}/development-settle`, { outcome: 'capture' });
    assert.equal((await call(`/admin/wellness/orders/${id}/status`, { status: 'DELIVERED' })).statusCode, 403);
    assert.equal((await call(`/admin/wellness/orders/${id}/status`, { status: 'DELIVERED' }, 2)).statusCode, 409);
    for (const status of ['PROCESSING', 'PACKED']) assert.equal((await call(`/admin/wellness/orders/${id}/status`, { status }, 2)).statusCode, 200);
    assert.equal((await call(`/orders/${id}/cancel`, {})).statusCode, 409);
    assert.equal((await call(`/admin/wellness/orders/${id}/status`, { status: 'SHIPPED' }, 2)).statusCode, 409);
    assert.equal((await call(`/admin/wellness/orders/${id}/status`, { status: 'SHIPPED', carrier: 'DEMO carrier', trackingNumber: 'DEMO-ONLY' }, 2)).statusCode, 200);
    for (const status of ['OUT_FOR_DELIVERY', 'DELIVERED']) assert.equal((await call(`/admin/wellness/orders/${id}/status`, { status }, 2)).statusCode, 200);
    assert.equal((await call(`/me/orders/${id}`)).json().data.order.events.at(-1).status, 'DELIVERED');
  });
});
