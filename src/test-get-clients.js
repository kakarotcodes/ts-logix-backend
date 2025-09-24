require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function getExistingClients() {
  try {
    console.log('🔍 Fetching existing clients...\n');

    const clients = await prisma.client.findMany({
      take: 3,
      select: {
        client_id: true,
        client_type: true,
        company_name: true,
        email: true,
        company_type_id: true,
        ruc: true
      }
    });

    console.log('🏢 Found clients:');
    clients.forEach(client => {
      console.log(`- Client ID: ${client.client_id}`);
      console.log(`  Type: ${client.client_type}`);
      console.log(`  Company Name: ${client.company_name}`);
      console.log(`  Email: ${client.email}`);
      console.log(`  Company Type ID: ${client.company_type_id}`);
      console.log(`  RUC: ${client.ruc}`);
      console.log('');
    });

    return clients;

  } catch (error) {
    console.error('❌ Error fetching clients:', error.message);
    return [];
  } finally {
    await prisma.$disconnect();
  }
}

getExistingClients();