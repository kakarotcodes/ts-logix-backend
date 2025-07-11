const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function updatePassageCells() {
  try {
    console.log("🔄 Starting passage cell updates...");
    
    // Update B row specific passages: B.13.01, B.13.02, B.13.03, B.14.01, B.14.02, B.14.03
    const bRowPassages = await prisma.warehouseCell.updateMany({
      where: {
        row: 'B',
        OR: [
          { bay: 13, position: { in: [1, 2, 3] } },
          { bay: 14, position: { in: [1, 2, 3] } }
        ]
      },
      data: {
        is_passage: true
      }
    });
    console.log(`✅ Updated ${bRowPassages.count} B row passage cells`);
    
    // Update C to P rows: same pattern as B row - passages in bays 13 and 14, positions 1, 2, 3
    const otherRowPassages = await prisma.warehouseCell.updateMany({
      where: {
        row: { in: ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'] },
        OR: [
          { bay: 13, position: { in: [1, 2, 3] } },
          { bay: 14, position: { in: [1, 2, 3] } }
        ]
      },
      data: {
        is_passage: true
      }
    });
    console.log(`✅ Updated ${otherRowPassages.count} C-P row passage cells`);
    
    // Update Q row: same pattern
    const qRowPassages = await prisma.warehouseCell.updateMany({
      where: {
        row: 'Q',
        OR: [
          { bay: 13, position: { in: [1, 2, 3] } },
          { bay: 14, position: { in: [1, 2, 3] } }
        ]
      },
      data: {
        is_passage: true
      }
    });
    console.log(`✅ Updated ${qRowPassages.count} Q row passage cells`);
    
    // Verify the updates
    const totalPassageCells = await prisma.warehouseCell.count({
      where: { is_passage: true }
    });
    
    const totalCells = await prisma.warehouseCell.count();
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total cells: ${totalCells}`);
    console.log(`   Passage cells: ${totalPassageCells}`);
    console.log(`   Storage cells: ${totalCells - totalPassageCells}`);
    console.log(`\n✅ Passage cell updates completed successfully!`);
    
    // Show some examples of updated cells
    const examplePassages = await prisma.warehouseCell.findMany({
      where: { is_passage: true },
      select: {
        row: true,
        bay: true,
        position: true,
        is_passage: true
      },
      take: 10,
      orderBy: [
        { row: 'asc' },
        { bay: 'asc' },
        { position: 'asc' }
      ]
    });
    
    console.log(`\n🔍 Example passage cells:`);
    examplePassages.forEach(cell => {
      console.log(`   ${cell.row}.${cell.bay}.${cell.position} - is_passage: ${cell.is_passage}`);
    });
    
  } catch (error) {
    console.error("❌ Error updating passage cells:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the update
updatePassageCells()
  .then(() => {
    console.log("\n🎉 Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });