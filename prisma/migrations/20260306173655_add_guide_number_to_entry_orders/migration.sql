/*
  Warnings:

  - A unique constraint covering the columns `[entry_order_id,product_code,lot_series]` on the table `entry_order_products` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."entry_order_products_entry_order_id_product_code_key";

-- AlterTable
ALTER TABLE "entry_orders" ADD COLUMN     "guide_number" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "entry_order_products_entry_order_id_product_code_lot_series_key" ON "entry_order_products"("entry_order_id", "product_code", "lot_series");
