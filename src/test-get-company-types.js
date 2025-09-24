require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function getCompanyTypes() {
  try {
    console.log('🔍 Fetching company types...\n');

    const companyTypes = await prisma.companyType.findMany({
      select: {
        company_type_id: true,
        name: true,
        description: true
      }
    });

    console.log('🏢 Found company types:');
    companyTypes.forEach(type => {
      console.log(`- ID: ${type.company_type_id}`);
      console.log(`  Name: ${type.name}`);
      console.log(`  Description: ${type.description}`);
      console.log('');
    });

    if (companyTypes.length === 0) {
      console.log('❌ No company types found.');
    }

    return companyTypes;

  } catch (error) {
    console.error('❌ Error fetching company types:', error.message);
    return [];
  } finally {
    await prisma.$disconnect();
  }
}

getCompanyTypes();