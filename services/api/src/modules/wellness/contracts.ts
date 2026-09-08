import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
export const addressInput = z.object({ fullName: text(100), phone: z.string().regex(/^\+91[6-9]\d{9}$/),
  line1: text(200), line2: z.string().trim().max(200).default(''), city: text(100), state: text(100),
  pinCode: z.string().regex(/^[1-9]\d{5}$/), country: z.literal('IN'), isDefault: z.boolean() }).strict();
export const productInput = z.object({ name: text(160), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
  sku: text(80), shortDescription: text(400), description: text(10000), categoryId: text(60),
  images: z.array(z.url().refine(v => new URL(v).protocol === 'https:')).max(6),
  pricePaise: z.number().int().min(1).max(10000000), mrpPaise: z.number().int().min(1).max(10000000).nullable(),
  status: z.enum(['DRAFT', 'ACTIVE', 'OUT_OF_STOCK', 'INACTIVE', 'ARCHIVED']), brand: text(100),
  manufacturer: text(1000), ingredients: text(2000), usage: text(3000), warnings: text(3000), storage: text(1000),
  quantityLabel: text(100), shippingEligible: z.boolean(), requiresEligibility: z.boolean(), contentApproved: z.boolean(),
  returnPolicy: text(2000), featured: z.boolean(), collection: z.string().trim().max(100), isDemo: z.boolean(),
  doctorId: z.string().uuid().nullable(), membershipOnly: z.boolean().optional(),
}).strict().refine(p => p.mrpPaise === null || p.mrpPaise >= p.pricePaise, 'MRP cannot be less than price')
  .refine(p => p.status !== 'ACTIVE' || (p.contentApproved && !p.requiresEligibility), 'Active catalogue requires reviewed unrestricted products');
export type AddressInput = z.infer<typeof addressInput>;
export type ProductInput = z.infer<typeof productInput>;
export const discoveryInput = z.object({ q: z.string().trim().max(100).optional(), category: z.string().max(60).optional(),
  minPrice: z.coerce.number().int().min(0).max(10000000).optional(), maxPrice: z.coerce.number().int().min(0).max(10000000).optional(),
  available: z.enum(['true', 'false']).optional(), featured: z.enum(['true', 'false']).optional(),
  collection: z.string().max(100).optional(), sort: z.enum(['newest', 'price']).optional(), page: z.coerce.number().int().min(1).max(1000).default(1),
}).strict();

// A logistics adapter can replace this boundary. No dispatch or delivery promise.
export interface ShippingProvider { quote(address: AddressInput): { feePaise: number; information: string } }
export class DemoShippingProvider implements ShippingProvider {
  quote(_address: AddressInput) { return { feePaise: 5000, information: 'DEMO shipping fee. No physical delivery will take place.' }; }
}
export type CommerceEvent = 'product_viewed' | 'product_search' | 'product_added_to_cart' | 'cart_started' | 'checkout_started' | 'order_completed';
export class CommerceAnalytics {
  private totals = new Map<CommerceEvent, number>();
  record(event: CommerceEvent) { this.totals.set(event, (this.totals.get(event) ?? 0) + 1); }
  snapshot() { return Object.fromEntries(this.totals); }
}
