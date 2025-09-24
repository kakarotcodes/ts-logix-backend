require('dotenv').config();
const emailService = require('./utils/emailService');

async function testEmail() {
  console.log('🧪 Testing email service...');

  // Test client data
  const testClientData = {
    client_type: 'JURIDICO',
    company_name: 'Test Email Company',
    client_code: 'C001',
    email: 'monishobaid1@gmail.com',
    ruc: '12345678901',
    phone: '123456789',
    cell_phone: '987654321',
    address: 'Test Address 123'
  };

  // Test credentials
  const testCredentials = {
    username: 'test_user_123',
    password: 'TempPass123!'
  };

  // Test creator data
  const testCreator = {
    id: 'test-creator-id',
    first_name: 'Test',
    last_name: 'Creator',
    email: 'creator@test.com'
  };

  try {
    console.log('📧 Sending onboarding email...');
    const result = await emailService.sendClientOnboardingEmail(testClientData, testCredentials);

    if (result.success) {
      console.log('✅ Email sent successfully!');
      console.log('📧 Message ID:', result.messageId);
    } else {
      console.log('❌ Email failed:', result.error);
    }

    console.log('📧 Sending admin notification...');
    const adminResult = await emailService.sendAdminNotificationEmail(testClientData, testCreator);

    if (adminResult.success) {
      console.log('✅ Admin notification sent successfully!');
      console.log('📧 Admin emails sent:', adminResult.adminEmailCount);
    } else {
      console.log('❌ Admin notification failed:', adminResult.error);
    }

  } catch (error) {
    console.error('🚨 Test error:', error.message);
  }
}

testEmail();