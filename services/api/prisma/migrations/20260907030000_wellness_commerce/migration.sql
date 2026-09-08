-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'OUT_OF_STOCK', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAYMENT_FAILED', 'EXPIRED', 'CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');

-- AlterTable
ALTER TABLE "EnrollmentPayment" ADD COLUMN     "orderId" UUID;

-- CreateTable
CREATE TABLE "WellnessCategory" (
    "id" VARCHAR(60) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WellnessCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellnessProduct" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "sku" VARCHAR(80) NOT NULL,
    "shortDescription" VARCHAR(400) NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" VARCHAR(60) NOT NULL,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pricePaise" INTEGER NOT NULL,
    "mrpPaise" INTEGER,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "brand" VARCHAR(100) NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "ingredients" TEXT NOT NULL,
    "usage" TEXT NOT NULL,
    "warnings" TEXT NOT NULL,
    "storage" TEXT NOT NULL,
    "quantityLabel" VARCHAR(100) NOT NULL,
    "shippingEligible" BOOLEAN NOT NULL DEFAULT false,
    "requiresEligibility" BOOLEAN NOT NULL DEFAULT true,
    "contentApproved" BOOLEAN NOT NULL DEFAULT false,
    "returnPolicy" TEXT NOT NULL,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "collection" VARCHAR(100) NOT NULL DEFAULT '',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "doctorId" UUID,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "soldQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WellnessProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "observedPricePaise" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fullName" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(16) NOT NULL,
    "line1" VARCHAR(200) NOT NULL,
    "line2" VARCHAR(200) NOT NULL DEFAULT '',
    "city" VARCHAR(100) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "pinCode" VARCHAR(6) NOT NULL,
    "country" VARCHAR(2) NOT NULL DEFAULT 'IN',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "subtotalPaise" INTEGER NOT NULL,
    "deliveryPaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL DEFAULT 0,
    "totalPaise" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "addressSnapshot" JSONB NOT NULL,
    "isDemo" BOOLEAN NOT NULL,
    "holdExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "refundStatus" VARCHAR(30) NOT NULL DEFAULT 'NOT_REQUIRED',
    "carrier" TEXT,
    "trackingNumber" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "unitPricePaise" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "returnPolicy" TEXT NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WellnessCategory_name_key" ON "WellnessCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "WellnessProduct_slug_key" ON "WellnessProduct"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "WellnessProduct_sku_key" ON "WellnessProduct"("sku");

-- CreateIndex
CREATE INDEX "WellnessProduct_status_categoryId_idx" ON "WellnessProduct"("status", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_userId_productId_key" ON "CartItem"("userId", "productId");

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "Address"("userId");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_holdExpiresAt_idx" ON "Order"("status", "holdExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_userId_idempotencyKey_key" ON "Order"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_productId_key" ON "OrderItem"("orderId", "productId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "EnrollmentPayment_orderId_status_idx" ON "EnrollmentPayment"("orderId", "status");

-- AddForeignKey
ALTER TABLE "EnrollmentPayment" ADD CONSTRAINT "EnrollmentPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessProduct" ADD CONSTRAINT "WellnessProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "WellnessCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessProduct" ADD CONSTRAINT "WellnessProduct_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "WellnessProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "WellnessProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Server-controlled monetary values and stock invariants.
ALTER TABLE "EnrollmentPayment" DROP CONSTRAINT "payment_one_target";
ALTER TABLE "EnrollmentPayment" ADD CONSTRAINT "payment_one_target" CHECK (
  ("programId" IS NOT NULL)::int + ("consultationId" IS NOT NULL)::int + ("orderId" IS NOT NULL)::int = 1
);
ALTER TABLE "WellnessProduct" ADD CONSTRAINT "wellness_inventory_valid" CHECK (
  "stockQuantity" >= 0 AND "reservedQuantity" >= 0 AND "soldQuantity" >= 0 AND "reservedQuantity" <= "stockQuantity"
);
ALTER TABLE "WellnessProduct" ADD CONSTRAINT "wellness_price_valid" CHECK (
  "pricePaise" > 0 AND ("mrpPaise" IS NULL OR "mrpPaise" >= "pricePaise")
);
ALTER TABLE "WellnessProduct" ADD CONSTRAINT "wellness_active_eligibility" CHECK (
  "status" <> 'ACTIVE' OR ("contentApproved" AND NOT "requiresEligibility")
);
ALTER TABLE "CartItem" ADD CONSTRAINT "cart_quantity_valid" CHECK ("quantity" BETWEEN 1 AND 10 AND "observedPricePaise" > 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "order_item_valid" CHECK ("quantity" BETWEEN 1 AND 10 AND "unitPricePaise" > 0);
ALTER TABLE "Order" ADD CONSTRAINT "order_amount_valid" CHECK (
  "subtotalPaise" >= 0 AND "deliveryPaise" >= 0 AND "discountPaise" >= 0 AND "totalPaise" > 0
  AND "totalPaise" = "subtotalPaise" + "deliveryPaise" - "discountPaise"
);
ALTER TABLE "Address" ADD CONSTRAINT "address_market_valid" CHECK ("country" = 'IN' AND "pinCode" ~ '^[1-9][0-9]{5}$');
CREATE UNIQUE INDEX "address_one_default" ON "Address"("userId") WHERE "isDefault" = true;
