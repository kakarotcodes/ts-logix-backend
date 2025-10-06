const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

/**
 * Migration script to update existing client data to support multi-user architecture
 *
 * This script:
 * 1. Adds client_id to existing entry orders
 * 2. Creates ClientUser records for existing auto-generated users
 * 3. Updates authentication tokens if needed
 *
 * Run with: node migrate-to-multi-user.js
 */

async function migrateToMultiUser() {
  console.log("🚀 Starting migration to multi-user client architecture...");
  console.log("📅 Migration started at:", new Date().toISOString());

  try {
    // Step 1: Add client_id to existing entry orders
    console.log("\n📋 Step 1: Adding client_id to existing entry orders...");

    const entryOrdersWithoutClientId = await prisma.entryOrder.findMany({
      where: { client_id: null },
      include: {
        creator: {
          include: {
            clientUserAccounts: {
              include: { client: true }
            }
          }
        }
      }
    });

    let updatedEntryOrders = 0;
    for (const entryOrder of entryOrdersWithoutClientId) {
      if (entryOrder.creator?.clientUserAccounts?.length > 0) {
        const clientId = entryOrder.creator.clientUserAccounts[0].client_id;

        await prisma.entryOrder.update({
          where: { entry_order_id: entryOrder.entry_order_id },
          data: { client_id: clientId }
        });

        updatedEntryOrders++;
      }
    }

    console.log(`✅ Updated ${updatedEntryOrders} entry orders with client_id`);

    // Step 2: Find existing users that need ClientUser records
    console.log("\n👥 Step 2: Creating ClientUser records for existing users...");

    const clientUsers = await prisma.user.findMany({
      where: {
        role: { name: "CLIENT" }
      },
      include: {
        clientUserAccounts: true
      }
    });

    let createdClientUserRecords = 0;
    for (const user of clientUsers) {
      // Skip if user already has ClientUser records
      if (user.clientUserAccounts.length > 0) {
        continue;
      }

      // Try to find the client this user belongs to
      // Look for clients where this user was the creator or matches the deprecated client_user_id
      const client = await prisma.client.findFirst({
        where: {
          OR: [
            { created_by: user.id },
            // If there are deprecated client_user_id references, use them
            // Note: these fields have been removed from schema, so this might not work
          ]
        }
      });

      if (client) {
        // Create ClientUser record
        await prisma.clientUser.create({
          data: {
            client_id: client.client_id,
            user_id: user.id,
            username: user.user_id, // Use the same username as user_id
            is_primary: true, // Existing users become primary users
            is_active: true,
            created_by: client.created_by,
            notes: `Migrated from existing user during multi-user migration on ${new Date().toISOString()}`
          }
        });

        createdClientUserRecords++;
        console.log(`✅ Created ClientUser record for user ${user.user_id} → client ${client.client_id}`);
      } else {
        console.log(`⚠️ Could not find client for user ${user.user_id} (${user.email})`);
      }
    }

    console.log(`✅ Created ${createdClientUserRecords} ClientUser records`);

    // Step 3: Update any remaining entry orders without client_id
    console.log("\n🔍 Step 3: Handling remaining entry orders without client_id...");

    const remainingEntryOrders = await prisma.entryOrder.findMany({
      where: { client_id: null },
      include: { creator: true }
    });

    if (remainingEntryOrders.length > 0) {
      console.log(`⚠️ Found ${remainingEntryOrders.length} entry orders still without client_id`);
      console.log("These need manual review:");

      for (const order of remainingEntryOrders) {
        console.log(`- Order: ${order.entry_order_no}, Creator: ${order.creator.email}`);
      }
    }

    // Step 4: Generate migration report
    console.log("\n📊 Migration Summary:");

    const totalClients = await prisma.client.count();
    const totalClientUsers = await prisma.clientUser.count();
    const totalEntryOrdersWithClientId = await prisma.entryOrder.count({
      where: { client_id: { not: null } }
    });
    const totalEntryOrdersWithoutClientId = await prisma.entryOrder.count({
      where: { client_id: null }
    });

    console.log(`📈 Total clients: ${totalClients}`);
    console.log(`👥 Total ClientUser records: ${totalClientUsers}`);
    console.log(`📋 Entry orders with client_id: ${totalEntryOrdersWithClientId}`);
    console.log(`⚠️ Entry orders without client_id: ${totalEntryOrdersWithoutClientId}`);

    // Step 5: Verify data integrity
    console.log("\n🔍 Data Integrity Check:");

    const clientsWithoutUsers = await prisma.client.findMany({
      where: {
        clientUsers: { none: {} }
      },
      select: { client_id: true, email: true }
    });

    if (clientsWithoutUsers.length > 0) {
      console.log(`⚠️ Found ${clientsWithoutUsers.length} clients without any users:`);
      clientsWithoutUsers.forEach(client => {
        console.log(`- Client: ${client.client_id}, Email: ${client.email}`);
      });
    } else {
      console.log("✅ All clients have at least one user");
    }

    console.log("\n🎉 Migration completed successfully!");
    console.log("📅 Migration finished at:", new Date().toISOString());

    console.log("\n📝 Next Steps:");
    console.log("1. Update Prisma schema to remove deprecated fields");
    console.log("2. Run 'npx prisma db push' to update database schema");
    console.log("3. Test client login and entry order creation");
    console.log("4. Verify reports show correct data filtering");

  } catch (error) {
    console.error("❌ Migration failed:", error);
    console.error("Stack trace:", error.stack);
    throw error;
  }
}

// Helper function to create default users for clients without any users
async function createDefaultUsersForOrphanedClients() {
  console.log("\n🔧 Creating default users for clients without users...");

  const clientsWithoutUsers = await prisma.client.findMany({
    where: {
      clientUsers: { none: {} }
    },
    include: {
      creator: true
    }
  });

  let createdDefaultUsers = 0;

  for (const client of clientsWithoutUsers) {
    try {
      // Generate default credentials based on client type
      let defaultUsername, defaultPassword;

      if (client.client_type === "JURIDICO" && client.ruc) {
        defaultUsername = client.ruc;
        defaultPassword = client.ruc;
      } else if (client.client_type === "NATURAL" && client.individual_id) {
        defaultUsername = client.individual_id;
        defaultPassword = client.individual_id;
      } else {
        defaultUsername = `client_${client.client_id.substring(0, 8)}`;
        defaultPassword = "TempPass123!";
      }

      // Get CLIENT role
      const clientRole = await prisma.role.findUnique({
        where: { name: "CLIENT" }
      });

      if (!clientRole) {
        console.error("❌ CLIENT role not found");
        continue;
      }

      // Create User account
      const passwordHash = await bcrypt.hash(defaultPassword, 10);
      const newUser = await prisma.user.create({
        data: {
          user_id: defaultUsername,
          email: client.email,
          password_hash: passwordHash,
          role_id: clientRole.role_id,
          organisation_id: client.creator.organisation_id,
          first_name: client.first_names || client.company_name?.split(" ")[0] || "Client",
          last_name: client.last_name || ""
        }
      });

      // Create ClientUser record
      await prisma.clientUser.create({
        data: {
          client_id: client.client_id,
          user_id: newUser.id,
          username: defaultUsername,
          is_primary: true,
          is_active: true,
          created_by: client.created_by,
          notes: `Default user created during migration on ${new Date().toISOString()}`
        }
      });

      createdDefaultUsers++;
      console.log(`✅ Created default user ${defaultUsername} for client ${client.client_id}`);

    } catch (error) {
      console.error(`❌ Failed to create default user for client ${client.client_id}:`, error.message);
    }
  }

  console.log(`✅ Created ${createdDefaultUsers} default users`);
}

// Main execution
async function main() {
  try {
    await migrateToMultiUser();

    // Optionally create default users for orphaned clients
    const shouldCreateDefaults = process.argv.includes("--create-defaults");
    if (shouldCreateDefaults) {
      await createDefaultUsersForOrphanedClients();
    }

  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = { migrateToMultiUser, createDefaultUsersForOrphanedClients };