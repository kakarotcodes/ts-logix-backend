-- AlterEnum: Update OrderStatusEntry enum values
-- Change from REVISION, PRESENTACION, FINALIZACION to PENDIENTE, APROBADO, RECIBIDO, TERMINADO

-- Step 1: Create new enum type with new values
CREATE TYPE "OrderStatusEntry_new" AS ENUM ('PENDIENTE', 'APROBADO', 'RECIBIDO', 'TERMINADO');

-- Step 2: Add temporary column
ALTER TABLE "EntryOrder" ADD COLUMN "order_status_new" "OrderStatusEntry_new";

-- Step 3: Migrate existing data with mapping:
-- REVISION -> PENDIENTE (most common initial state)
-- PRESENTACION -> APROBADO (approved state)
-- FINALIZACION -> TERMINADO (completed state)
UPDATE "EntryOrder"
SET "order_status_new" = CASE
  WHEN "order_status"::text = 'REVISION' THEN 'PENDIENTE'::"OrderStatusEntry_new"
  WHEN "order_status"::text = 'PRESENTACION' THEN 'APROBADO'::"OrderStatusEntry_new"
  WHEN "order_status"::text = 'FINALIZACION' THEN 'TERMINADO'::"OrderStatusEntry_new"
  ELSE 'PENDIENTE'::"OrderStatusEntry_new"
END;

-- Step 4: Drop old column and enum
ALTER TABLE "EntryOrder" DROP COLUMN "order_status";
DROP TYPE "OrderStatusEntry";

-- Step 5: Rename new type and column
ALTER TYPE "OrderStatusEntry_new" RENAME TO "OrderStatusEntry";
ALTER TABLE "EntryOrder" RENAME COLUMN "order_status_new" TO "order_status";

-- Step 6: Set NOT NULL and default
ALTER TABLE "EntryOrder" ALTER COLUMN "order_status" SET NOT NULL;
ALTER TABLE "EntryOrder" ALTER COLUMN "order_status" SET DEFAULT 'PENDIENTE';
