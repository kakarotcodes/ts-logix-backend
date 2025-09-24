require('dotenv').config();
const clientService = require('./modules/client/client.service');

async function testClientEmailFlow() {
  console.log('🧪 Testing complete client creation with email flow...\n');

  // Mock user context (admin user)
  const userContext = {
    userId: 'admin1',
    userRole: 'ADMIN',
    email: 'admin1@tslogix.com'
  };

  // Test client data
  const testClientData = {
    client_type: 'JURIDICO',
    company_name: 'Email Test Company Ltd',
    email: 'monishobaid1@gmail.com',
    ruc: '12345678901',
    phone: '123456789',
    cell_phone: '987654321',
    address: 'Test Address 123, Lima, Peru',
    // Required for juridical clients
    company_type: 'S.A.C.',
    establishment_type: 'COMERCIAL',
    // Creator information (warehouse incharge UUID)
    created_by: '0c615596-235c-4edd-a25f-2263e48bbdeb'
  };

  // Cell assignment data (separate parameter)
  const cellAssignmentData = {
    cell_ids: ['000a3e7e-4a3d-4706-9feb-de5f40491a05'],
    warehouse_id: '7a8cf14d-b5d5-447d-bd5e-6c4a2c3eb8a3',
    assigned_by: userContext.userId
  };

  try {
    console.log('📝 Creating client with data:');
    console.log(JSON.stringify(testClientData, null, 2));
    console.log('\n📦 Cell assignment data:');
    console.log(JSON.stringify(cellAssignmentData, null, 2));
    console.log('');

    // Call the client creation service directly with both parameters
    const result = await clientService.createClient(testClientData, cellAssignmentData);

    if (result.success) {
      console.log('✅ Client creation successful!');
      console.log('📧 Client ID:', result.data.client_id);
      console.log('📧 Email should have been sent to:', testClientData.email);
      console.log('📧 Check the console logs above for email sending status');
    } else {
      console.log('❌ Client creation failed:', result.message);
      if (result.error) {
        console.log('Error details:', result.error);
      }
    }

  } catch (error) {
    console.error('🚨 Test error:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testClientEmailFlow();