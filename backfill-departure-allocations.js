/**
 * Backfill Script: Create missing departureAllocation records
 *
 * This script fixes existing completed departure orders that have cellAssignments
 * but no departureAllocation records (needed for master report).
 *
 * CRITICAL: This ensures data integrity and master report functionality.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfillDepartureAllocations() {
  console.log('🔧 Starting departureAllocation backfill process...\n');

  try {
    // Step 1: Find all departure orders with cellAssignments but no departureAllocations
    const ordersNeedingBackfill = await prisma.departureOrder.findMany({
      where: {
        cellAssignments: {
          some: {} // Has at least one cell assignment
        },
        order_status: {
          in: ['COMPLETED', 'DISPATCHED']
        }
      },
      include: {
        cellAssignments: {
          include: {
            cell: {
              include: {
                inventoryAllocations: {
                  where: {
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
                    }
                  }
                }
              }
            }
          }
        },
        departureAllocations: true,
        products: {
          select: {
            departure_order_product_id: true,
            product_id: true,
            product_code: true,
            requested_quantity: true,
            requested_weight: true
          }
        },
        creator: {
          select: {
            id: true,
            user_id: true,
            first_name: true,
            last_name: true
          }
        }
      }
    });

    console.log(`📋 Found ${ordersNeedingBackfill.length} departure order(s) to analyze\n`);

    let totalCreated = 0;
    let totalOrders = 0;

    for (const order of ordersNeedingBackfill) {
      // Check if this order already has departureAllocations
      if (order.departureAllocations && order.departureAllocations.length > 0) {
        console.log(`✓ Order ${order.departure_order_no} already has ${order.departureAllocations.length} allocation(s). Skipping.`);
        continue;
      }

      console.log(`\n🔍 Processing Order: ${order.departure_order_no}`);
      console.log(`   Status: ${order.order_status}`);
      console.log(`   Cell Assignments: ${order.cellAssignments.length}`);
      console.log(`   Products: ${order.products.length}`);

      // Create a map of product_id to departure_order_product_id
      const productMap = new Map();
      order.products.forEach(p => {
        productMap.set(p.product_id, {
          departure_order_product_id: p.departure_order_product_id,
          requested_quantity: p.requested_quantity,
          requested_weight: p.requested_weight,
          product_code: p.product_code
        });
      });

      // Track allocations created for this order
      const allocationsToCreate = [];

      // Process each cell assignment
      for (const cellAssignment of order.cellAssignments) {
        const cell = cellAssignment.cell;

        // Find the inventory allocation in this cell (should be depleted now)
        // We need to find it by looking at the cell's history
        const inventoryAllocs = cell.inventoryAllocations || [];

        // Try to find a matching inventory allocation
        // Since inventory might be depleted, we look at all allocations in the cell
        for (const invAlloc of inventoryAllocs) {
          const productId = invAlloc.entry_order_product?.product_id;

          if (!productId) {
            console.log(`   ⚠️  Skipping allocation ${invAlloc.allocation_id} - no product_id`);
            continue;
          }

          const productInfo = productMap.get(productId);

          if (!productInfo) {
            console.log(`   ⚠️  Product ${invAlloc.entry_order_product?.product?.product_code} not in departure order. Skipping.`);
            continue;
          }

          // Create the departureAllocation record
          allocationsToCreate.push({
            departure_order_id: order.departure_order_id,
            departure_order_product_id: productInfo.departure_order_product_id,
            source_allocation_id: invAlloc.allocation_id,
            allocated_quantity: parseInt(cellAssignment.packaging_quantity || 0),
            allocated_packages: parseInt(cellAssignment.packaging_quantity || 0),
            allocated_pallets: null,
            presentation: invAlloc.presentation || 'CAJA',
            allocated_weight: parseFloat(cellAssignment.weight || 0),
            allocated_volume: null,
            cell_id: cell.id,
            product_status: invAlloc.product_status || 'PAL_NORMAL',
            status_code: invAlloc.status_code || 37,
            guide_number: null,
            observations: `Backfilled from cell assignment - Order ${order.departure_order_no}`,
            allocated_by: order.creator?.id || cellAssignment.assigned_by,
            allocated_at: order.dispatched_at || order.registration_date || new Date(),
            status: 'ACTIVE'
          });

          console.log(`   ✓ Prepared allocation for ${invAlloc.entry_order_product?.product?.product_code} (${cellAssignment.packaging_quantity} units, ${cellAssignment.weight} kg)`);
        }
      }

      // Create all allocations for this order in a transaction
      if (allocationsToCreate.length > 0) {
        await prisma.$transaction(async (tx) => {
          for (const allocation of allocationsToCreate) {
            await tx.departureAllocation.create({
              data: allocation
            });
          }
        });

        console.log(`   ✅ Created ${allocationsToCreate.length} departureAllocation record(s) for ${order.departure_order_no}`);
        totalCreated += allocationsToCreate.length;
        totalOrders++;
      } else {
        console.log(`   ⚠️  No allocations could be created for ${order.departure_order_no}`);
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ BACKFILL COMPLETE`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Orders processed: ${totalOrders}`);
    console.log(`Allocations created: ${totalCreated}`);
    console.log(`\n✅ Master report should now show data for these orders!\n`);

  } catch (error) {
    console.error('\n❌ ERROR during backfill:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the backfill
backfillDepartureAllocations()
  .then(() => {
    console.log('🎉 Backfill script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Backfill script failed:', error);
    process.exit(1);
  });
