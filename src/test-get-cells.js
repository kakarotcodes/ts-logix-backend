require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function getAvailableCells() {
  try {
    console.log('🔍 Fetching available warehouse cells...\n');

    const cells = await prisma.warehouseCell.findMany({
      where: {
        status: 'AVAILABLE'
      },
      take: 5,
      select: {
        id: true,
        row: true,
        bay: true,
        position: true,
        status: true,
        capacity: true
      }
    });

    console.log('📦 Found available cells:');
    cells.forEach(cell => {
      console.log(`- Cell ID: ${cell.id}`);
      console.log(`  Position: Row ${cell.row}, Bay ${cell.bay}, Position ${cell.position}`);
      console.log(`  Capacity: ${cell.capacity}`);
      console.log(`  Status: ${cell.status}`);
      console.log('');
    });

    if (cells.length === 0) {
      console.log('❌ No available cells found.');
    } else {
      console.log(`✅ Found ${cells.length} available cells for testing.`);
    }

    return cells;

  } catch (error) {
    console.error('❌ Error fetching cells:', error.message);
    return [];
  } finally {
    await prisma.$disconnect();
  }
}

getAvailableCells();