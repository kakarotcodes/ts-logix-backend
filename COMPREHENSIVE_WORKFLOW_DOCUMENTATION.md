# TSLogix Pharmaceutical Warehouse Management System - Complete Workflow Documentation

## Overview

TSLogix is a sophisticated pharmaceutical warehouse management system that manages the complete supply chain from entry orders through quality control to dispatch. This document provides a detailed analysis of each workflow step with examples.

## Table of Contents
1. [Entry Order Creation](#1-entry-order-creation)
2. [Entry Order Approval Process](#2-entry-order-approval-process)
3. [Inventory Allocation Process](#3-inventory-allocation-process)
4. [Quality Control Workflow](#4-quality-control-workflow)
5. [Departure Order Creation](#5-departure-order-creation)
6. [Dispatch Process](#6-dispatch-process)
7. [Complete Workflow Example](#7-complete-workflow-example)

---

## 1. Entry Order Creation

### Process Overview
Entry orders represent incoming pharmaceutical inventory that needs to be registered, reviewed, and allocated in the warehouse.

### Who Can Create
- **CLIENT** users only (restricted access)

### Required Information
- Entry order number (auto-generated: OI202501, OI202502, etc.)
- Origin (Purchase, Import, Return, etc.)
- Document type (Packing List, Invoice, etc.)
- Entry date and time
- Product list with quantities, lot numbers, expiration dates
- Supplier information
- Warehouse assignment (optional)

### Technical Implementation

**API Endpoint**: `POST /entry/entry-orders`

**Service Function**: `createEntryOrder(entryData)` in `/src/modules/entry/entry.service.js:15-147`

**Database Transaction Flow**:
1. Create base `Order` record with type "ENTRY"
2. Create `EntryOrder` record with initial status `REVISION`
3. Create `EntryOrderProduct` records for each product
4. Set initial review status to `PENDING`

### Example Entry Order Creation

```javascript
// Request Body Example
{
  "entry_order_no": "OI202503",
  "origin_id": "origin-uuid",
  "document_type_id": "document-type-uuid",
  "registration_date": "2025-08-15T10:00:00Z",
  "document_date": "2025-08-14T00:00:00Z",
  "entry_date_time": "2025-08-16T08:00:00Z",
  "total_volume": 15.5,
  "total_weight": 1200.75,
  "total_pallets": 3,
  "observation": "Pharmaceutical products requiring cold storage",
  "products": [
    {
      "product_id": "product-uuid-1",
      "product_code": "PARA500",
      "lot_series": "LOT20250815001",
      "manufacturing_date": "2025-06-01T00:00:00Z",
      "expiration_date": "2027-06-01T00:00:00Z",
      "inventory_quantity": 1000,
      "package_quantity": 10,
      "weight_kg": 25.5,
      "volume_m3": 2.3,
      "insured_value": 2500.00,
      "temperature_range": "AMBIENTE",
      "supplier_id": "supplier-uuid"
    }
  ]
}
```

### Business Rules
1. **Duplicate Prevention**: Each product can only appear once per entry order
2. **Quantity Validation**: All quantities must be positive numbers
3. **Date Validation**: Expiration date must be after manufacturing date
4. **Product Validation**: Products must exist in the system
5. **Status Setting**: All new orders start with review status `PENDING`

### Database Records Created
- `Order` (type: ENTRY, status: PENDING)
- `EntryOrder` (review_status: PENDING, order_status: REVISION)
- `EntryOrderProduct[]` (one per product)

---

## 2. Entry Order Approval Process

### Process Overview
Admin or warehouse staff review and approve entry orders before they can be allocated to warehouse cells.

### Who Can Review
- **ADMIN** users
- **WAREHOUSE_INCHARGE** users
- **PHARMACIST** users

### Review Options
- **APPROVED**: Order ready for inventory allocation
- **REJECTED**: Order blocked (workflow ends)
- **NEEDS_REVISION**: Client must modify and resubmit

### Technical Implementation

**API Endpoint**: `POST /entry/entry-orders/:orderNo/review`

**Service Function**: `reviewEntryOrder(orderNo, reviewData)` in `/src/modules/entry/entry.service.js:963-993`

**Controller Function**: `reviewEntryOrder(req, res)` in `/src/modules/entry/entry.controller.js:583-744`

### Example Review Process

```javascript
// Review Request Body
{
  "review_status": "APPROVED",
  "review_comments": "Products verified. Temperature storage requirements noted. Approved for allocation to cold storage cells."
}

// Database Updates
// EntryOrder record updated:
{
  "review_status": "APPROVED",
  "review_comments": "Products verified...",
  "reviewed_by": "user-uuid",
  "reviewed_at": "2025-08-15T11:30:00Z"
}
```

### Status Transitions
1. **PENDING** → **APPROVED**: Ready for allocation
2. **PENDING** → **REJECTED**: Workflow blocked
3. **PENDING** → **NEEDS_REVISION**: Client must edit
4. **NEEDS_REVISION** → **PENDING**: After client updates

### Business Rules
1. Only pending orders can be reviewed
2. Review comments required for REJECTED/NEEDS_REVISION
3. Once approved, orders appear in allocation queue
4. Clients can only edit orders with NEEDS_REVISION status

---

## 3. Inventory Allocation Process

### Process Overview
Approved entry orders are allocated to specific warehouse cells. Each product is assigned a physical location and given initial quarantine status.

### Who Can Allocate
- **WAREHOUSE_INCHARGE** users
- **ADMIN** users
- **PHARMACIST** users
- **CLIENT** users (to their assigned cells only)

### Allocation Requirements
- Entry order must be APPROVED
- Target cell must be AVAILABLE
- Quantities must not exceed available amounts
- Client users limited to assigned cells

### Technical Implementation

**API Endpoint**: `POST /inventory/assign-product`

**Service Function**: `assignProductToCell(assignmentData)` in `/src/modules/inventory/inventory.service.js:292-580`

### Example Allocation Process

```javascript
// Allocation Request
{
  "entry_order_product_id": "eop-uuid",
  "cell_id": "cell-uuid",
  "assigned_by": "user-uuid",
  "inventory_quantity": 500,
  "package_quantity": 5,
  "weight_kg": 12.75,
  "volume_m3": 1.15,
  "product_status": "PAL_NORMAL",
  "warehouse_id": "warehouse-uuid",
  "observations": "Allocated to temperature-controlled section"
}
```

### Database Records Created

1. **InventoryAllocation**:
```javascript
{
  "allocation_id": "alloc-uuid",
  "entry_order_id": "entry-uuid",
  "entry_order_product_id": "eop-uuid",
  "inventory_quantity": 500,
  "package_quantity": 5,
  "weight_kg": 12.75,
  "cell_id": "cell-uuid",
  "product_status": "PAL_NORMAL",
  "quality_status": "CUARENTENA", // Always starts in quarantine
  "allocated_by": "user-uuid",
  "status": "ACTIVE"
}
```

2. **Inventory**:
```javascript
{
  "inventory_id": "inv-uuid",
  "allocation_id": "alloc-uuid",
  "product_id": "product-uuid",
  "cell_id": "cell-uuid",
  "warehouse_id": "warehouse-uuid",
  "current_quantity": 500,
  "current_package_quantity": 5,
  "current_weight": 12.75,
  "status": "QUARANTINED", // Matches allocation quality status
  "quality_status": "CUARENTENA"
}
```

3. **InventoryLog**:
```javascript
{
  "log_id": "log-uuid",
  "user_id": "user-uuid",
  "product_id": "product-uuid",
  "movement_type": "ENTRY",
  "quantity_change": 500,
  "package_change": 5,
  "weight_change": 12.75,
  "entry_order_id": "entry-uuid",
  "warehouse_id": "warehouse-uuid",
  "cell_id": "cell-uuid",
  "notes": "Assigned 500 units to quarantine in cell A.01.05"
}
```

4. **Cell Status Update**:
```javascript
{
  "status": "OCCUPIED",
  "currentUsage": 1.15, // Updated volume
  "current_packaging_qty": 5, // Updated package count
  "current_weight": 12.75 // Updated weight
}
```

### Business Rules
1. **Initial Status**: All allocated inventory starts with quality status `CUARENTENA`
2. **Cell Constraints**: CLIENT users can only allocate to assigned cells
3. **Quantity Validation**: Cannot exceed entry order product quantities
4. **Cell Capacity**: No hard limits (cells can hold unlimited amounts)
5. **FIFO Tracking**: Entry date/time recorded for future FIFO dispatch

---

## 4. Quality Control Workflow

### Process Overview
Allocated inventory undergoes quality control transitions from quarantine to approved status or rejection categories.

### Who Can Perform Quality Control
- **WAREHOUSE_INCHARGE** users
- **ADMIN** users
- **PHARMACIST** users

### Quality Status Flow
```
CUARENTENA → APROBADO     (Approved for dispatch)
CUARENTENA → DEVOLUCIONES (Returns to supplier)
CUARENTENA → CONTRAMUESTRAS (Samples for testing)
CUARENTENA → RECHAZADOS   (Rejected products)
```

### Technical Implementation

**API Endpoint**: `POST /inventory/quality-transition`

**Service Function**: `transitionQualityStatus(transitionData)` in `/src/modules/inventory/inventory.service.js`

**Controller Function**: `transitionQualityStatus(req, res)` in `/src/modules/inventory/inventory.controller.js:574-845`

### Example Quality Control Transition

```javascript
// Quality Transition Request
{
  "allocation_id": "alloc-uuid",
  "to_status": "APROBADO",
  "quantity_to_move": 500,
  "package_quantity_to_move": 5,
  "weight_to_move": 12.75,
  "reason": "Quality inspection passed",
  "notes": "Products meet pharmaceutical standards. Approved for dispatch.",
  "new_cell_id": "approved-cell-uuid" // Optional: move to different cell
}
```

### Database Updates

1. **InventoryAllocation Update**:
```javascript
{
  "quality_status": "APROBADO", // Updated from CUARENTENA
  "last_modified_by": "user-uuid",
  "last_modified_at": "2025-08-15T14:30:00Z"
}
```

2. **Inventory Update**:
```javascript
{
  "status": "AVAILABLE", // Now available for departure
  "quality_status": "APROBADO",
  "last_updated": "2025-08-15T14:30:00Z"
}
```

3. **InventoryLog Entry**:
```javascript
{
  "movement_type": "TRANSFER",
  "quantity_change": 0, // No quantity change, status change only
  "notes": "Quality control: Moved from CUARENTENA to APROBADO",
  "product_status": "PAL_NORMAL",
  "quality_transition": {
    "from_status": "CUARENTENA",
    "to_status": "APROBADO",
    "reason": "Quality inspection passed"
  }
}
```

### Business Rules
1. **Approved Only**: Only APROBADO inventory can be used in departure orders
2. **Partial Transitions**: Can move partial quantities (split allocations)
3. **Cell Changes**: Can optionally move to different cells during transition
4. **Audit Trail**: All transitions logged with reason and performer
5. **Status Validation**: Only valid pharmaceutical statuses allowed

---

## 5. Departure Order Creation

### Process Overview
Departure orders represent outbound shipments of approved pharmaceutical inventory to customers.

### Who Can Create
- **WAREHOUSE_INCHARGE** users
- **ADMIN** users
- **CLIENT** users (limited to their assigned products)

### Prerequisites
- Must have APROBADO (approved) inventory available
- Products must be allocated and quality-approved
- Customer/client information required

### Technical Implementation

**API Endpoint**: `POST /departure/departure-orders`

**Service Function**: `createDepartureOrder(departureData)` in `/src/modules/departure/departure.service.js:1192+`

### Example Departure Order Creation

```javascript
// Departure Order Request
{
  "departure_order_no": "DO202501",
  "departure_date_time": "2025-08-16T10:00:00Z",
  "destination_point": "Hospital Central - Lima",
  "transport_type": "TRUCK",
  "carrier_name": "TransFarma Express",
  "customer_id": "customer-uuid",
  "client_id": "client-uuid",
  "warehouse_id": "warehouse-uuid",
  "dispatch_document_number": "DISP-2025-001", // Mandatory field
  "document_type_ids": ["doc-type-1", "doc-type-2"],
  "total_weight": 25.50,
  "total_volume": 2.30,
  "total_pallets": 1,
  "products": [
    {
      "product_id": "product-uuid",
      "requested_quantity": 100,
      "requested_packages": 1,
      "unit_price": 2.50,
      "total_price": 250.00,
      "product_allocations": [
        {
          "inventory_id": "inv-uuid",
          "allocation_id": "alloc-uuid",
          "allocated_quantity": 100,
          "allocated_packages": 1,
          "allocated_weight": 2.55,
          "source_cell_id": "cell-uuid"
        }
      ]
    }
  ]
}
```

### FIFO (First In, First Out) Logic

The system implements **EXPIRY-BASED FIFO** for departure allocations:

1. **Primary Sort**: Products with earliest expiration dates are selected first
2. **Secondary Sort**: Among products with same expiry, oldest entry orders first
3. **Automatic Selection**: System suggests optimal FIFO allocation

**Service Function**: `getSuggestedFifoAllocation(productId, requestedQuantity)` in `/src/modules/departure/departure.service.js:759-847`

### Database Records Created

1. **Order** (type: DEPARTURE)
2. **DepartureOrder** with mandatory fields
3. **DepartureOrderProduct[]** for each product
4. **DepartureAllocation[]** linking to source inventory

### Business Rules
1. **Inventory Validation**: Only APROBADO inventory can be used
2. **FIFO Enforcement**: Oldest/earliest expiry products allocated first
3. **Client Restrictions**: CLIENT users limited to their assigned products
4. **Mandatory Fields**: Dispatch document number required
5. **Quantity Limits**: Cannot exceed available approved inventory

---

## 6. Dispatch Process

### Process Overview
The dispatch process physically moves products from warehouse cells and updates inventory levels.

### Who Can Dispatch
- **WAREHOUSE_INCHARGE** users
- **ADMIN** users

### Dispatch Requirements
- Departure order must be approved
- All products must have valid allocations
- Physical verification completed
- Dispatch documents prepared

### Technical Implementation

**API Endpoint**: `POST /departure/departure-orders/:orderId/dispatch`

### Example Dispatch Process

```javascript
// Dispatch Request
{
  "departure_order_id": "do-uuid",
  "dispatched_by": "user-uuid",
  "dispatch_notes": "All products verified and loaded. Transport departed at 10:15 AM.",
  "actual_dispatch_time": "2025-08-16T10:15:00Z",
  "products_dispatched": [
    {
      "departure_order_product_id": "dop-uuid",
      "dispatched_quantity": 100,
      "dispatched_packages": 1,
      "dispatched_weight": 2.55,
      "allocations": [
        {
          "departure_allocation_id": "da-uuid",
          "dispatched_quantity": 100,
          "source_cell_reference": "A.01.05"
        }
      ]
    }
  ]
}
```

### Database Updates During Dispatch

1. **DepartureOrder Update**:
```javascript
{
  "dispatch_status": "DISPATCHED",
  "dispatched_by": "user-uuid",
  "dispatched_at": "2025-08-16T10:15:00Z",
  "order_status": "COMPLETED"
}
```

2. **Inventory Reduction**:
```javascript
// Before dispatch
{
  "current_quantity": 500,
  "current_package_quantity": 5,
  "current_weight": 12.75
}

// After dispatching 100 units
{
  "current_quantity": 400,
  "current_package_quantity": 4,
  "current_weight": 10.20
}
```

3. **Cell Usage Update**:
```javascript
{
  "currentUsage": 0.92, // Reduced volume
  "current_packaging_qty": 4, // Reduced packages
  "current_weight": 10.20, // Reduced weight
  "status": "OCCUPIED" // Remains occupied if inventory left
}
```

4. **InventoryLog Entry**:
```javascript
{
  "movement_type": "DEPARTURE",
  "quantity_change": -100, // Negative for outbound
  "package_change": -1,
  "weight_change": -2.55,
  "departure_order_id": "do-uuid",
  "departure_order_product_id": "dop-uuid",
  "notes": "Dispatched 100 units to Hospital Central via DO202501"
}
```

### Dispatch Validation Rules
1. **Quantity Verification**: Dispatched amounts must match departure order
2. **Inventory Sufficiency**: Must have enough approved inventory
3. **Cell Updates**: Inventory and cell usage updated atomically
4. **Status Progression**: Order marked as DISPATCHED/COMPLETED
5. **Audit Trail**: Complete movement history maintained

---

## 7. Complete Workflow Example

### Scenario: Panadol 500mg Tablets Order
Let's trace a complete pharmaceutical order from entry to dispatch.

#### Step 1: Entry Order Creation (CLIENT)
**User**: Maria Lopez (CLIENT - PharmaCorp)
**Action**: Creates entry order for incoming Panadol shipment

```javascript
// POST /entry/entry-orders
{
  "entry_order_no": "OI202503",
  "origin_id": "purchase-local",
  "document_type_id": "packing-list",
  "entry_date_time": "2025-08-16T08:00:00Z",
  "products": [
    {
      "product_code": "PARA500",
      "product_id": "panadol-500mg-uuid",
      "lot_series": "PAN20250815001",
      "manufacturing_date": "2025-06-01T00:00:00Z",
      "expiration_date": "2027-06-01T00:00:00Z",
      "inventory_quantity": 5000,
      "package_quantity": 50, // 50 boxes
      "weight_kg": 125.0,
      "volume_m3": 5.2,
      "insured_value": 12500.00,
      "temperature_range": "AMBIENTE",
      "supplier_id": "bayer-supplier-uuid"
    }
  ]
}
```

**Database State**:
- Order created with status PENDING
- EntryOrder with review_status PENDING
- EntryOrderProduct for Panadol 500mg created

#### Step 2: Administrative Review (ADMIN)
**User**: Dr. Juan Martinez (ADMIN)
**Action**: Reviews and approves entry order

```javascript
// POST /entry/entry-orders/OI202503/review
{
  "review_status": "APPROVED",
  "review_comments": "Panadol shipment verified. Documentation complete. Approved for warehouse allocation."
}
```

**Database State**:
- EntryOrder review_status changed to APPROVED
- Order now appears in allocation queue

#### Step 3: Warehouse Allocation (WAREHOUSE_INCHARGE)
**User**: Carlos Rodriguez (WAREHOUSE_INCHARGE)
**Action**: Allocates Panadol to warehouse cell

```javascript
// POST /inventory/assign-product
{
  "entry_order_product_id": "eop-panadol-uuid",
  "cell_id": "cell-b-02-15-uuid", // Cell B.02.15
  "assigned_by": "carlos-uuid",
  "inventory_quantity": 5000,
  "package_quantity": 50,
  "weight_kg": 125.0,
  "volume_m3": 5.2,
  "product_status": "CAJ_NORMAL", // Box packaging, normal condition
  "warehouse_id": "main-warehouse-uuid",
  "observations": "Panadol allocated to ambient temperature zone"
}
```

**Database State**:
- InventoryAllocation created with quality_status CUARENTENA
- Inventory record created with status QUARANTINED
- Cell B.02.15 marked as OCCUPIED
- InventoryLog entry with movement_type ENTRY

#### Step 4: Quality Control (PHARMACIST)
**User**: Dra. Ana Gonzalez (PHARMACIST)
**Action**: Inspects and approves Panadol for dispatch

```javascript
// POST /inventory/quality-transition
{
  "allocation_id": "alloc-panadol-uuid",
  "to_status": "APROBADO",
  "quantity_to_move": 5000,
  "package_quantity_to_move": 50,
  "weight_to_move": 125.0,
  "reason": "Quality inspection completed",
  "notes": "Panadol 500mg tablets inspected. All quality parameters within specifications. Approved for patient distribution."
}
```

**Database State**:
- InventoryAllocation quality_status changed to APROBADO
- Inventory status changed to AVAILABLE
- InventoryLog entry with movement_type TRANSFER (quality transition)

#### Step 5: Departure Order Creation (CLIENT)
**User**: Sofia Chen (CLIENT - Hospital Central)
**Action**: Orders Panadol for hospital pharmacy

```javascript
// POST /departure/departure-orders
{
  "departure_order_no": "DO202501",
  "departure_date_time": "2025-08-17T14:00:00Z",
  "destination_point": "Hospital Central - Emergency Pharmacy",
  "transport_type": "TRUCK",
  "carrier_name": "MedTransport Solutions",
  "client_id": "hospital-central-uuid",
  "warehouse_id": "main-warehouse-uuid",
  "dispatch_document_number": "DISP-HC-2025-001",
  "products": [
    {
      "product_id": "panadol-500mg-uuid",
      "requested_quantity": 1000, // 1000 tablets
      "requested_packages": 10,   // 10 boxes
      "unit_price": 2.50,
      "total_price": 2500.00
    }
  ]
}
```

**FIFO Logic Applied**:
System automatically selects:
- Allocation: alloc-panadol-uuid (earliest expiry: 2027-06-01)
- Cell: B.02.15
- Lot: PAN20250815001

**Database State**:
- DepartureOrder created with status PENDING
- DepartureOrderProduct created for 1000 tablets
- DepartureAllocation links to source InventoryAllocation

#### Step 6: Departure Order Approval (ADMIN)
**User**: Dr. Juan Martinez (ADMIN)
**Action**: Reviews and approves departure order

```javascript
// POST /departure/departure-orders/DO202501/review
{
  "review_status": "APPROVED",
  "review_comments": "Hospital Central order verified. Quantities confirmed. Approved for dispatch."
}
```

#### Step 7: Physical Dispatch (WAREHOUSE_INCHARGE)
**User**: Carlos Rodriguez (WAREHOUSE_INCHARGE)
**Action**: Physically dispatches products and updates system

```javascript
// POST /departure/departure-orders/DO202501/dispatch
{
  "dispatched_by": "carlos-uuid",
  "dispatch_notes": "10 boxes Panadol 500mg loaded. Driver: Miguel Santos. Vehicle: MED-2025-15. Departed 14:30.",
  "actual_dispatch_time": "2025-08-17T14:30:00Z",
  "products_dispatched": [
    {
      "departure_order_product_id": "dop-panadol-uuid",
      "dispatched_quantity": 1000,
      "dispatched_packages": 10,
      "dispatched_weight": 25.0
    }
  ]
}
```

**Final Database State**:

1. **InventoryAllocation** (source):
```javascript
{
  "allocation_id": "alloc-panadol-uuid",
  "inventory_quantity": 5000, // Original
  "quality_status": "APROBADO",
  "status": "ACTIVE"
}
```

2. **Inventory** (updated):
```javascript
{
  "inventory_id": "inv-panadol-uuid",
  "current_quantity": 4000, // 5000 - 1000 dispatched
  "current_package_quantity": 40, // 50 - 10 dispatched
  "current_weight": 100.0, // 125.0 - 25.0 dispatched
  "status": "AVAILABLE" // Still available
}
```

3. **Cell B.02.15** (updated):
```javascript
{
  "status": "OCCUPIED", // Still has inventory
  "current_packaging_qty": 40, // Updated
  "current_weight": 100.0, // Updated
  "currentUsage": 4.16 // Updated volume
}
```

4. **DepartureOrder** (completed):
```javascript
{
  "departure_order_no": "DO202501",
  "order_status": "COMPLETED",
  "dispatch_status": "DISPATCHED",
  "dispatched_at": "2025-08-17T14:30:00Z",
  "dispatched_by": "carlos-uuid"
}
```

5. **InventoryLog** (dispatch entry):
```javascript
{
  "movement_type": "DEPARTURE",
  "quantity_change": -1000,
  "package_change": -10,
  "weight_change": -25.0,
  "departure_order_id": "do-panadol-uuid",
  "notes": "Dispatched 1000 tablets (10 boxes) to Hospital Central via DO202501"
}
```

### Summary of Complete Workflow

1. **ENTRY**: PharmaCorp CLIENT creates order for 5000 Panadol tablets
2. **APPROVAL**: Admin reviews and approves entry order  
3. **ALLOCATION**: Warehouse staff allocates to cell B.02.15 (CUARENTENA status)
4. **QUALITY**: Pharmacist inspects and approves (APROBADO status)
5. **DEPARTURE**: Hospital CLIENT orders 1000 tablets with FIFO selection
6. **DISPATCH**: Warehouse staff physically dispatches products

### Key Technical Features Demonstrated

- **Role-based Access Control**: Each step restricted to appropriate users
- **Status Progression**: PENDING → APPROVED → CUARENTENA → APROBADO → DISPATCHED
- **FIFO Logic**: Earliest expiry products selected automatically
- **Quantity Tracking**: Precise inventory reduction at each step
- **Audit Trail**: Complete history in InventoryLog table
- **Data Integrity**: Atomic transactions ensure consistency
- **Cell Management**: Real-time capacity and usage tracking

This comprehensive workflow ensures pharmaceutical products are safely managed from receipt through quality control to patient delivery, maintaining complete traceability and regulatory compliance.

---

## API Endpoints Summary

### Entry Orders
- `POST /entry/entry-orders` - Create entry order (CLIENT only)
- `GET /entry/entry-orders` - List entry orders (role-filtered)
- `GET /entry/entry-orders/:orderNo` - Get specific entry order
- `PUT /entry/entry-orders/:orderNo` - Update entry order (CLIENT, NEEDS_REVISION only)
- `POST /entry/entry-orders/:orderNo/review` - Review entry order (ADMIN/WAREHOUSE)

### Inventory Management
- `GET /inventory/approved-entry-orders` - Get approved orders for allocation
- `POST /inventory/assign-product` - Allocate product to cell
- `GET /inventory/quarantine` - Get quarantine inventory for QC
- `POST /inventory/quality-transition` - Perform quality control transition
- `GET /inventory/by-quality-status` - Get inventory by quality status

### Departure Orders
- `POST /departure/departure-orders` - Create departure order
- `GET /departure/departure-orders` - List departure orders
- `POST /departure/departure-orders/:orderId/dispatch` - Dispatch products

### Reports & Analytics
- `GET /reports/warehouse` - Complete warehouse inventory report
- `GET /reports/product-category` - Quality status breakdown by product
- `GET /reports/cardex` - Stock movements with opening/closing balances
- `GET /inventory/movements` - Independent movement logs with historical state

This documentation provides a complete understanding of the TSLogix pharmaceutical warehouse management system workflow.