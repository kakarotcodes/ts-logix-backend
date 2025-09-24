require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkUsers() {
  try {
    console.log('🔍 Checking existing users in database...');

    const users = await prisma.user.findMany({
      select: {
        id: true,
        user_id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: {
          select: {
            name: true
          }
        }
      },
      take: 10
    });

    console.log('\n📊 Found users:');
    users.forEach(user => {
      console.log(`- ID (UUID): ${user.id}`);
      console.log(`  User ID: ${user.user_id}`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Name: ${user.first_name} ${user.last_name}`);
      console.log(`  Role: ${user.role?.name || 'No role'}`);
      console.log('');
    });

    if (users.length === 0) {
      console.log('❌ No users found. You may need to seed the database.');
    }

  } catch (error) {
    console.error('❌ Error checking users:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();