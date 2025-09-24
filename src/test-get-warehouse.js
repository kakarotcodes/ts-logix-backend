require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function getWarehouse() {
  try {
    console.log('🔍 Fetching warehouse...\n');

    const warehouse = await prisma.warehouse.findFirst({
      select: {
        warehouse_id: true,
        name: true,
        location: true
      }
    });

    if (warehouse) {
      console.log('🏭 Found warehouse:');
      console.log(`- Warehouse ID: ${warehouse.warehouse_id}`);
      console.log(`- Name: ${warehouse.name}`);
      console.log(`- Location: ${warehouse.location}`);
    } else {
      console.log('❌ No warehouse found.');
    }

    return warehouse;

  } catch (error) {
    console.error('❌ Error fetching warehouse:', error.message);
    return null;
  } finally {
    await prisma.$disconnect();
  }
}

getWarehouse();