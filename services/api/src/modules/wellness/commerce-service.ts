import { createHash } from 'node:crypto';
import type { PrismaClient, Prisma, WellnessProduct, OrderStatus } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { benefitsFor, requireEntitlement, entitled, memberPrice } from '../membership/entitlements.js';
import { discountPrice } from '../membership/contracts.js';
import { ApiError } from '../../errors/api-error.js';
import { DevelopmentPaymentProvider, receiptMatches } from '../programs/payment-provider.js';
import { CommerceAnalytics, DemoShippingProvider, type AddressInput, type ProductInput } from './contracts.js';
import type { z } from 'zod';
import type { discoveryInput } from './contracts.js';

type Tx = Prisma.TransactionClient;
const includeOrder = { items: true, events: { orderBy: { createdAt: 'asc' as const } }, payments: true };
type FullOrder = Prisma.OrderGetPayload<{ include: typeof includeOrder }>;
const missing = () => new ApiError(404, 'NOT_FOUND', 'This item is not available.');
const conflict = (code: string, message: string) => new ApiError(409, code, message);
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function visibleWellnessWhere(env: Environment): Prisma.WellnessProductWhereInput {
  return { status: 'ACTIVE', contentApproved: true, requiresEligibility: false, ...(env.DEMO_WELLNESS === 'true' ? {} : { isDemo: false }) };
}

export class CommerceService {
  readonly analytics = new CommerceAnalytics();
  constructor(private db: PrismaClient, private env: Environment, private now = () => new Date()) {}
  private visible(p: WellnessProduct) {
    return p.status === 'ACTIVE' && p.contentApproved && !p.requiresEligibility && (!p.isDemo || this.env.DEMO_WELLNESS === 'true');
  }
  private where(): Prisma.WellnessProductWhereInput {
    return visibleWellnessWhere(this.env);
  }
  private productDto(p: WellnessProduct & { category?: { name: string } }) {
    const { stockQuantity, reservedQuantity, soldQuantity, contentApproved, doctorId, ...safe } = p;
    return { ...safe, availableQuantity: Math.max(0, stockQuantity - reservedQuantity),
      doctorAssociation: doctorId ? 'Featured in Pocket Doctor Wellness; no prescription or endorsement is implied.' : null };
  }
  // One transaction-scoped advisory lock coordinates the modest curated catalogue.
  // All stock/order/admin mutations use this boundary. SQL constraints are a second guard.
  // A future high-volume implementation can replace it with sorted per-SKU locks.
  private async atomic<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(740004)`;
      await this.expire(tx);
      return work(tx);
    }, { maxWait: 10000, timeout: 20000 });
  }
  private async release(tx: Tx, order: FullOrder, status: 'EXPIRED' | 'PAYMENT_FAILED' | 'CANCELLED') {
    for (const item of order.items) await tx.wellnessProduct.update({ where: { id: item.productId }, data: { reservedQuantity: { decrement: item.quantity } } });
    await tx.enrollmentPayment.updateMany({ where: { orderId: order.id, status: 'PENDING' }, data: { status: 'FAILED' } });
    await tx.order.update({ where: { id: order.id }, data: { status, events: { create: { status } } } });
  }
  private async expire(tx: Tx) {
    const expired = await tx.order.findMany({ where: { status: 'PENDING_PAYMENT', holdExpiresAt: { lte: this.now() } }, include: includeOrder });
    for (const order of expired) await this.release(tx, order, 'EXPIRED');
  }
  async cleanup() { await this.atomic(async () => undefined); }
  async discover(query: z.infer<typeof discoveryInput>) {
    await this.cleanup();
    const where: Prisma.WellnessProductWhereInput = { ...this.where(), ...(query.category ? { categoryId: query.category } : {}),
      ...(query.featured === 'true' ? { featured: true } : {}), ...(query.collection ? { collection: query.collection } : {}),
      pricePaise: { ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}), ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}) },
      ...(query.q ? { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { description: { contains: query.q, mode: 'insensitive' } },
        { brand: { contains: query.q, mode: 'insensitive' } }, { category: { name: { contains: query.q, mode: 'insensitive' } } }] } : {}),
      ...(query.available === 'true' ? { stockQuantity: { gt: this.db.wellnessProduct.fields.reservedQuantity } } : {}) };
    const [products, total, collections] = await Promise.all([this.db.wellnessProduct.findMany({ where, include: { category: true },
      orderBy: query.sort === 'price' ? [{ pricePaise: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'asc' }], skip: (query.page - 1) * 20, take: 20 }), this.db.wellnessProduct.count({ where }),
      this.db.wellnessProduct.findMany({ where: { ...this.where(), collection: { not: '' } }, select: { collection: true }, distinct: ['collection'], orderBy: { collection: 'asc' }, take: 30 })]);
    if (query.q) this.analytics.record('product_search');
    return { products: products.map(p => this.productDto(p)), total, page: query.page, collections: collections.map(c => c.collection) };
  }
  categories() { return this.db.wellnessCategory.findMany({ orderBy: { position: 'asc' } }); }
  async product(id: string, userId?: string) {
    await this.cleanup();
    const p = await this.db.wellnessProduct.findFirst({ where: { ...this.where(), id }, include: { category: true } });
    if (!p) throw missing();
    const memberPricePaise = userId ? await memberPrice(this.db, this.env, userId, 'WELLNESS_MEMBER_PRICING', p.pricePaise, id) : p.pricePaise;
    const membershipRequired = p.membershipOnly && (!userId || !await entitled(this.db, this.env, userId, 'MEMBER_PRODUCTS', id));
    this.analytics.record('product_viewed'); return { ...this.productDto(p), memberPricePaise, membershipRequired };
  }
  private async cartDto(tx: Tx, userId: string) {
    const rows = await tx.cartItem.findMany({ where: { userId }, include: { product: { include: { category: true } } }, orderBy: { id: 'asc' } });
    const benefits = await benefitsFor(tx, this.env, userId);
    const items = rows.map(row => {
      const p = row.product;
      const benefit = benefits.find(b => b.key === 'WELLNESS_MEMBER_PRICING' && b.resourceIds.includes(p.id));
      const price = benefit ? discountPrice(p.pricePaise, 'PERCENT', benefit.value) : p.pricePaise;
      const allowed = !p.membershipOnly || benefits.some(b => b.key === 'MEMBER_PRODUCTS' && b.resourceIds.includes(p.id));
      const available = allowed && this.visible(p) && p.shippingEligible && p.stockQuantity - p.reservedQuantity >= row.quantity;
      return { id: row.id, quantity: row.quantity, product: this.visible(p) ? this.productDto(p) : null,
        productId: p.id, available, priceChanged: price !== row.observedPricePaise,
        unitPricePaise: this.visible(p) ? price : 0 };
    });
    return { items, subtotalPaise: items.reduce((sum, i) => sum + i.quantity * i.unitPricePaise, 0), currency: 'INR',
      canCheckout: items.length > 0 && items.every(i => i.available) };
  }
  cart(userId: string) { this.analytics.record('cart_started'); return this.atomic(tx => this.cartDto(tx, userId)); }
  async setCart(userId: string, productId: string, quantity: number) {
    const result = await this.atomic(async tx => {
      const p = await tx.wellnessProduct.findUnique({ where: { id: productId } });
      if (!p || !this.visible(p)) throw missing();
      if (p.membershipOnly) await requireEntitlement(tx, this.env, userId, 'MEMBER_PRODUCTS', productId);
      if (!p.shippingEligible || p.stockQuantity - p.reservedQuantity < quantity) throw conflict('STOCK_CHANGED', 'The available quantity has changed. Please refresh your cart.');
      const existing = await tx.cartItem.findUnique({ where: { userId_productId: { userId, productId } } });
      if (!existing && await tx.cartItem.count({ where: { userId } }) >= 20) throw conflict('CART_LIMIT', 'Your cart can contain up to 20 products.');
      const observedPricePaise = await memberPrice(tx, this.env, userId, 'WELLNESS_MEMBER_PRICING', p.pricePaise, productId);
      await tx.cartItem.upsert({ where: { userId_productId: { userId, productId } }, create: { userId, productId, quantity, observedPricePaise }, update: { quantity, observedPricePaise } });
      return this.cartDto(tx, userId);
    }); this.analytics.record('product_added_to_cart'); return result;
  }
  removeCart(userId: string, id: string) { return this.atomic(async tx => {
    await tx.cartItem.deleteMany({ where: { id, userId } }); return this.cartDto(tx, userId);
  }); }
  addresses(userId: string) { return this.db.address.findMany({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] }); }
  saveAddress(userId: string, input: AddressInput, id?: string) { return this.atomic(async tx => {
    if (id && !await tx.address.findFirst({ where: { id, userId } })) throw missing();
    const count = await tx.address.count({ where: { userId } });
    if (!id && count >= 10) throw conflict('ADDRESS_LIMIT', 'You can save up to 10 addresses.');
    const data = { ...input, isDefault: input.isDefault || count === 0 };
    if (data.isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return id ? tx.address.update({ where: { id }, data }) : tx.address.create({ data: { ...data, userId } });
  }); }
  deleteAddress(userId: string, id: string) { return this.atomic(async tx => {
    if (!await tx.address.findFirst({ where: { id, userId } })) throw missing();
    await tx.address.delete({ where: { id } });
    if (!await tx.address.findFirst({ where: { userId, isDefault: true } })) {
      const next = await tx.address.findFirst({ where: { userId }, orderBy: { id: 'asc' } });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    } return { deleted: true };
  }); }
  private async quote(tx: Tx, userId: string, addressId: string) {
    const address = await tx.address.findFirst({ where: { id: addressId, userId } });
    if (!address) throw missing();
    const cart = await this.cartDto(tx, userId);
    if (!cart.canCheckout) throw conflict('CART_CHANGED', 'Review your cart. Some products or quantities are no longer available.');
    const isDemo = cart.items.every(i => i.product?.isDemo);
    if (!isDemo || this.env.DEMO_WELLNESS !== 'true' || this.env.PAYMENT_MODE !== 'development') throw new ApiError(503, 'COMMERCE_UNAVAILABLE', 'Ordering will open when payment and delivery services are ready.');
    const { userId: _owner, id: _id, isDefault: _default, ...addressSnapshot } = address;
    const shipping = new DemoShippingProvider().quote({ ...address, country: 'IN' });
    const totalPaise = cart.subtotalPaise + shipping.feePaise;
    const quote = digest({ items: cart.items.map(i => [i.productId, i.quantity, i.unitPricePaise, i.product?.name, i.product?.sku, i.product?.quantityLabel, i.product?.returnPolicy]), addressSnapshot, totalPaise });
    return { ...cart, addressSnapshot, deliveryPaise: shipping.feePaise, discountPaise: 0, totalPaise, quote, isDemo, deliveryInformation: shipping.information };
  }
  checkout(userId: string, addressId: string) { return this.atomic(tx => this.quote(tx, userId, addressId)); }
  private dto(order: FullOrder) {
    const { userId, requestHash, idempotencyKey, payments, ...safe } = order;
    return { ...safe, orderNumber: `PD-${order.id.toUpperCase()}`, paymentStatus: payments.some(p => p.status === 'VERIFIED') ? 'VERIFIED' : order.status === 'PENDING_PAYMENT' ? 'PENDING' : 'FAILED',
      cancellable: order.status === 'PENDING_PAYMENT' || (order.status === 'CONFIRMED' && this.env.ORDER_CANCEL_CONFIRMED === 'true'),
      deliveryInformation: order.isDemo ? 'DEMO order. No physical delivery will take place.' : 'Delivery information will appear when confirmed by the shipping provider.' };
  }
  private async owned(tx: Tx, userId: string, id: string) {
    const order = await tx.order.findFirst({ where: { id, userId }, include: includeOrder });
    if (!order) throw missing(); return order;
  }
  async createOrder(userId: string, addressId: string, quote: string, key: string) {
    const requestHash = digest({ addressId, quote });
    const result = await this.atomic(async tx => {
      const existing = await tx.order.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: key } }, include: includeOrder });
      if (existing) {
        if (existing.requestHash !== requestHash) throw conflict('CHECKOUT_CHANGED', 'This checkout changed. Please review it again.');
        return this.dto(existing);
      }
      const pending = await tx.order.findFirst({ where: { userId, requestHash, status: 'PENDING_PAYMENT' }, include: includeOrder });
      if (pending) return this.dto(pending);
      const current = await this.quote(tx, userId, addressId);
      if (current.quote !== quote) throw conflict('CHECKOUT_CHANGED', 'Prices, stock or address details changed. Review the updated checkout.');
      for (const item of current.items) {
        const reserved = await tx.wellnessProduct.updateMany({ where: { id: item.productId, stockQuantity: { gte: item.quantity } }, data: { reservedQuantity: { increment: item.quantity } } });
        // The global lock and quote check establish available stock; SQL CHECK also rejects over-reservation.
        if (reserved.count !== 1) throw conflict('STOCK_CHANGED', 'The available quantity has changed.');
      }
      return this.dto(await tx.order.create({ data: { userId, idempotencyKey: key, requestHash, subtotalPaise: current.subtotalPaise,
        deliveryPaise: current.deliveryPaise, totalPaise: current.totalPaise, addressSnapshot: current.addressSnapshot, isDemo: current.isDemo,
        holdExpiresAt: new Date(this.now().getTime() + this.env.ORDER_HOLD_MINUTES * 60000),
        items: { create: current.items.map(i => ({ productId: i.productId, name: i.product!.name, sku: i.product!.sku, unitPricePaise: i.unitPricePaise, quantity: i.quantity, returnPolicy: i.product!.returnPolicy })) },
        events: { create: { status: 'PENDING_PAYMENT' } } }, include: includeOrder }));
    }); this.analytics.record('checkout_started'); return result;
  }
  mine(userId: string, page = 1) { return this.atomic(async tx => ({ orders: (await tx.order.findMany({ where: { userId }, include: includeOrder, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 20, take: 20 })).map(o => this.dto(o)), total: await tx.order.count({ where: { userId } }), page })); }
  detail(userId: string, id: string) { return this.atomic(async tx => this.dto(await this.owned(tx, userId, id))); }
  adminDetail(id: string) { return this.atomic(async tx => {
    const order = await tx.order.findUnique({ where: { id }, include: includeOrder });
    if (!order) throw missing(); return this.dto(order);
  }); }
  payment(userId: string, id: string) { return this.atomic(async tx => {
    const order = await this.owned(tx, userId, id);
    if (order.status !== 'PENDING_PAYMENT') throw conflict('ORDER_STATE', 'This order is no longer awaiting payment.');
    if (!order.isDemo || this.env.DEMO_WELLNESS !== 'true' || this.env.PAYMENT_MODE !== 'development') throw new ApiError(503, 'PAYMENT_UNAVAILABLE', 'Payments are not available yet.');
    const payment = order.payments.find(p => p.status === 'PENDING') ?? await tx.enrollmentPayment.create({ data: { userId, orderId: id, amountPaise: order.totalPaise, currency: order.currency, provider: 'development' } });
    return { id: payment.id, amountPaise: payment.amountPaise, currency: payment.currency, mode: 'development' };
  }); }
  async settle(userId: string, paymentId: string, outcome: 'capture' | 'fail') {
    let completed = false;
    const result = await this.atomic(async tx => {
      const payment = await tx.enrollmentPayment.findFirst({ where: { id: paymentId, userId, orderId: { not: null } } });
      if (!payment?.orderId) throw missing();
      const order = await this.owned(tx, userId, payment.orderId);
      if (!order.isDemo || this.env.DEMO_WELLNESS !== 'true' || payment.provider !== 'development') throw missing();
      const provider = new DevelopmentPaymentProvider(this.env, payment, outcome);
      if (payment.status === 'VERIFIED') return this.dto(order);
      if (payment.status !== 'PENDING' || order.status !== 'PENDING_PAYMENT') throw conflict('ORDER_STATE', 'This payment is no longer active. Return to your cart to try again.');
      const products = await tx.wellnessProduct.findMany({ where: { id: { in: order.items.map(i => i.productId) } } });
      const benefits = await benefitsFor(tx, this.env, userId);
      if (products.some(p => !this.visible(p) || !p.shippingEligible || !p.isDemo || (p.membershipOnly && !benefits.some(b => b.key === 'MEMBER_PRODUCTS' && b.resourceIds.includes(p.id))))) {
        await this.release(tx, order, 'PAYMENT_FAILED');
        return this.dto(await this.owned(tx, userId, order.id));
      }
      const receipt = await provider.verify(payment.id);
      if (payment.amountPaise !== order.totalPaise || payment.currency !== order.currency || !receiptMatches(payment, receipt)) {
        await this.release(tx, order, 'PAYMENT_FAILED');
        return this.dto(await this.owned(tx, userId, order.id));
      }
      for (const item of order.items) {
        await tx.wellnessProduct.update({ where: { id: item.productId }, data: { stockQuantity: { decrement: item.quantity }, reservedQuantity: { decrement: item.quantity }, soldQuantity: { increment: item.quantity } } });
        await tx.cartItem.deleteMany({ where: { userId, productId: item.productId, quantity: item.quantity, observedPricePaise: item.unitPricePaise } });
      }
      await tx.enrollmentPayment.update({ where: { id: payment.id }, data: { status: 'VERIFIED', verifiedAt: this.now(), providerReference: receipt.reference } });
      await tx.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED', events: { create: { status: 'CONFIRMED' } } } });
      completed = true;
      return this.dto(await this.owned(tx, userId, order.id));
    }); if (completed) this.analytics.record('order_completed'); return result;
  }
  cancel(userId: string, id: string) { return this.atomic(async tx => {
    const order = await this.owned(tx, userId, id);
    if (order.status === 'CANCELLED') return this.dto(order);
    if (order.status === 'PENDING_PAYMENT') await this.release(tx, order, 'CANCELLED');
    else if (order.status === 'CONFIRMED' && this.env.ORDER_CANCEL_CONFIRMED === 'true') {
      for (const item of order.items) await tx.wellnessProduct.update({ where: { id: item.productId }, data: { stockQuantity: { increment: item.quantity }, soldQuantity: { decrement: item.quantity } } });
      await tx.order.update({ where: { id }, data: { status: 'CANCELLED', refundStatus: 'REQUESTED', events: { create: { status: 'CANCELLED' } } } });
    } else throw conflict('CANCELLATION_POLICY', 'This order can no longer be cancelled here. Please contact support.');
    return this.dto(await this.owned(tx, userId, id));
  }); }
  // Called only behind ADMIN authorization. No customer write route accepts order status.
  transition(id: string, status: OrderStatus, carrier?: string, trackingNumber?: string) { return this.atomic(async tx => {
    const order = await tx.order.findUnique({ where: { id }, include: includeOrder }); if (!order) throw missing();
    const next: Partial<Record<OrderStatus, OrderStatus>> = { CONFIRMED: 'PROCESSING', PROCESSING: 'PACKED', PACKED: 'SHIPPED', SHIPPED: 'OUT_FOR_DELIVERY', OUT_FOR_DELIVERY: 'DELIVERED' };
    if (order.status === status) return this.dto(order);
    if (next[order.status] !== status) throw conflict('ORDER_STATE', 'This order transition is not permitted.');
    if (status === 'SHIPPED' && (!carrier || !trackingNumber)) throw conflict('SHIPPING_REQUIRED', 'Carrier and tracking information are required.');
    return this.dto(await tx.order.update({ where: { id }, data: { status, ...(status === 'SHIPPED' ? { carrier: carrier!, trackingNumber: trackingNumber! } : {}), events: { create: { status } } }, include: includeOrder }));
  }); }
  saveProduct(input: ProductInput, id?: string) { return this.atomic(async tx => {
    if (input.isDemo && this.env.DEMO_WELLNESS !== 'true') throw conflict('DEMO_DISABLED', 'Demo products are disabled.');
    if (!await tx.wellnessCategory.findUnique({ where: { id: input.categoryId } })) throw missing();
    if (input.doctorId && !await tx.doctor.findUnique({ where: { id: input.doctorId } })) throw missing();
    if (id && !await tx.wellnessProduct.findUnique({ where: { id } })) throw missing();
    const duplicate = await tx.wellnessProduct.findFirst({ where: { OR: [{ sku: input.sku }, { slug: input.slug }], ...(id ? { id: { not: id } } : {}) } });
    if (duplicate) throw conflict('PRODUCT_CONFLICT', 'SKU and slug must be unique.');
    const { membershipOnly, ...fields } = input;
    const data = { ...fields, ...(membershipOnly === undefined ? {} : { membershipOnly }) };
    return id ? tx.wellnessProduct.update({ where: { id }, data }) : tx.wellnessProduct.create({ data });
  }); }
  inventory(id: string, delta: number) { return this.atomic(async tx => {
    const product = await tx.wellnessProduct.findUnique({ where: { id } }); if (!product) throw missing();
    if (product.stockQuantity + delta < product.reservedQuantity || product.stockQuantity + delta > 1000000) throw conflict('STOCK_CHANGED', 'Stock cannot be reduced below existing reservations or exceed the stock limit.');
    return tx.wellnessProduct.update({ where: { id }, data: { stockQuantity: { increment: delta } } });
  }); }
  saveCategory(id: string, name: string, position: number) { return this.atomic(async tx => {
    const duplicate = await tx.wellnessCategory.findFirst({ where: { name, id: { not: id } } });
    if (duplicate) throw conflict('CATEGORY_CONFLICT', 'Category names must be unique.');
    return tx.wellnessCategory.upsert({ where: { id }, create: { id, name, position }, update: { name, position } });
  }); }
}
