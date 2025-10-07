-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('ADMIN', 'WAREHOUSE_INCHARGE', 'PHARMACIST', 'WAREHOUSE_ASSISTANT', 'CLIENT');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('JURIDICO', 'NATURAL');

-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('PRIVADA', 'PUBLICA');

-- CreateEnum
CREATE TYPE "EstablishmentType" AS ENUM ('SELECCIONAR', 'ALMACEN_ESPECIALIZADO', 'BOTICA', 'BOTIQUIN', 'DROGUERIA', 'FARMACIA', 'OTROS');

-- CreateEnum
CREATE TYPE "PackagingStatus" AS ENUM ('NORMAL', 'PARTIALLY_DAMAGED', 'DAMAGED');

-- CreateEnum
CREATE TYPE "PackagingType" AS ENUM ('PALET', 'BOX', 'SACK', 'UNIT', 'PACK', 'BARRELS', 'BUNDLE', 'OTHER');

-- CreateEnum
CREATE TYPE "OriginType" AS ENUM ('COMPRA_LOCAL', 'IMPORTACION', 'DEVOLUCION', 'ACONDICIONADO', 'TRANSFERENCIA_INTERNA', 'FRACCIONADO');

-- CreateEnum
CREATE TYPE "DocumentTypeEntry" AS ENUM ('PACKING_LIST', 'FACTURA', 'CERTIFICADO_ANALISIS', 'RRSS', 'PERMISO_ESPECIAL', 'OTRO');

-- CreateEnum
CREATE TYPE "DocumentTypeDeparture" AS ENUM ('INVOICE', 'DELIVERY_NOTE', 'TRANSFER_RECEIPT', 'SHIPPING_MANIFEST', 'CUSTOMS_DECLARATION', 'OTRO');

-- CreateEnum
CREATE TYPE "OrderStatusEntry" AS ENUM ('REVISION', 'PRESENTACION', 'FINALIZACION');

-- CreateEnum
CREATE TYPE "OrderStatusDeparture" AS ENUM ('PENDING', 'APPROVED', 'REVISION', 'REJECTED', 'PARTIALLY_DISPATCHED', 'DISPATCHED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PresentationType" AS ENUM ('CAJA', 'PALETA', 'SACO', 'UNIDAD', 'PAQUETE', 'TAMBOS', 'BULTO', 'OTRO');

-- CreateEnum
CREATE TYPE "TemperatureRangeType" AS ENUM ('RANGE_15_30', 'RANGE_15_25', 'RANGE_2_8', 'AMBIENTE');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('PAL_NORMAL', 'CAJ_NORMAL', 'SAC_NORMAL', 'UNI_NORMAL', 'PAQ_NORMAL', 'TAM_NORMAL', 'BUL_NORMAL', 'OTR_NORMAL', 'PAL_DANADA', 'CAJ_DANADA', 'SAC_DANADO', 'UNI_DANADA', 'PAQ_DANADO', 'TAM_DANADO', 'BUL_DANADO', 'OTR_DANADO');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_REVISION');

-- CreateEnum
CREATE TYPE "CellKind" AS ENUM ('NORMAL', 'DAMAGED', 'TRANSFER', 'RESERVED');

-- CreateEnum
CREATE TYPE "CellStatus" AS ENUM ('AVAILABLE', 'OCCUPIED');

-- CreateEnum
CREATE TYPE "CellRole" AS ENUM ('STANDARD', 'DAMAGED', 'EXPIRED', 'RETURNS', 'SAMPLES', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentApplicableTo" AS ENUM ('ENTRY', 'DEPARTURE');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('STORAGE', 'LOADING', 'UNLOADING', 'TRANSIT', 'REPACKAGING', 'INSPECTION', 'RETURN', 'REPAIR', 'WAREHOUSE', 'DISTRIBUTION');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('ENTRY', 'DEPARTURE', 'TRANSFER', 'ADJUSTMENT', 'RETURN', 'DISPOSAL', 'RECALL', 'INSPECTION');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'HOLD', 'DAMAGED', 'DEPLETED', 'EXPIRED', 'IN_TRANSIT', 'PENDING_INSPECTION', 'QUARANTINED', 'RETURNED', 'DISPOSED');

-- CreateEnum
CREATE TYPE "QualityControlStatus" AS ENUM ('CUARENTENA', 'APROBADO', 'DEVOLUCIONES', 'CONTRAMUESTRAS', 'RECHAZADOS');

-- CreateEnum
CREATE TYPE "SystemAction" AS ENUM ('USER_LOGIN', 'USER_LOGOUT', 'USER_LOGIN_FAILED', 'USER_SESSION_EXPIRED', 'USER_PASSWORD_CHANGED', 'USER_PROFILE_UPDATED', 'USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_ACTIVATED', 'USER_DEACTIVATED', 'USER_ROLE_CHANGED', 'ENTRY_ORDER_CREATED', 'ENTRY_ORDER_UPDATED', 'ENTRY_ORDER_DELETED', 'ENTRY_ORDER_REVIEWED', 'ENTRY_ORDER_APPROVED', 'ENTRY_ORDER_REJECTED', 'ENTRY_ORDER_STATUS_CHANGED', 'ENTRY_ORDER_PRODUCT_ADDED', 'ENTRY_ORDER_PRODUCT_UPDATED', 'ENTRY_ORDER_PRODUCT_REMOVED', 'DEPARTURE_ORDER_CREATED', 'DEPARTURE_ORDER_UPDATED', 'DEPARTURE_ORDER_DELETED', 'DEPARTURE_ORDER_REVIEWED', 'DEPARTURE_ORDER_APPROVED', 'DEPARTURE_ORDER_REJECTED', 'DEPARTURE_ORDER_STATUS_CHANGED', 'DEPARTURE_ORDER_PRODUCT_ADDED', 'DEPARTURE_ORDER_PRODUCT_UPDATED', 'DEPARTURE_ORDER_PRODUCT_REMOVED', 'DEPARTURE_ORDER_DISPATCHED', 'DEPARTURE_ORDER_PARTIALLY_DISPATCHED', 'DEPARTURE_ORDER_DISPATCH_COMPLETED', 'INVENTORY_ALLOCATED', 'INVENTORY_DEALLOCATED', 'INVENTORY_MOVED', 'INVENTORY_ADJUSTED', 'INVENTORY_COUNTED', 'INVENTORY_RESERVED', 'INVENTORY_RELEASED', 'INVENTORY_HELD', 'INVENTORY_UNHELD', 'INVENTORY_DAMAGED', 'INVENTORY_RETURNED', 'INVENTORY_EXPIRED', 'QUALITY_STATUS_CHANGED', 'QUALITY_INSPECTION_STARTED', 'QUALITY_INSPECTION_COMPLETED', 'QUALITY_SAMPLE_TAKEN', 'QUALITY_BATCH_APPROVED', 'QUALITY_BATCH_REJECTED', 'CELL_CREATED', 'CELL_UPDATED', 'CELL_DELETED', 'CELL_ASSIGNED', 'CELL_UNASSIGNED', 'CELL_STATUS_CHANGED', 'CELL_CAPACITY_CHANGED', 'WAREHOUSE_CREATED', 'WAREHOUSE_UPDATED', 'WAREHOUSE_DELETED', 'CLIENT_CREATED', 'CLIENT_UPDATED', 'CLIENT_DELETED', 'CLIENT_ACTIVATED', 'CLIENT_DEACTIVATED', 'CLIENT_CELL_ASSIGNED', 'CLIENT_CELL_UNASSIGNED', 'CLIENT_PROFILE_VIEWED', 'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_DELETED', 'PRODUCT_ACTIVATED', 'PRODUCT_DEACTIVATED', 'PRODUCT_PRICE_CHANGED', 'PRODUCT_SPECIFICATION_CHANGED', 'SUPPLIER_CREATED', 'SUPPLIER_UPDATED', 'SUPPLIER_DELETED', 'SUPPLIER_ACTIVATED', 'SUPPLIER_DEACTIVATED', 'SUPPLIER_CONTACT_UPDATED', 'CUSTOMER_CREATED', 'CUSTOMER_UPDATED', 'CUSTOMER_DELETED', 'CUSTOMER_ACTIVATED', 'CUSTOMER_DEACTIVATED', 'REPORT_GENERATED', 'REPORT_EXPORTED', 'REPORT_VIEWED', 'DASHBOARD_ACCESSED', 'SYSTEM_BACKUP_CREATED', 'SYSTEM_BACKUP_RESTORED', 'SYSTEM_SETTINGS_CHANGED', 'SYSTEM_MAINTENANCE_STARTED', 'SYSTEM_MAINTENANCE_COMPLETED', 'DATA_IMPORTED', 'DATA_EXPORTED', 'DATA_SYNCHRONIZED', 'AUDIT_STARTED', 'AUDIT_COMPLETED', 'COMPLIANCE_CHECK_PERFORMED', 'ALERT_TRIGGERED', 'NOTIFICATION_SENT', 'REMINDER_SENT', 'FILE_UPLOADED', 'FILE_DOWNLOADED', 'FILE_DELETED', 'DOCUMENT_GENERATED', 'API_CALL_MADE', 'INTEGRATION_SYNC', 'WEBHOOK_TRIGGERED', 'CELL_ROLE_CHANGE', 'ERROR_OCCURRED', 'EXCEPTION_HANDLED', 'SYSTEM_ERROR_LOGGED');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('PASSED', 'FAILED', 'PENDING');

-- CreateTable
CREATE TABLE "roles" (
    "role_id" TEXT NOT NULL,
    "name" "RoleName" NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "users" (
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active_state_id" TEXT,
    "email" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role_id" TEXT,
    "id" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "middle_name" TEXT,
    "assigned_clients" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisations" (
    "organisation_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" JSONB,
    "tax_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("organisation_id")
);

-- CreateTable
CREATE TABLE "active_states" (
    "state_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "active_states_pkey" PRIMARY KEY ("state_id")
);

-- CreateTable
CREATE TABLE "origins" (
    "origin_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OriginType" NOT NULL,
    "description" TEXT,

    CONSTRAINT "origins_pkey" PRIMARY KEY ("origin_id")
);

-- CreateTable
CREATE TABLE "document_types" (
    "document_type_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DocumentTypeEntry" NOT NULL,
    "description" TEXT,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("document_type_id")
);

-- CreateTable
CREATE TABLE "departure_document_types" (
    "document_type_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DocumentTypeDeparture" NOT NULL,
    "description" TEXT,

    CONSTRAINT "departure_document_types_pkey" PRIMARY KEY ("document_type_id")
);

-- CreateTable
CREATE TABLE "exit_options" (
    "exit_option_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "exit_options_pkey" PRIMARY KEY ("exit_option_id")
);

-- CreateTable
CREATE TABLE "customer_types" (
    "customer_type_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discount_rate" DECIMAL(5,2),

    CONSTRAINT "customer_types_pkey" PRIMARY KEY ("customer_type_id")
);

-- CreateTable
CREATE TABLE "labels" (
    "label_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("label_id")
);

-- CreateTable
CREATE TABLE "product_lines" (
    "product_line_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "product_lines_pkey" PRIMARY KEY ("product_line_id")
);

-- CreateTable
CREATE TABLE "group_names" (
    "group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "product_category" TEXT,

    CONSTRAINT "group_names_pkey" PRIMARY KEY ("group_id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "product_subcategories1" (
    "subcategory1_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_subcategories1_pkey" PRIMARY KEY ("subcategory1_id")
);

-- CreateTable
CREATE TABLE "product_subcategories2" (
    "subcategory2_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subcategory1_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_subcategories2_pkey" PRIMARY KEY ("subcategory2_id")
);

-- CreateTable
CREATE TABLE "countries" (
    "country_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("country_id")
);

-- CreateTable
CREATE TABLE "temperature_ranges" (
    "temperature_id" TEXT NOT NULL,
    "range" TEXT NOT NULL,
    "min_celsius" INTEGER,
    "max_celsius" INTEGER,

    CONSTRAINT "temperature_ranges_pkey" PRIMARY KEY ("temperature_id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplier_id" TEXT NOT NULL,
    "category" TEXT,
    "company_name" TEXT NOT NULL,
    "supplier_code" TEXT,
    "tax_id" TEXT,
    "registered_address" TEXT,
    "city" TEXT,
    "country_id" TEXT,
    "contact_no" TEXT,
    "contact_person" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "name" TEXT,
    "address" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "ruc" TEXT,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("supplier_id")
);

-- CreateTable
CREATE TABLE "customers" (
    "customer_id" TEXT NOT NULL,
    "name" TEXT,
    "type_id" TEXT,
    "billing_address" JSONB,
    "active_state_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("customer_id")
);

-- CreateTable
CREATE TABLE "clients" (
    "client_id" TEXT NOT NULL,
    "client_type" "ClientType" NOT NULL,
    "client_code" TEXT,
    "email" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "cell_phone" TEXT,
    "active_state_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,
    "company_name" TEXT,
    "company_type" "CompanyType",
    "establishment_type" "EstablishmentType" DEFAULT 'SELECCIONAR',
    "ruc" TEXT,
    "first_names" TEXT,
    "last_name" TEXT,
    "mothers_last_name" TEXT,
    "individual_id" TEXT,
    "date_of_birth" TIMESTAMP(3),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("client_id")
);

-- CreateTable
CREATE TABLE "client_users" (
    "client_user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "client_users_pkey" PRIMARY KEY ("client_user_id")
);

-- CreateTable
CREATE TABLE "client_cell_assignments" (
    "assignment_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "cell_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER DEFAULT 1,
    "notes" TEXT,
    "max_capacity" DECIMAL(10,2),

    CONSTRAINT "client_cell_assignments_pkey" PRIMARY KEY ("assignment_id")
);

-- CreateTable
CREATE TABLE "client_product_assignments" (
    "assignment_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "client_product_code" TEXT,
    "client_price" DECIMAL(10,2),
    "notes" TEXT,
    "max_order_quantity" INTEGER,
    "min_order_quantity" INTEGER,

    CONSTRAINT "client_product_assignments_pkey" PRIMARY KEY ("assignment_id")
);

-- CreateTable
CREATE TABLE "client_supplier_assignments" (
    "assignment_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "client_supplier_code" TEXT,
    "preferred_supplier" BOOLEAN NOT NULL DEFAULT false,
    "credit_limit" DECIMAL(10,2),
    "payment_terms" TEXT,
    "notes" TEXT,
    "primary_contact" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,

    CONSTRAINT "client_supplier_assignments_pkey" PRIMARY KEY ("assignment_id")
);

-- CreateTable
CREATE TABLE "products" (
    "product_id" TEXT NOT NULL,
    "product_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "category_id" TEXT,
    "subcategory1_id" TEXT,
    "subcategory2_id" TEXT,
    "manufacturer" TEXT,
    "temperature_range_id" TEXT,
    "humidity" TEXT,
    "observations" TEXT,
    "uploaded_documents" JSONB,
    "product_line_id" TEXT,
    "group_id" TEXT,
    "active_state_id" TEXT,
    "storage_conditions" TEXT,
    "unit_weight" DECIMAL(10,2),
    "unit_volume" DECIMAL(10,2),

    CONSTRAINT "products_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "orders" (
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_type" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "priority" TEXT,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "entry_orders" (
    "entry_order_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "entry_order_no" TEXT NOT NULL,
    "origin_id" TEXT,
    "document_type_id" TEXT,
    "registration_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "document_date" TIMESTAMP(3),
    "entry_date_time" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "client_id" TEXT,
    "order_status" "OrderStatusEntry" NOT NULL DEFAULT 'REVISION',
    "total_volume" DECIMAL(10,2),
    "total_weight" DECIMAL(10,2),
    "cif_value" DECIMAL(10,2),
    "total_pallets" INTEGER,
    "observation" TEXT,
    "uploaded_documents" JSONB,
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "review_comments" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "warehouse_id" TEXT,

    CONSTRAINT "entry_orders_pkey" PRIMARY KEY ("entry_order_id")
);

-- CreateTable
CREATE TABLE "entry_order_products" (
    "entry_order_product_id" TEXT NOT NULL,
    "entry_order_id" TEXT NOT NULL,
    "serial_number" TEXT,
    "supplier_id" TEXT,
    "product_code" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "lot_series" TEXT,
    "manufacturing_date" TIMESTAMP(3),
    "expiration_date" TIMESTAMP(3),
    "inventory_quantity" INTEGER NOT NULL,
    "package_quantity" INTEGER NOT NULL,
    "quantity_pallets" INTEGER,
    "presentation" "PresentationType" NOT NULL DEFAULT 'CAJA',
    "guide_number" TEXT,
    "weight_kg" DECIMAL(10,2) NOT NULL,
    "volume_m3" DECIMAL(10,2),
    "insured_value" DECIMAL(10,2),
    "temperature_range" "TemperatureRangeType" NOT NULL DEFAULT 'AMBIENTE',
    "humidity" TEXT,
    "health_registration" TEXT,

    CONSTRAINT "entry_order_products_pkey" PRIMARY KEY ("entry_order_product_id")
);

-- CreateTable
CREATE TABLE "inventory_allocations" (
    "allocation_id" TEXT NOT NULL,
    "entry_order_id" TEXT NOT NULL,
    "entry_order_product_id" TEXT NOT NULL,
    "inventory_quantity" INTEGER NOT NULL,
    "package_quantity" INTEGER NOT NULL,
    "quantity_pallets" INTEGER,
    "presentation" "PresentationType" NOT NULL DEFAULT 'PALETA',
    "weight_kg" DECIMAL(10,2) NOT NULL,
    "volume_m3" DECIMAL(10,2),
    "cell_id" TEXT NOT NULL,
    "product_status" "ProductStatus" NOT NULL DEFAULT 'PAL_NORMAL',
    "status_code" INTEGER NOT NULL,
    "quality_status" "QualityControlStatus" NOT NULL DEFAULT 'CUARENTENA',
    "allocated_by" TEXT NOT NULL,
    "allocated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_modified_by" TEXT,
    "last_modified_at" TIMESTAMP(3),
    "guide_number" TEXT,
    "uploaded_documents" JSONB,
    "observations" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "inventory_allocations_pkey" PRIMARY KEY ("allocation_id")
);

-- CreateTable
CREATE TABLE "departure_orders" (
    "departure_order_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "departure_order_no" TEXT NOT NULL,
    "customer_id" TEXT,
    "client_id" TEXT,
    "document_type_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "registration_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "document_date" TIMESTAMP(3),
    "departure_date_time" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "order_status" "OrderStatusDeparture" NOT NULL DEFAULT 'PENDING',
    "destination_point" TEXT,
    "transport_type" TEXT,
    "carrier_name" TEXT,
    "total_volume" DECIMAL(10,2),
    "total_weight" DECIMAL(10,2),
    "total_value" DECIMAL(10,2),
    "total_pallets" INTEGER,
    "observation" TEXT,
    "dispatch_document_number" TEXT,
    "uploaded_documents" JSONB,
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "review_comments" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "dispatch_status" TEXT NOT NULL DEFAULT 'NOT_DISPATCHED',
    "dispatched_by" TEXT,
    "dispatched_at" TIMESTAMP(3),
    "dispatch_notes" TEXT,
    "warehouse_id" TEXT,
    "label_id" TEXT,
    "exit_option_id" TEXT,

    CONSTRAINT "departure_orders_pkey" PRIMARY KEY ("departure_order_id")
);

-- CreateTable
CREATE TABLE "departure_order_products" (
    "departure_order_product_id" TEXT NOT NULL,
    "departure_order_id" TEXT NOT NULL,
    "product_code" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "lot_series" TEXT,
    "requested_quantity" INTEGER NOT NULL,
    "requested_packages" INTEGER NOT NULL,
    "requested_pallets" INTEGER,
    "presentation" "PresentationType" NOT NULL DEFAULT 'CAJA',
    "requested_weight" DECIMAL(10,2) NOT NULL,
    "requested_volume" DECIMAL(10,2),
    "unit_price" DECIMAL(10,2),
    "total_value" DECIMAL(10,2),
    "dispatched_quantity" INTEGER NOT NULL DEFAULT 0,
    "dispatched_packages" INTEGER NOT NULL DEFAULT 0,
    "dispatched_pallets" INTEGER NOT NULL DEFAULT 0,
    "dispatched_weight" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "dispatched_volume" DECIMAL(10,2) DEFAULT 0,
    "remaining_quantity" INTEGER NOT NULL DEFAULT 0,
    "remaining_packages" INTEGER NOT NULL DEFAULT 0,
    "remaining_weight" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "temperature_requirement" "TemperatureRangeType" NOT NULL DEFAULT 'AMBIENTE',
    "special_handling" TEXT,
    "delivery_instructions" TEXT,

    CONSTRAINT "departure_order_products_pkey" PRIMARY KEY ("departure_order_product_id")
);

-- CreateTable
CREATE TABLE "departure_allocations" (
    "allocation_id" TEXT NOT NULL,
    "departure_order_id" TEXT NOT NULL,
    "departure_order_product_id" TEXT NOT NULL,
    "source_allocation_id" TEXT NOT NULL,
    "allocated_quantity" INTEGER NOT NULL,
    "allocated_packages" INTEGER NOT NULL,
    "allocated_pallets" INTEGER,
    "presentation" "PresentationType" NOT NULL DEFAULT 'PALETA',
    "allocated_weight" DECIMAL(10,2) NOT NULL,
    "allocated_volume" DECIMAL(10,2),
    "cell_id" TEXT NOT NULL,
    "product_status" "ProductStatus" NOT NULL,
    "status_code" INTEGER NOT NULL,
    "guide_number" TEXT,
    "uploaded_documents" JSONB,
    "observations" TEXT,
    "allocated_by" TEXT NOT NULL,
    "allocated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "departure_allocations_pkey" PRIMARY KEY ("allocation_id")
);

-- CreateTable
CREATE TABLE "warehouse_cells" (
    "cell_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "row" TEXT NOT NULL,
    "bay" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "CellKind" NOT NULL DEFAULT 'NORMAL',
    "status" "CellStatus" NOT NULL DEFAULT 'AVAILABLE',
    "cell_role" "CellRole" NOT NULL DEFAULT 'STANDARD',
    "is_passage" BOOLEAN NOT NULL DEFAULT false,
    "capacity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "currentUsage" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "current_packaging_qty" INTEGER NOT NULL DEFAULT 0,
    "current_weight" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "warehouse_cells_pkey" PRIMARY KEY ("cell_id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "warehouse_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" JSONB,
    "location" TEXT,
    "capacity" INTEGER,
    "max_occupancy" INTEGER,
    "status" TEXT,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("warehouse_id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "inventory_id" TEXT NOT NULL,
    "allocation_id" TEXT,
    "product_id" TEXT NOT NULL,
    "cell_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "current_quantity" INTEGER NOT NULL,
    "current_package_quantity" INTEGER NOT NULL,
    "current_weight" DECIMAL(10,2) NOT NULL,
    "current_volume" DECIMAL(10,2),
    "status" "InventoryStatus" NOT NULL DEFAULT 'QUARANTINED',
    "product_status" "ProductStatus" NOT NULL,
    "status_code" INTEGER NOT NULL,
    "quality_status" "QualityControlStatus" NOT NULL DEFAULT 'CUARENTENA',
    "created_by" TEXT,
    "last_modified_by" TEXT,
    "last_modified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("inventory_id")
);

-- CreateTable
CREATE TABLE "inventory_logs" (
    "log_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "movement_type" "MovementType" NOT NULL,
    "quantity_change" INTEGER NOT NULL,
    "package_change" INTEGER NOT NULL DEFAULT 0,
    "weight_change" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "volume_change" DECIMAL(10,2),
    "entry_order_id" TEXT,
    "entry_order_product_id" TEXT,
    "allocation_id" TEXT,
    "departure_order_id" TEXT,
    "departure_order_product_id" TEXT,
    "departure_allocation_id" TEXT,
    "warehouse_id" TEXT,
    "cell_id" TEXT,
    "product_status" "ProductStatus",
    "status_code" INTEGER,
    "notes" TEXT,

    CONSTRAINT "inventory_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "cell_assignments" (
    "assignment_id" TEXT NOT NULL,
    "cell_id" TEXT NOT NULL,
    "departure_order_id" TEXT,
    "entry_order_id" TEXT,
    "assigned_by" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "packaging_quantity" INTEGER NOT NULL,
    "weight" DECIMAL(10,2) NOT NULL,
    "packaging_code" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "cell_assignments_pkey" PRIMARY KEY ("assignment_id")
);

-- CreateTable
CREATE TABLE "entry_order_audits" (
    "audit_id" TEXT NOT NULL,
    "entry_order_id" TEXT NOT NULL,
    "audited_by" TEXT NOT NULL,
    "audit_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "audit_result" "AuditResult" NOT NULL,
    "comments" TEXT,
    "discrepancy_notes" TEXT,

    CONSTRAINT "entry_order_audits_pkey" PRIMARY KEY ("audit_id")
);

-- CreateTable
CREATE TABLE "quality_control_transitions" (
    "transition_id" TEXT NOT NULL,
    "allocation_id" TEXT,
    "inventory_id" TEXT,
    "from_status" "QualityControlStatus",
    "to_status" "QualityControlStatus" NOT NULL,
    "quantity_moved" INTEGER NOT NULL,
    "package_quantity_moved" INTEGER NOT NULL,
    "weight_moved" DECIMAL(10,2) NOT NULL,
    "volume_moved" DECIMAL(10,2),
    "from_cell_id" TEXT,
    "to_cell_id" TEXT,
    "performed_by" TEXT NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "notes" TEXT,

    CONSTRAINT "quality_control_transitions_pkey" PRIMARY KEY ("transition_id")
);

-- CreateTable
CREATE TABLE "system_audit_logs" (
    "audit_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" "SystemAction" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "session_id" TEXT,

    CONSTRAINT "system_audit_logs_pkey" PRIMARY KEY ("audit_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_user_id_key" ON "users"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "active_states_name_key" ON "active_states"("name");

-- CreateIndex
CREATE UNIQUE INDEX "origins_name_key" ON "origins"("name");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_name_key" ON "document_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "departure_document_types_name_key" ON "departure_document_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "exit_options_name_key" ON "exit_options"("name");

-- CreateIndex
CREATE UNIQUE INDEX "customer_types_name_key" ON "customer_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "labels_name_key" ON "labels"("name");

-- CreateIndex
CREATE UNIQUE INDEX "product_lines_name_key" ON "product_lines"("name");

-- CreateIndex
CREATE UNIQUE INDEX "group_names_name_key" ON "group_names"("name");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_name_key" ON "product_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "product_subcategories1_category_id_name_key" ON "product_subcategories1"("category_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "product_subcategories2_subcategory1_id_name_key" ON "product_subcategories2"("subcategory1_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "countries_name_key" ON "countries"("name");

-- CreateIndex
CREATE UNIQUE INDEX "temperature_ranges_range_key" ON "temperature_ranges"("range");

-- CreateIndex
CREATE INDEX "idx_customer_type" ON "customers"("type_id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_client_code_key" ON "clients"("client_code");

-- CreateIndex
CREATE INDEX "idx_client_type" ON "clients"("client_type");

-- CreateIndex
CREATE INDEX "idx_client_company_type" ON "clients"("company_type");

-- CreateIndex
CREATE INDEX "idx_client_establishment_type" ON "clients"("establishment_type");

-- CreateIndex
CREATE INDEX "idx_client_active_state" ON "clients"("active_state_id");

-- CreateIndex
CREATE INDEX "idx_client_created_by" ON "clients"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "client_users_user_id_key" ON "client_users"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_users_username_key" ON "client_users"("username");

-- CreateIndex
CREATE INDEX "idx_client_users_client_id" ON "client_users"("client_id");

-- CreateIndex
CREATE INDEX "idx_client_users_is_primary" ON "client_users"("is_primary");

-- CreateIndex
CREATE INDEX "idx_client_users_is_active" ON "client_users"("is_active");

-- CreateIndex
CREATE INDEX "idx_client_users_created_by" ON "client_users"("created_by");

-- CreateIndex
CREATE INDEX "idx_client_assignments" ON "client_cell_assignments"("client_id");

-- CreateIndex
CREATE INDEX "idx_cell_client_assignments" ON "client_cell_assignments"("cell_id");

-- CreateIndex
CREATE INDEX "idx_warehouse_client_assignments" ON "client_cell_assignments"("warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_cell_assignments_client_id_cell_id_key" ON "client_cell_assignments"("client_id", "cell_id");

-- CreateIndex
CREATE INDEX "idx_client_product_assignments" ON "client_product_assignments"("client_id");

-- CreateIndex
CREATE INDEX "idx_product_client_assignments" ON "client_product_assignments"("product_id");

-- CreateIndex
CREATE INDEX "idx_product_assigner" ON "client_product_assignments"("assigned_by");

-- CreateIndex
CREATE INDEX "idx_client_product_active" ON "client_product_assignments"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "client_product_assignments_client_id_product_id_key" ON "client_product_assignments"("client_id", "product_id");

-- CreateIndex
CREATE INDEX "idx_client_supplier_assignments" ON "client_supplier_assignments"("client_id");

-- CreateIndex
CREATE INDEX "idx_supplier_client_assignments" ON "client_supplier_assignments"("supplier_id");

-- CreateIndex
CREATE INDEX "idx_supplier_assigner" ON "client_supplier_assignments"("assigned_by");

-- CreateIndex
CREATE INDEX "idx_client_supplier_active" ON "client_supplier_assignments"("is_active");

-- CreateIndex
CREATE INDEX "idx_preferred_supplier" ON "client_supplier_assignments"("preferred_supplier");

-- CreateIndex
CREATE UNIQUE INDEX "client_supplier_assignments_client_id_supplier_id_key" ON "client_supplier_assignments"("client_id", "supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_product_code_key" ON "products"("product_code");

-- CreateIndex
CREATE INDEX "idx_product_category" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "idx_product_subcategory1" ON "products"("subcategory1_id");

-- CreateIndex
CREATE INDEX "idx_product_subcategory2" ON "products"("subcategory2_id");

-- CreateIndex
CREATE INDEX "idx_product_manufacturer" ON "products"("manufacturer");

-- CreateIndex
CREATE INDEX "idx_order_creation" ON "orders"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "entry_orders_order_id_key" ON "entry_orders"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "entry_orders_entry_order_no_key" ON "entry_orders"("entry_order_no");

-- CreateIndex
CREATE UNIQUE INDEX "entry_order_products_entry_order_id_product_code_key" ON "entry_order_products"("entry_order_id", "product_code");

-- CreateIndex
CREATE UNIQUE INDEX "departure_orders_order_id_key" ON "departure_orders"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "departure_orders_departure_order_no_key" ON "departure_orders"("departure_order_no");

-- CreateIndex
CREATE UNIQUE INDEX "departure_order_products_departure_order_id_product_code_key" ON "departure_order_products"("departure_order_id", "product_code");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_cells_warehouse_id_row_bay_position_key" ON "warehouse_cells"("warehouse_id", "row", "bay", "position");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_name_key" ON "warehouses"("name");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_allocation_id_cell_id_key" ON "inventory"("allocation_id", "cell_id");

-- CreateIndex
CREATE INDEX "idx_log_timestamp_product" ON "inventory_logs"("timestamp", "product_id");

-- CreateIndex
CREATE INDEX "idx_audit_user_time" ON "system_audit_logs"("user_id", "performed_at");

-- CreateIndex
CREATE INDEX "idx_audit_entity" ON "system_audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_audit_action_time" ON "system_audit_logs"("action", "performed_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_active_state_id_fkey" FOREIGN KEY ("active_state_id") REFERENCES "active_states"("state_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("role_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_subcategories1" ADD CONSTRAINT "product_subcategories1_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("category_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_subcategories2" ADD CONSTRAINT "product_subcategories2_subcategory1_id_fkey" FOREIGN KEY ("subcategory1_id") REFERENCES "product_subcategories1"("subcategory1_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("country_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_active_state_id_fkey" FOREIGN KEY ("active_state_id") REFERENCES "active_states"("state_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "customer_types"("customer_type_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_active_state_id_fkey" FOREIGN KEY ("active_state_id") REFERENCES "active_states"("state_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_cell_assignments" ADD CONSTRAINT "client_cell_assignments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_cell_assignments" ADD CONSTRAINT "client_cell_assignments_cell_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "warehouse_cells"("cell_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_cell_assignments" ADD CONSTRAINT "client_cell_assignments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_cell_assignments" ADD CONSTRAINT "client_cell_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_product_assignments" ADD CONSTRAINT "client_product_assignments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_product_assignments" ADD CONSTRAINT "client_product_assignments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_product_assignments" ADD CONSTRAINT "client_product_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_supplier_assignments" ADD CONSTRAINT "client_supplier_assignments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_supplier_assignments" ADD CONSTRAINT "client_supplier_assignments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("supplier_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_supplier_assignments" ADD CONSTRAINT "client_supplier_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("category_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_subcategory1_id_fkey" FOREIGN KEY ("subcategory1_id") REFERENCES "product_subcategories1"("subcategory1_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_subcategory2_id_fkey" FOREIGN KEY ("subcategory2_id") REFERENCES "product_subcategories2"("subcategory2_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_temperature_range_id_fkey" FOREIGN KEY ("temperature_range_id") REFERENCES "temperature_ranges"("temperature_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_active_state_id_fkey" FOREIGN KEY ("active_state_id") REFERENCES "active_states"("state_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group_names"("group_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_product_line_id_fkey" FOREIGN KEY ("product_line_id") REFERENCES "product_lines"("product_line_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_orders" ADD CONSTRAINT "entry_orders_origin_id_fkey" FOREIGN KEY ("origin_id") REFERENCES "origins"("origin_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_orders" ADD CONSTRAINT "entry_orders_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_types"("document_type_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_orders" ADD CONSTRAINT "entry_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_orders" ADD CONSTRAINT "entry_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_orders" ADD CONSTRAINT "entry_orders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_orders" ADD CONSTRAINT "entry_orders_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_orders" ADD CONSTRAINT "entry_orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_order_products" ADD CONSTRAINT "entry_order_products_entry_order_id_fkey" FOREIGN KEY ("entry_order_id") REFERENCES "entry_orders"("entry_order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_order_products" ADD CONSTRAINT "entry_order_products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("supplier_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_order_products" ADD CONSTRAINT "entry_order_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_allocations" ADD CONSTRAINT "inventory_allocations_entry_order_id_fkey" FOREIGN KEY ("entry_order_id") REFERENCES "entry_orders"("entry_order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_allocations" ADD CONSTRAINT "inventory_allocations_entry_order_product_id_fkey" FOREIGN KEY ("entry_order_product_id") REFERENCES "entry_order_products"("entry_order_product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_allocations" ADD CONSTRAINT "inventory_allocations_cell_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "warehouse_cells"("cell_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_allocations" ADD CONSTRAINT "inventory_allocations_allocated_by_fkey" FOREIGN KEY ("allocated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_allocations" ADD CONSTRAINT "inventory_allocations_last_modified_by_fkey" FOREIGN KEY ("last_modified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_orders" ADD CONSTRAINT "departure_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_orders" ADD CONSTRAINT "departure_orders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_orders" ADD CONSTRAINT "departure_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_orders" ADD CONSTRAINT "departure_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_orders" ADD CONSTRAINT "departure_orders_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_orders" ADD CONSTRAINT "departure_orders_dispatched_by_fkey" FOREIGN KEY ("dispatched_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_orders" ADD CONSTRAINT "departure_orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_orders" ADD CONSTRAINT "departure_orders_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels"("label_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_orders" ADD CONSTRAINT "departure_orders_exit_option_id_fkey" FOREIGN KEY ("exit_option_id") REFERENCES "exit_options"("exit_option_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_order_products" ADD CONSTRAINT "departure_order_products_departure_order_id_fkey" FOREIGN KEY ("departure_order_id") REFERENCES "departure_orders"("departure_order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_order_products" ADD CONSTRAINT "departure_order_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_allocations" ADD CONSTRAINT "departure_allocations_departure_order_id_fkey" FOREIGN KEY ("departure_order_id") REFERENCES "departure_orders"("departure_order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_allocations" ADD CONSTRAINT "departure_allocations_departure_order_product_id_fkey" FOREIGN KEY ("departure_order_product_id") REFERENCES "departure_order_products"("departure_order_product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_allocations" ADD CONSTRAINT "departure_allocations_source_allocation_id_fkey" FOREIGN KEY ("source_allocation_id") REFERENCES "inventory_allocations"("allocation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_allocations" ADD CONSTRAINT "departure_allocations_cell_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "warehouse_cells"("cell_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_allocations" ADD CONSTRAINT "departure_allocations_allocated_by_fkey" FOREIGN KEY ("allocated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_cells" ADD CONSTRAINT "warehouse_cells_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "inventory_allocations"("allocation_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_cell_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "warehouse_cells"("cell_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_last_modified_by_fkey" FOREIGN KEY ("last_modified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_entry_order_id_fkey" FOREIGN KEY ("entry_order_id") REFERENCES "entry_orders"("entry_order_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_entry_order_product_id_fkey" FOREIGN KEY ("entry_order_product_id") REFERENCES "entry_order_products"("entry_order_product_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "inventory_allocations"("allocation_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_departure_order_id_fkey" FOREIGN KEY ("departure_order_id") REFERENCES "departure_orders"("departure_order_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_departure_order_product_id_fkey" FOREIGN KEY ("departure_order_product_id") REFERENCES "departure_order_products"("departure_order_product_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_departure_allocation_id_fkey" FOREIGN KEY ("departure_allocation_id") REFERENCES "departure_allocations"("allocation_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_cell_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "warehouse_cells"("cell_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cell_assignments" ADD CONSTRAINT "cell_assignments_cell_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "warehouse_cells"("cell_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cell_assignments" ADD CONSTRAINT "cell_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_order_audits" ADD CONSTRAINT "entry_order_audits_entry_order_id_fkey" FOREIGN KEY ("entry_order_id") REFERENCES "entry_orders"("entry_order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_order_audits" ADD CONSTRAINT "entry_order_audits_audited_by_fkey" FOREIGN KEY ("audited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_control_transitions" ADD CONSTRAINT "quality_control_transitions_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "inventory_allocations"("allocation_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_control_transitions" ADD CONSTRAINT "quality_control_transitions_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "inventory"("inventory_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_control_transitions" ADD CONSTRAINT "quality_control_transitions_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_control_transitions" ADD CONSTRAINT "quality_control_transitions_from_cell_id_fkey" FOREIGN KEY ("from_cell_id") REFERENCES "warehouse_cells"("cell_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_control_transitions" ADD CONSTRAINT "quality_control_transitions_to_cell_id_fkey" FOREIGN KEY ("to_cell_id") REFERENCES "warehouse_cells"("cell_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_audit_logs" ADD CONSTRAINT "system_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
