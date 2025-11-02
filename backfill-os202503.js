/**
 * Backfill Script: Create departureAllocation for OS202503
 *
 * Simplified script to fix the specific order OS202503
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfillOS202503() {
  console.log('🔧 Backfilling departureAllocation for OS202503...\n');

  try {
    // Get the departure order
    const order = await prisma.departureOrder.findFirst({
      where: { departure_order_no: 'OS202503' },
      include: {
        products: {
          select: {
            departure_order_product_id: true,
            product_id: true,
            product_code: true
          }
        }
      }
    });

    if (!order) {
      console.log('❌ Order OS202503 not found!');
      return;
    }

    console.log(`✓ Found order: ${order.departure_order_no}`);
    console.log(`  Status: ${order.order_status}`);
    console.log(`  Products: ${order.products.length}`);

    // Get the cell assignment for this order
    const cellAssignment = await prisma.cellAssignment.findFirst({
      where: { departure_order_id: order.departure_order_id },
      include: {
        cell: {
          select: {
            id: true,
            row: true,
            bay: true,
            position: true
          }
        }
      }
    });

    if (!cellAssignment) {
      console.log('❌ No cell assignment found for this order!');
      return;
    }

    console.log(`✓ Found cell assignment: ${cellAssignment.cell.row}.${cellAssignment.cell.bay}.${cellAssignment.cell.position}`);

    // Find the inventory allocation in that cell (will be DEPLETED now)
    const invAllocation = await prisma.inventoryAllocation.findFirst({
      where: {
        cell_id: cellAssignment.cell_id,
        // Look for the allocation that was depleted
        status: 'ACTIVE'
      },
      include: {
        entry_order_product: {
          select: {
            product_id: true,
            product: {
              select: {
                product_code: true,
                name: true
              }
            }
          }
        },
        inventory: {
          select: {
            status: true,
            current_quantity: true
          }
        }
      }
    });

    if (!invAllocation) {
      console.log('❌ No inventory allocation found in that cell!');
      return;
    }

    console.log(`✓ Found inventory allocation for product: ${invAllocation.entry_order_product.product.product_code}`);
    console.log(`  Allocation status: ${invAllocation.status}`);
    console.log(`  Inventory status: ${invAllocation.inventory[0]?.status}`);
    console.log(`  Current quantity: ${invAllocation.inventory[0]?.current_quantity}`);

    // Find matching departure_order_product
    const departureProduct = order.products.find(
      p => p.product_id === invAllocation.entry_order_product.product_id
    );

    if (!departureProduct) {
      console.log(`❌ Product ${invAllocation.entry_order_product.product.product_code} not in departure order!`);
      return;
    }

    console.log(`✓ Matched to departure_order_product_id: ${departureProduct.departure_order_product_id}`);

    // Check if departureAllocation already exists
    const existing = await prisma.departureAllocation.findFirst({
      where: {
        departure_order_id: order.departure_order_id,
        source_allocation_id: invAllocation.allocation_id
      }
    });

    if (existing) {
      console.log('✓ departureAllocation already exists! No action needed.');
      return;
    }

    // Create the departureAllocation
    const created = await prisma.departureAllocation.create({
      data: {
        departure_order_id: order.departure_order_id,
        departure_order_product_id: departureProduct.departure_order_product_id,
        source_allocation_id: invAllocation.allocation_id,
        allocated_quantity: parseInt(cellAssignment.packaging_quantity || 100),
        allocated_packages: parseInt(cellAssignment.packaging_quantity || 100),
        allocated_pallets: null,
        presentation: invAllocation.presentation || 'CAJA',
        allocated_weight: parseFloat(cellAssignment.weight || 100),
        allocated_volume: null,
        cell_id: cellAssignment.cell_id,
        product_status: invAllocation.product_status || 'PAL_NORMAL',
        status_code: invAllocation.status_code || 37,
        guide_number: null,
        observations: 'Backfilled from manual script for master report',
        allocated_by: order.created_by,
        allocated_at: order.dispatched_at || order.registration_date,
        status: 'ACTIVE'
      }
    });

    console.log(`\n✅ SUCCESS! Created departureAllocation:`);
    console.log(`   ID: ${created.departure_allocation_id}`);
    console.log(`   Quantity: ${created.allocated_quantity}`);
    console.log(`   Weight: ${created.allocated_weight} kg`);
    console.log(`\n🎉 Master report should now show data for OS202503!`);

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

backfillOS202503()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
