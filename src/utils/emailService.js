const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');

/**
 * Email Service for TSLogix
 * Handles all email communications including client onboarding notifications
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.templatesCache = new Map();
    this.initializeTransporter();
  }

  /**
   * Initialize email transporter based on environment configuration
   */
  initializeTransporter() {
    try {
      // Check for required environment variables
      const emailConfig = {
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: process.env.EMAIL_SECURE === 'true' || false, // true for 465, false for other ports
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS, // App password for Gmail
        },
      };

      // Add additional configuration for different providers
      if (emailConfig.host.includes('gmail')) {
        emailConfig.service = 'gmail';
      } else if (emailConfig.host.includes('zoho')) {
        // Zoho-specific configuration
        emailConfig.host = 'smtp.zoho.com';
        emailConfig.port = parseInt(process.env.EMAIL_PORT) || 465;
        emailConfig.secure = process.env.EMAIL_SECURE === 'true' || true; // Use SSL for Zoho
        emailConfig.tls = {
          rejectUnauthorized: false
        };
        // Remove service property for manual SMTP configuration
      }

      this.transporter = nodemailer.createTransport(emailConfig);

      // Verify connection on initialization (disable for testing)
      this.transporter.verify((error, success) => {
        if (error) {
          console.error('❌ Email service initialization failed:', error.message);
          console.log('📧 Email notifications will not be sent. Please configure email settings.');
          // Don't block startup - set transporter to null for graceful degradation
          this.transporter = null;
        } else {
          console.log('✅ Email service initialized successfully');
        }
      });

    } catch (error) {
      console.error('❌ Error initializing email service:', error.message);
      console.log('📧 Email notifications will not be sent.');
    }
  }

  /**
   * Load and compile email template
   * @param {string} templateName - Name of the template file (without .hbs extension)
   * @returns {Function} Compiled handlebars template
   */
  async loadTemplate(templateName) {
    try {
      // Check cache first
      if (this.templatesCache.has(templateName)) {
        return this.templatesCache.get(templateName);
      }

      const templatePath = path.join(__dirname, '../templates/email', `${templateName}.hbs`);
      const templateContent = await fs.readFile(templatePath, 'utf8');
      const template = handlebars.compile(templateContent);

      // Cache the compiled template
      this.templatesCache.set(templateName, template);
      return template;

    } catch (error) {
      console.error(`❌ Error loading email template ${templateName}:`, error.message);

      // Return a fallback template
      return handlebars.compile(`
        <html>
          <body>
            <h1>{{subject}}</h1>
            <p>{{message}}</p>
            <p>This is a fallback email template.</p>
          </body>
        </html>
      `);
    }
  }

  /**
   * Send email with template
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {string} options.template - Template name
   * @param {Object} options.data - Template data
   * @param {string} [options.from] - Sender email (optional)
   * @returns {Promise<Object>} Email send result
   */
  async sendTemplatedEmail({ to, subject, template, data, from }) {
    try {
      if (!this.transporter) {
        console.warn('📧 Email service not configured. Email not sent.');
        return { success: false, error: 'Email service not configured' };
      }

      // Load and compile template
      const compiledTemplate = await this.loadTemplate(template);
      const htmlContent = compiledTemplate(data);

      // Prepare email options
      const mailOptions = {
        from: from || process.env.EMAIL_FROM || `"TSLogix System" <${process.env.EMAIL_USER}>`,
        to: to,
        subject: subject,
        html: htmlContent,
      };

      // Send email
      const result = await this.transporter.sendMail(mailOptions);

      console.log(`✅ Email sent successfully to ${to}:`, result.messageId);
      return {
        success: true,
        messageId: result.messageId,
        response: result.response
      };

    } catch (error) {
      console.error(`❌ Error sending email to ${to}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send client onboarding email
   * @param {Object} clientData - Client information
   * @param {Object} credentials - Login credentials
   * @returns {Promise<Object>} Email send result
   */
  async sendClientOnboardingEmail(clientData, credentials) {
    try {
      const clientName = clientData.client_type === 'JURIDICO'
        ? clientData.company_name
        : `${clientData.first_names} ${clientData.last_name}`;

      const subject = `Bienvenido a TSLogix - Su cuenta ha sido creada exitosamente`;

      const templateData = {
        clientName,
        clientType: clientData.client_type,
        clientCode: clientData.client_code,
        email: clientData.email,
        username: credentials.username,
        password: credentials.password,
        loginUrl: process.env.FRONTEND_URL || 'http://localhost:7072/login',
        supportEmail: process.env.SUPPORT_EMAIL || 'support@tslogix.com',
        companyName: 'TSLogix',
        currentYear: new Date().getFullYear(),

        // Additional client details
        ruc: clientData.ruc,
        individualId: clientData.individual_id,
        address: clientData.address,
        phone: clientData.phone,
        cellPhone: clientData.cell_phone,

        // Account setup instructions
        isJuridico: clientData.client_type === 'JURIDICO',
        isNatural: clientData.client_type === 'NATURAL',
      };

      return await this.sendTemplatedEmail({
        to: clientData.email,
        subject,
        template: 'client-onboarding',
        data: templateData
      });

    } catch (error) {
      console.error('❌ Error sending client onboarding email:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send password reset email
   * @param {Object} userData - User information
   * @param {string} resetToken - Password reset token
   * @returns {Promise<Object>} Email send result
   */
  async sendPasswordResetEmail(userData, resetToken) {
    try {
      const subject = 'TSLogix - Restablecimiento de Contraseña';
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:7072'}/reset-password?token=${resetToken}`;

      const templateData = {
        userName: userData.first_name || 'Usuario',
        resetUrl,
        expiryTime: '24 horas',
        supportEmail: process.env.SUPPORT_EMAIL || 'support@tslogix.com',
        companyName: 'TSLogix',
        currentYear: new Date().getFullYear(),
      };

      return await this.sendTemplatedEmail({
        to: userData.email,
        subject,
        template: 'password-reset',
        data: templateData
      });

    } catch (error) {
      console.error('❌ Error sending password reset email:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification email to administrators about new client
   * @param {Object} clientData - Client information
   * @param {Object} creatorData - User who created the client
   * @returns {Promise<Object>} Email send result
   */
  async sendAdminNotificationEmail(clientData, creatorData) {
    try {
      const clientName = clientData.client_type === 'JURIDICO'
        ? clientData.company_name
        : `${clientData.first_names} ${clientData.last_name}`;

      const subject = `Nuevo Cliente Registrado - ${clientName}`;

      const templateData = {
        clientName,
        clientType: clientData.client_type,
        clientCode: clientData.client_code,
        clientEmail: clientData.email,
        creatorName: `${creatorData.first_name} ${creatorData.last_name}`,
        creatorEmail: creatorData.email,
        createdAt: new Date().toLocaleString('es-PE'),
        adminUrl: `${process.env.FRONTEND_URL || 'http://localhost:7072'}/maintenance/client/${clientData.client_id}`,
        companyName: 'TSLogix',
        currentYear: new Date().getFullYear(),
      };

      // Get admin emails from environment or use default
      const adminEmails = process.env.ADMIN_EMAILS ?
        process.env.ADMIN_EMAILS.split(',').map(email => email.trim()) :
        ['admin@tslogix.com'];

      // Send to all admin emails
      const results = await Promise.all(
        adminEmails.map(email =>
          this.sendTemplatedEmail({
            to: email,
            subject,
            template: 'admin-client-notification',
            data: templateData
          })
        )
      );

      return {
        success: true,
        results,
        adminEmailCount: adminEmails.length
      };

    } catch (error) {
      console.error('❌ Error sending admin notification email:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Test email configuration
   * @returns {Promise<Object>} Test result
   */
  async testEmailConfiguration() {
    try {
      if (!this.transporter) {
        return { success: false, error: 'Email service not configured' };
      }

      const testResult = await this.transporter.verify();
      return { success: true, message: 'Email configuration is valid' };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        suggestion: 'Please check your email configuration in environment variables'
      };
    }
  }
}

// Create singleton instance
const emailService = new EmailService();

module.exports = emailService;