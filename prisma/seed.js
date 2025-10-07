const {
  PrismaClient,
  RoleName,
  CellStatus,
  MovementType,
  InventoryStatus,
  ReviewStatus,
  CellRole,
  CellKind,
  OriginType,
  DocumentTypeEntry,
  DocumentTypeDeparture,
  OrderStatusEntry,
  OrderStatusDeparture,
  PresentationType,
  TemperatureRangeType,
  ProductStatus,
  QualityControlStatus,
  SystemAction,
  ClientType,
  CompanyType,
  EstablishmentType,
  PackagingType,
} = require("@prisma/client");
const { faker } = require("@faker-js/faker");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

// Helper function to calculate status code from ProductStatus enum
function getStatusCodeFromEnum(productStatus) {
  const statusMapping = {
    'PAL_NORMAL': 30, 'CAJ_NORMAL': 31, 'SAC_NORMAL': 32, 'UNI_NORMAL': 33,
    'PAQ_NORMAL': 34, 'TAM_NORMAL': 35, 'BUL_NORMAL': 36, 'OTR_NORMAL': 37,
    'PAL_DANADA': 40, 'CAJ_DANADA': 41, 'SAC_DANADO': 42, 'UNI_DANADA': 43,
    'PAQ_DANADO': 44, 'TAM_DANADO': 45, 'BUL_DANADO': 46, 'OTR_DANADO': 47,
  };
  return statusMapping[productStatus] || 30;
}

// Number of records to create
const COUNT = {
  ORGANISATIONS: 4,
  USERS: 20,
  SUPPLIERS: 15,
  CUSTOMERS: 20,
  CLIENTS: 25, // ✅ NEW: Clients count
  PRODUCTS: 30,
  WAREHOUSES: 3,
  ENTRY_ORDERS: 25,
  DEPARTURE_ORDERS: 15,
};

// NEW: Helper function to create audit log entries
async function createAuditLog(userId, action, entityType, entityId, description, oldValues, newValues, metadata) {
  await prisma.systemAuditLog.create({
    data: {
      user_id: userId,
      action: action,
      entity_type: entityType,
      entity_id: entityId,
      description: description,
      old_values: oldValues || null,
      new_values: newValues || null,
      metadata: metadata || null,
      ip_address: "192.168.1.100", // Mock IP
      user_agent: "Seed Script v1.0",
      session_id: `seed-session-${Date.now()}`,
    },
  });
}

async function createBaseLookupTables() {
  try {
    console.log("Creating base lookup tables...");

    // Countries - Use populate countries function to get all countries
    console.log("Creating countries...");
    try {
      const { populateCountries } = require("../scripts/populate-countries");
      const result = await populateCountries();
      console.log(`✅ Countries populated: ${result.total_countries_now} total countries`);
    } catch (error) {
      console.log("⚠️  Fallback to basic countries...");
      await prisma.country.createMany({
        data: [
          { name: "Peru" },
          { name: "Ecuador" },
          { name: "Colombia" },
          { name: "Brazil" },
          { name: "Chile" },
          { name: "United States" },
          { name: "Mexico" },
          { name: "Argentina" },
        ],
        skipDuplicates: true,
      });
      console.log("✅ Basic countries created");
    }

    // ✅ NEW: Product Categories
    console.log("Creating product categories...");
    await prisma.productCategory.createMany({
      data: [
        { name: "Dispositivos Médicos", description: "Medical devices and equipment" },
        { name: "Productos Farmacéuticos", description: "Pharmaceutical products and medications" },
        { name: "Productos Sanitarios", description: "Sanitary and hygiene products" },
        { name: "Otros", description: "Other products and miscellaneous items" },
      ],
      skipDuplicates: true,
    });
    console.log("✅ Product categories created");

    // Get the created categories for subcategory creation
    const categories = await prisma.productCategory.findMany();
    const dispositivosMedicos = categories.find(c => c.name === "Dispositivos Médicos");
    const productosFarmaceuticos = categories.find(c => c.name === "Productos Farmacéuticos");
    const productosSanitarios = categories.find(c => c.name === "Productos Sanitarios");
    const otro = categories.find(c => c.name === "Otros");

    // ✅ NEW: Product Subcategories1
    console.log("Creating product subcategories1...");
    
    // Dispositivos Médicos - Subcategory 1
    if (dispositivosMedicos) {
      await prisma.productSubCategory1.createMany({
        data: [
          { name: "Equipos Médicos", description: "Medical equipment and machinery", category_id: dispositivosMedicos.category_id },
          { name: "Material Médicos", description: "Medical materials and supplies", category_id: dispositivosMedicos.category_id },
          { name: "Instrumental Médicos", description: "Medical instruments and tools", category_id: dispositivosMedicos.category_id },
          { name: "Insumos", description: "Medical consumables and supplies", category_id: dispositivosMedicos.category_id },
          { name: "Equipos Biomédicos", description: "Biomedical equipment and devices", category_id: dispositivosMedicos.category_id },
        ],
        skipDuplicates: true,
      });
    }

    // Productos Farmacéuticos - Subcategory 1
    if (productosFarmaceuticos) {
      await prisma.productSubCategory1.createMany({
        data: [
          { name: "Productos Emergencia", description: "Emergency pharmaceutical products", category_id: productosFarmaceuticos.category_id },
          { name: "Productos Galénicos", description: "Galenic pharmaceutical preparations", category_id: productosFarmaceuticos.category_id },
          { name: "Producto de Marca", description: "Brand name pharmaceutical products", category_id: productosFarmaceuticos.category_id },
          { name: "Producto Genérico", description: "Generic pharmaceutical products", category_id: productosFarmaceuticos.category_id },
        ],
        skipDuplicates: true,
      });
    }

    // Productos Sanitarios - Subcategory 1
    if (productosSanitarios) {
      await prisma.productSubCategory1.createMany({
        data: [
          { name: "Productos Cosméticos", description: "Cosmetic and beauty products", category_id: productosSanitarios.category_id },
          { name: "Productos de Higiene Doméstica", description: "Household hygiene products", category_id: productosSanitarios.category_id },
          { name: "Artículos Sanitarios", description: "Sanitary articles and supplies", category_id: productosSanitarios.category_id },
        ],
        skipDuplicates: true,
      });
    }

    // Otro - Subcategory 1
    if (otro) {
      await prisma.productSubCategory1.createMany({
        data: [
          { name: "Otro", description: "Other products and miscellaneous items", category_id: otro.category_id },
        ],
        skipDuplicates: true,
      });
    }
    console.log("✅ Product subcategories1 created");

    // Get subcategories1 for subcategory2 creation
    const subcategories1 = await prisma.productSubCategory1.findMany();
    
    // Dispositivos Médicos subcategories
    const equiposMedicos = subcategories1.find(s => s.name === "Equipos Médicos");
    const materialMedicos = subcategories1.find(s => s.name === "Material Médicos");
    const instrumentalMedicos = subcategories1.find(s => s.name === "Instrumental Médicos");
    const insumos = subcategories1.find(s => s.name === "Insumos");
    const equiposBiomedicos = subcategories1.find(s => s.name === "Equipos Biomédicos");
    
    // Productos Farmacéuticos subcategories
    const productosEmergencia = subcategories1.find(s => s.name === "Productos Emergencia");
    const productosGalenicos = subcategories1.find(s => s.name === "Productos Galénicos");
    const productoMarca = subcategories1.find(s => s.name === "Producto de Marca");
    const productoGenerico = subcategories1.find(s => s.name === "Producto Genérico");
    
    // Productos Sanitarios subcategories
    const productosCosmeticos = subcategories1.find(s => s.name === "Productos Cosméticos");
    const productosHigieneDomestica = subcategories1.find(s => s.name === "Productos de Higiene Doméstica");
    const articulosSanitarios = subcategories1.find(s => s.name === "Artículos Sanitarios");
    
    // Otro subcategories
    const otroSubcategory1 = subcategories1.find(s => s.name === "Otro");

    // ✅ NEW: Product Subcategories2
    console.log("Creating product subcategories2...");
    
    // Equipos Médicos - Subcategory 2
    if (equiposMedicos) {
      await prisma.productSubCategory2.createMany({
        data: [
          { name: "Equipos de Diagnóstico", description: "Diagnostic equipment and machines", subcategory1_id: equiposMedicos.subcategory1_id },
          { name: "Equipos de Cirugía", description: "Surgical equipment and instruments", subcategory1_id: equiposMedicos.subcategory1_id },
          { name: "Equipos de Terapia", description: "Therapy and treatment equipment", subcategory1_id: equiposMedicos.subcategory1_id },
          { name: "Equipos de Monitoreo", description: "Patient monitoring equipment", subcategory1_id: equiposMedicos.subcategory1_id },
        ],
        skipDuplicates: true,
      });
    }

    // Material Médicos - Subcategory 2
    if (materialMedicos) {
      await prisma.productSubCategory2.createMany({
        data: [
          { name: "Material Quirúrgico", description: "Surgical materials and supplies", subcategory1_id: materialMedicos.subcategory1_id },
          { name: "Material de Curación", description: "Wound care and healing materials", subcategory1_id: materialMedicos.subcategory1_id },
          { name: "Material de Protección", description: "Protective materials and PPE", subcategory1_id: materialMedicos.subcategory1_id },
          { name: "Material Desechable", description: "Disposable medical materials", subcategory1_id: materialMedicos.subcategory1_id },
        ],
        skipDuplicates: true,
      });
    }

    // Instrumental Médicos - Subcategory 2
    if (instrumentalMedicos) {
      await prisma.productSubCategory2.createMany({
        data: [
          { name: "Instrumentos Quirúrgicos", description: "Surgical instruments and tools", subcategory1_id: instrumentalMedicos.subcategory1_id },
          { name: "Instrumentos de Diagnóstico", description: "Diagnostic instruments", subcategory1_id: instrumentalMedicos.subcategory1_id },
          { name: "Instrumentos de Examinación", description: "Examination instruments", subcategory1_id: instrumentalMedicos.subcategory1_id },
          { name: "Instrumentos de Precisión", description: "Precision medical instruments", subcategory1_id: instrumentalMedicos.subcategory1_id },
        ],
        skipDuplicates: true,
      });
    }

    // Insumos - Subcategory 2
    if (insumos) {
      await prisma.productSubCategory2.createMany({
        data: [
          { name: "Insumos Quirúrgicos", description: "Surgical supplies and consumables", subcategory1_id: insumos.subcategory1_id },
          { name: "Insumos de Laboratorio", description: "Laboratory supplies and reagents", subcategory1_id: insumos.subcategory1_id },
          { name: "Insumos de Enfermería", description: "Nursing supplies and materials", subcategory1_id: insumos.subcategory1_id },
          { name: "Insumos Especializados", description: "Specialized medical supplies", subcategory1_id: insumos.subcategory1_id },
        ],
        skipDuplicates: true,
      });
    }

    // Equipos Biomédicos - Subcategory 2
    if (equiposBiomedicos) {
      await prisma.productSubCategory2.createMany({
        data: [
          { name: "Equipos de Análisis", description: "Biomedical analysis equipment", subcategory1_id: equiposBiomedicos.subcategory1_id },
          { name: "Equipos de Imagenología", description: "Medical imaging equipment", subcategory1_id: equiposBiomedicos.subcategory1_id },
          { name: "Equipos de Laboratorio", description: "Laboratory biomedical equipment", subcategory1_id: equiposBiomedicos.subcategory1_id },
          { name: "Equipos de Rehabilitación", description: "Rehabilitation biomedical equipment", subcategory1_id: equiposBiomedicos.subcategory1_id },
        ],
        skipDuplicates: true,
      });
    }

    // Productos Emergencia - Subcategory 2
    if (productosEmergencia) {
      await prisma.productSubCategory2.createMany({
        data: [
          { name: "Medicamentos de Urgencia", description: "Emergency medications", subcategory1_id: productosEmergencia.subcategory1_id },
          { name: "Antídotos", description: "Antidotes and counter-agents", subcategory1_id: productosEmergencia.subcategory1_id },
          { name: "Sueros y Soluciones", description: "Emergency serums and solutions", subcategory1_id: productosEmergencia.subcategory1_id },
          { name: "Medicamentos de Trauma", description: "Trauma care medications", subcategory1_id: productosEmergencia.subcategory1_id },
        ],
        skipDuplicates: true,
      });
    }

    // Productos Galénicos - Subcategory 2
    if (productosGalenicos) {
      await prisma.productSubCategory2.createMany({
        data: [
          { name: "Preparaciones Magistrales", description: "Custom pharmaceutical preparations", subcategory1_id: productosGalenicos.subcategory1_id },
          { name: "Formas Farmacéuticas Sólidas", description: "Solid pharmaceutical forms", subcategory1_id: productosGalenicos.subcategory1_id },
          { name: "Formas Farmacéuticas Líquidas", description: "Liquid pharmaceutical forms", subcategory1_id: productosGalenicos.subcategory1_id },
          { name: "Formas Farmacéuticas Tópicas", description: "Topical pharmaceutical forms", subcategory1_id: productosGalenicos.subcategory1_id },
        ],
        skipDuplicates: true,
      });
    }

    // Producto de Marca - Subcategory 2
    if (productoMarca) {
      await prisma.productSubCategory2.createMany({
        data: [
          { name: "Medicamentos Éticos", description: "Prescription brand medications", subcategory1_id: productoMarca.subcategory1_id },
          { name: "Medicamentos OTC", description: "Over-the-counter brand medications", subcategory1_id: productoMarca.subcategory1_id },
          { name: "Productos Especializados", description: "Specialized brand products", subcategory1_id: productoMarca.subcategory1_id },
          { name: "Productos Premium", description: "Premium brand pharmaceutical products", subcategory1_id: productoMarca.subcategory1_id },
        ],
        skipDuplicates: true,
      });
    }

    // Producto Genérico - Subcategory 2
    if (productoGenerico) {
      await prisma.productSubCategory2.createMany({
        data: [
          { name: "Genéricos Bioequivalentes", description: "Bioequivalent generic medications", subcategory1_id: productoGenerico.subcategory1_id },
          { name: "Genéricos Intercambiables", description: "Interchangeable generic medications", subcategory1_id: productoGenerico.subcategory1_id },
          { name: "Genéricos de Primera Línea", description: "First-line generic medications", subcategory1_id: productoGenerico.subcategory1_id },
          { name: "Genéricos Especializados", description: "Specialized generic medications", subcategory1_id: productoGenerico.subcategory1_id },
        ],
        skipDuplicates: true,
      });
    }

    // Productos Cosméticos - Subcategory 2
    if (productosCosmeticos) {
      await prisma.productSubCategory2.createMany({
        data: [
          { name: "Cosméticos Faciales", description: "Facial cosmetics and skincare", subcategory1_id: productosCosmeticos.subcategory1_id },
          { name: "Cosméticos Corporales", description: "Body cosmetics and care products", subcategory1_id: productosCosmeticos.subcategory1_id },
          { name: "Cosméticos Capilares", description: "Hair care cosmetics", subcategory1_id: productosCosmeticos.subcategory1_id },
          { name: "Cosméticos Especializados", description: "Specialized cosmetic products", subcategory1_id: productosCosmeticos.subcategory1_id },
        ],
        skipDuplicates: true,
      });
    }

    // Productos de Higiene Doméstica - Subcategory 2
    if (productosHigieneDomestica) {
      await prisma.productSubCategory2.createMany({
        data: [
          { name: "Limpiadores Domésticos", description: "Household cleaning products", subcategory1_id: productosHigieneDomestica.subcategory1_id },
          { name: "Desinfectantes", description: "Disinfectants and sanitizers", subcategory1_id: productosHigieneDomestica.subcategory1_id },
          { name: "Productos de Lavandería", description: "Laundry and washing products", subcategory1_id: productosHigieneDomestica.subcategory1_id },
          { name: "Productos Especializados", description: "Specialized household hygiene products", subcategory1_id: productosHigieneDomestica.subcategory1_id },
        ],
        skipDuplicates: true,
      });
    }

    // Artículos Sanitarios - Subcategory 2
    if (articulosSanitarios) {
      await prisma.productSubCategory2.createMany({
        data: [
          { name: "Productos de Higiene Personal", description: "Personal hygiene products", subcategory1_id: articulosSanitarios.subcategory1_id },
          { name: "Productos Femeninos", description: "Feminine hygiene products", subcategory1_id: articulosSanitarios.subcategory1_id },
          { name: "Productos Infantiles", description: "Baby and infant hygiene products", subcategory1_id: articulosSanitarios.subcategory1_id },
          { name: "Productos Geriátricos", description: "Geriatric and elderly care products", subcategory1_id: articulosSanitarios.subcategory1_id },
        ],
        skipDuplicates: true,
      });
    }

    // Otro - Subcategory 2
    if (otroSubcategory1) {
      await prisma.productSubCategory2.createMany({
        data: [
          { name: "Otro", description: "Other products and miscellaneous items", subcategory1_id: otroSubcategory1.subcategory1_id },
        ],
        skipDuplicates: true,
      });
    }
    console.log("✅ Product subcategories2 created");



    // Temperature Ranges
    console.log("Creating temperature ranges...");
    await prisma.temperatureRange.createMany({
      data: [
        { range: "15°C - 30°C", min_celsius: 15, max_celsius: 30 },
        { range: "15°C - 25°C", min_celsius: 15, max_celsius: 25 },
        { range: "2°C - 8°C", min_celsius: 2, max_celsius: 8 },
      ],
      skipDuplicates: true,
    });
    console.log("✅ Temperature ranges created");

    // Active States
    console.log("Creating active states...");
    await prisma.activeState.createMany({
      data: [
        { name: "Activo" },
        { name: "Inactivo" },
        { name: "Pendiente" },
        { name: "Suspendido" },
      ],
      skipDuplicates: true,
    });
    console.log("✅ Active states created");

    // Origins for Entry Orders
    console.log("Creating origins...");
    await prisma.origin.createMany({
      data: [
        { name: "Compra Local", type: "COMPRA_LOCAL" },
        { name: "Importación", type: "IMPORTACION" },
        { name: "Devolución", type: "DEVOLUCION" },
        { name: "Acondicionado", type: "ACONDICIONADO" },
        { name: "Transferencia Interna", type: "TRANSFERENCIA_INTERNA" },
        { name: "Fraccionado", type: "FRACCIONADO" },
      ],
      skipDuplicates: true,
    });
    console.log("✅ Origins created");

    // Document Types for Entry
    console.log("Creating document types for entry...");
    await prisma.documentType.createMany({
      data: [
        { name: "Packing List", type: "PACKING_LIST" },
        { name: "Factura", type: "FACTURA" },
        { name: "Certificado de Análisis", type: "CERTIFICADO_ANALISIS" },
        { name: "RRSS", type: "RRSS" },
        { name: "Permiso Especial", type: "PERMISO_ESPECIAL" },
        { name: "Otro", type: "OTRO" },
      ],
      skipDuplicates: true,
    });
    console.log("✅ Entry document types created");

    // Document Types for Departure
    console.log("Creating document types for departure...");
    await prisma.departureDocumentType.createMany({
      data: [
        { name: "Invoice", type: "INVOICE" },
        { name: "Delivery Note", type: "DELIVERY_NOTE" },
        { name: "Transfer Receipt", type: "TRANSFER_RECEIPT" },
        { name: "Shipping Manifest", type: "SHIPPING_MANIFEST" },
        { name: "Customs Declaration", type: "CUSTOMS_DECLARATION" },
        { name: "Other", type: "OTRO" },
      ],
      skipDuplicates: true,
    });
    console.log("✅ Departure document types created");

    // Exit Options
    console.log("Creating exit options...");
    await prisma.exitOption.createMany({
      data: [
        { name: "Local Delivery" },
        { name: "Export" },
        { name: "Transfer" },
        { name: "Return" },
        { name: "Express Delivery" },
      ],
      skipDuplicates: true,
    });
    console.log("✅ Exit options created");

    // Labels
    console.log("Creating labels...");
    await prisma.label.createMany({
      data: [
        { name: "Urgent" },
        { name: "Fragile" },
        { name: "Cold Chain" },
        { name: "Hazardous" },
        { name: "Standard" },
        { name: "Heavy" },
        { name: "Priority" },
      ],
      skipDuplicates: true,
    });
    console.log("✅ Labels created");

    // Roles
    console.log("Creating roles...");
    await prisma.role.createMany({
      data: [
        { name: "ADMIN" },
        { name: "WAREHOUSE_INCHARGE" },
        { name: "PHARMACIST" },
        { name: "WAREHOUSE_ASSISTANT" },
        { name: "CLIENT" },
      ],
      skipDuplicates: true,
    });
    console.log("✅ Roles created");





  } catch (error) {
    console.error("❌ Error in createBaseLookupTables:", error);
    throw error;
  }
}

async function createUsersAndOrganization() {
  try {
    console.log("Creating organisations...");
    
    // Create organisations
    const organisations = [
      {
        name: "TSLogix Peru",
        address: { street: "123 Main St", city: "Lima", zip: "15001" },
        tax_id: "TAX12345678",
      },
      ...Array(COUNT.ORGANISATIONS - 1).fill(null).map(() => ({
        name: faker.company.name(),
        address: {
          street: faker.location.streetAddress(),
          city: faker.location.city(),
          zip: faker.location.zipCode(),
        },
        tax_id: `TAX${faker.string.numeric(8)}`,
      }))
    ];
    
    await prisma.organisation.createMany({ data: organisations, skipDuplicates: true });
    const createdOrgs = await prisma.organisation.findMany();
    console.log("✅ Organisations created");
    
    console.log("Creating users...");
    const activeStates = await prisma.activeState.findMany();
    const roles = await prisma.role.findMany();
    
    const clientRole = roles.find(r => r.name === "CLIENT").role_id;
    const warehouseInchargeRole = roles.find(r => r.name === "WAREHOUSE_INCHARGE").role_id;
    const pharmacistRole = roles.find(r => r.name === "PHARMACIST").role_id;
    const warehouseAssistantRole = roles.find(r => r.name === "WAREHOUSE_ASSISTANT").role_id;
    const adminRole = roles.find(r => r.name === "ADMIN").role_id;
    const activeState = activeStates.find(s => s.name === "Activo").state_id;
    const mainOrg = createdOrgs[0].organisation_id;
    
    // Create seed users with visible passwords
    const seedUsers = [
      // Admin users
      {
        user_id: "admin1",
        email: "admin1@tslogix.com",
        password_hash: await bcrypt.hash("Admin123!", 10),
        first_name: "Admin",
        last_name: "One",
        organisation_id: mainOrg,
        role_id: adminRole,
        active_state_id: activeState,
        assigned_clients: [], // Admin has access to all
      },
      // Warehouse Incharge
      {
        user_id: "wh_incharge1",
        email: "wh.incharge1@tslogix.com",
        password_hash: await bcrypt.hash("WhIncharge123!", 10),
        first_name: "Warehouse",
        last_name: "Incharge",
        organisation_id: mainOrg,
        role_id: warehouseInchargeRole,
        active_state_id: activeState,
        assigned_clients: [], // Has access to all clients
      },
      // Pharmacist
      {
        user_id: "pharmacist1",
        email: "pharmacist1@tslogix.com",
        password_hash: await bcrypt.hash("Pharmacist123!", 10),
        first_name: "John",
        last_name: "Pharmacist",
        organisation_id: mainOrg,
        role_id: pharmacistRole,
        active_state_id: activeState,
        assigned_clients: [], // Has access to all for quality control
      },
      // Warehouse Assistant (will be assigned specific clients)
      {
        user_id: "wh_assistant1",
        email: "wh.assistant1@tslogix.com",
        password_hash: await bcrypt.hash("WhAssistant123!", 10),
        first_name: "Alice",
        last_name: "Assistant",
        organisation_id: mainOrg,
        role_id: warehouseAssistantRole,
        active_state_id: activeState,
        assigned_clients: [], // Will be populated after clients are created
      },
      {
        user_id: "wh_assistant2",
        email: "wh.assistant2@tslogix.com",
        password_hash: await bcrypt.hash("WhAssistant456!", 10),
        first_name: "Bob",
        last_name: "Assistant",
        organisation_id: mainOrg,
        role_id: warehouseAssistantRole,
        active_state_id: activeState,
        assigned_clients: [], // Will be populated after clients are created
      },
      // Client users
      {
        user_id: "client1",
        email: "client1@company.com",
        password_hash: await bcrypt.hash("Client123!", 10),
        first_name: "Client",
        last_name: "One",
        organisation_id: createdOrgs[1].organisation_id,
        role_id: clientRole,
        active_state_id: activeState,
        assigned_clients: [], // Clients don't need assignments
      },
      {
        user_id: "client2",
        email: "client2@company.com",
        password_hash: await bcrypt.hash("Client456!", 10),
        first_name: "Client",
        last_name: "Two",
        organisation_id: createdOrgs[2].organisation_id,
        role_id: clientRole,
        active_state_id: activeState,
        assigned_clients: [], // Clients don't need assignments
      },
    ];
    
    // Create seed users
    for (const user of seedUsers) {
      await prisma.user.upsert({
        where: { user_id: user.user_id },
        update: {},
        create: user,
      });
    }
    console.log("✅ Seed users created");
    
    return { seedUsers, createdOrgs, roles };
  } catch (error) {
    console.error("❌ Error creating users and organizations:", error);
    throw error;
  }
}

async function createSuppliersAndCustomers() {
  try {
    console.log("Creating suppliers...");
    const countries = await prisma.country.findMany();
    
    const suppliers = [];
    for (let i = 0; i < COUNT.SUPPLIERS; i++) {
      const companyName = faker.company.name();
      suppliers.push({
        // ✅ NEW: Required company_name field
        company_name: companyName,
        category: faker.helpers.arrayElement([
          "Pharmaceutical",
          "Medical Equipment", 
          "Laboratory Supplies",
          "Healthcare Services",
          "Biotechnology"
        ]),
        tax_id: `RUC${faker.string.numeric(8)}`,
        registered_address: faker.location.streetAddress(),
        city: faker.location.city(),
        contact_no: faker.phone.number(),
        contact_person: faker.person.fullName(),
        notes: faker.lorem.sentence(),
        
        // ✅ DEPRECATED: Keep old fields for backward compatibility
        name: companyName,
        address: faker.location.streetAddress(),
        phone: faker.phone.number(),
        email: faker.internet.email({ provider: "supplier.com" }),
        ruc: `RUC${faker.string.numeric(8)}`,
        country_id: faker.helpers.arrayElement(countries).country_id,
      });
    }
    
    await prisma.supplier.createMany({ data: suppliers, skipDuplicates: true });
    console.log("✅ Suppliers created");
    
    console.log("Creating customers...");
    const activeStates = await prisma.activeState.findMany();
    
    const customers = [];
    for (let i = 0; i < COUNT.CUSTOMERS; i++) {
      customers.push({
        name: faker.company.name(),
        billing_address: {
          street: faker.location.streetAddress(),
          city: faker.location.city(),
          state: faker.location.state(),
          zip: faker.location.zipCode(),
        },
        active_state_id: faker.helpers.arrayElement(activeStates).state_id,
      });
    }
    
    await prisma.customer.createMany({ data: customers, skipDuplicates: true });
    console.log("✅ Customers created");
  } catch (error) {
    console.error("❌ Error creating suppliers and customers:", error);
    throw error;
  }
}

// ✅ NEW: Function to create clients with warehouse incharge ownership and auto-generated credentials
async function createClients() {
  try {
    console.log("Creating clients with warehouse incharge ownership and auto-generated credentials...");
    
    const activeStates = await prisma.activeState.findMany();
    const activeState = activeStates.find(s => s.name === "Activo").state_id;
    const inactiveState = activeStates.find(s => s.name === "Inactivo").state_id;
    
    // Get warehouse incharge users (they will create the clients)
    const warehouseIncharges = await prisma.user.findMany({
      where: { role: { name: "WAREHOUSE_INCHARGE" } }
    });
    
    if (warehouseIncharges.length === 0) {
      console.log("⚠️ No warehouse incharge users found to create clients");
      return { commercialCount: 0, individualCount: 0 };
    }
    
    const createdClients = [];
    
    // Create commercial clients (60% of total)
    const commercialCount = Math.floor(COUNT.CLIENTS * 0.6);
    for (let i = 0; i < commercialCount; i++) {
      const creator = faker.helpers.arrayElement(warehouseIncharges);
      const companyName = faker.company.name();
      
      // Auto-generate username and password
      const autoUsername = `client_${faker.string.alphanumeric(8).toLowerCase()}`;
      const autoPassword = `${faker.string.alphanumeric(6)}${faker.number.int({ min: 100, max: 999 })}`;
      const autoPasswordHash = await bcrypt.hash(autoPassword, 10);
      
      const clientData = {
        client_type: "JURIDICO",
        
        // Common fields
        email: faker.internet.email({ provider: "comercial.com" }),
        address: faker.location.streetAddress() + ", " + faker.location.city(),
        phone: faker.phone.number(),
        cell_phone: faker.phone.number(),
        active_state_id: faker.helpers.weightedArrayElement([
          { weight: 85, value: activeState },
          { weight: 15, value: inactiveState }
        ]),
        
        // ✅ NEW: Client ownership
        created_by: creator.id,

        // Commercial client fields (all required)
        company_name: companyName,
        company_type: faker.helpers.arrayElement(["PRIVADO", "PUBLICO"]),
        establishment_type: faker.helpers.arrayElement([
          "ALMACEN_ESPECIALIZADO",
          "BOTICA",
          "BOTIQUIN",
          "DROGUERIA",
          "FARMACIA",
          "OTROS"
        ]),
        ruc: `20${faker.string.numeric(9)}`,
        
        // Clear individual fields
        first_names: null,
        last_name: null,
        mothers_last_name: null,
        individual_id: null,
        date_of_birth: null,
      };
      
      // Create client
      const client = await prisma.client.create({ data: clientData });
      
      // Create user account for client
      const clientUser = await prisma.user.create({
        data: {
          user_id: autoUsername,
          email: client.email || `${autoUsername}@client.local`,
          password_hash: autoPasswordHash,
          first_name: companyName.split(' ')[0],
          last_name: "Client",
          organisation_id: creator.organisation_id,
          role_id: (await prisma.role.findFirst({ where: { name: "CLIENT" } })).role_id,
          active_state_id: activeState,
          assigned_clients: [], // Clients don't need client assignments
        }
      });

      // ✅ NEW: Create ClientUser relationship (matches new schema)
      await prisma.clientUser.create({
        data: {
          client_id: client.client_id,
          user_id: clientUser.id,
          username: autoUsername,
          is_primary: true,
          is_active: true,
          created_by: creator.id,
          notes: `Primary user created during client seeding for ${companyName}`
        }
      });
      
      createdClients.push({ ...client, autoUsername: autoUsername, plainPassword: autoPassword });
    }
    
    // Create individual clients (40% of total)
    const individualCount = COUNT.CLIENTS - commercialCount;
    for (let i = 0; i < individualCount; i++) {
      const creator = faker.helpers.arrayElement(warehouseIncharges);
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const mothersLastName = faker.person.lastName();
      
      // Auto-generate username and password
      const autoUsername = `client_${faker.string.alphanumeric(8).toLowerCase()}`;
      const autoPassword = `${faker.string.alphanumeric(6)}${faker.number.int({ min: 100, max: 999 })}`;
      const autoPasswordHash = await bcrypt.hash(autoPassword, 10);
      
      const clientData = {
        client_type: "NATURAL",
        
        // Common fields
        email: faker.internet.email({ firstName, lastName, provider: "cliente.com" }),
        address: faker.location.streetAddress() + ", " + faker.location.city(),
        phone: faker.phone.number(),
        cell_phone: faker.phone.number(),
        active_state_id: faker.helpers.weightedArrayElement([
          { weight: 90, value: activeState },
          { weight: 10, value: inactiveState }
        ]),
        
        // ✅ NEW: Client ownership
        created_by: creator.id,

        // Individual client fields
        first_names: `${firstName} ${faker.person.middleName()}`,
        last_name: lastName,
        mothers_last_name: mothersLastName,
        individual_id: faker.string.numeric(8), // DNI
        date_of_birth: faker.date.birthdate({ min: 18, max: 80, mode: 'age' }),
        
        // Clear commercial fields
        company_name: null,
        company_type: null,
        establishment_type: null,
        ruc: null,
      };
      
      // Create client
      const client = await prisma.client.create({ data: clientData });
      
      // Create user account for client
      const clientUser = await prisma.user.create({
        data: {
          user_id: autoUsername,
          email: client.email || `${autoUsername}@client.local`,
          password_hash: autoPasswordHash,
          first_name: firstName,
          last_name: lastName,
          middle_name: mothersLastName,
          organisation_id: creator.organisation_id,
          role_id: (await prisma.role.findFirst({ where: { name: "CLIENT" } })).role_id,
          active_state_id: activeState,
          assigned_clients: [], // Clients don't need client assignments
        }
      });

      // ✅ NEW: Create ClientUser relationship (matches new schema)
      await prisma.clientUser.create({
        data: {
          client_id: client.client_id,
          user_id: clientUser.id,
          username: autoUsername,
          is_primary: true,
          is_active: true,
          created_by: creator.id,
          notes: `Primary user created during client seeding for ${firstName} ${lastName}`
        }
      });
      
      createdClients.push({ ...client, autoUsername: autoUsername, plainPassword: autoPassword });
    }
    
    console.log(`✅ Clients created with auto-generated credentials: ${commercialCount} commercial, ${individualCount} individual`);
    console.log(`✅ Auto-generated usernames and passwords are stored in backend only (not exposed to frontend)`);
    
    // ✅ Store auto-generated credentials for logging (admin access only)
    const credentialsSummary = createdClients.map(client => ({
      client_id: client.client_id,
      client_name: client.company_name || `${client.first_names} ${client.last_name}`,
      username: client.autoUsername, // Updated field name
      password: client.plainPassword, // Only in seed log, not stored in DB
      created_by: client.created_by
    }));
    
    console.log('\n📝 CLIENT CREDENTIALS SUMMARY (Backend Only - DO NOT EXPOSE TO FRONTEND):');
    console.table(credentialsSummary);
    
    return { commercialCount, individualCount, createdClients: credentialsSummary };
  } catch (error) {
    console.error("❌ Error creating clients:", error);
    throw error;
  }
}

// ✅ NEW: Assign clients to warehouse assistants
async function assignClientsToWarehouseAssistants() {
  try {
    console.log("Assigning clients to warehouse assistants...");
    
    // Get all clients
    const clients = await prisma.client.findMany({
      select: { client_id: true }
    });
    
    // Get warehouse assistants
    const warehouseAssistants = await prisma.user.findMany({
      where: { role: { name: "WAREHOUSE_ASSISTANT" } }
    });
    
    if (clients.length === 0 || warehouseAssistants.length === 0) {
      console.log("⚠️ No clients or warehouse assistants to assign");
      return;
    }
    
    // Distribute clients among warehouse assistants
    const clientsPerAssistant = Math.ceil(clients.length / warehouseAssistants.length);
    
    for (let i = 0; i < warehouseAssistants.length; i++) {
      const assistant = warehouseAssistants[i];
      const startIndex = i * clientsPerAssistant;
      const endIndex = Math.min(startIndex + clientsPerAssistant, clients.length);
      const assignedClientIds = clients.slice(startIndex, endIndex).map(c => c.client_id);
      
      await prisma.user.update({
        where: { id: assistant.id },
        data: {
          assigned_clients: assignedClientIds
        }
      });
      
      console.log(`✅ Assigned ${assignedClientIds.length} clients to ${assistant.first_name} ${assistant.last_name}`);
    }
    
    console.log("✅ Client assignments completed");
  } catch (error) {
    console.error("❌ Error assigning clients to warehouse assistants:", error);
    throw error;
  }
}

// ✅ NEW: Function to assign products to clients (each client gets their own product catalog)
async function createClientProductAssignments() {
  try {
    console.log("Creating client-specific product assignments...");
    
    const clients = await prisma.client.findMany({
      include: { creator: true }
    });
    
    const products = await prisma.product.findMany();
    
    if (clients.length === 0 || products.length === 0) {
      console.log("⚠️ No clients or products found for assignments");
      return;
    }
    
    const assignments = [];
    
    for (const client of clients) {
      // Each client gets a random subset of products (30-70% of all products)
      const productCount = faker.number.int({ 
        min: Math.floor(products.length * 0.3), 
        max: Math.floor(products.length * 0.7) 
      });
      
      const assignedProducts = faker.helpers.arrayElements(products, productCount);
      
      for (const product of assignedProducts) {
        assignments.push({
          client_id: client.client_id,
          product_id: product.product_id,
          assigned_by: client.created_by, // Warehouse incharge who created the client
          client_product_code: `C${faker.string.numeric(3)}-${product.product_code}`, // Custom code for client
          client_price: faker.helpers.maybe(() => 
            parseFloat(faker.commerce.price({ min: 10, max: 500 })), 
            { probability: 0.7 }
          ),
          notes: faker.helpers.maybe(() => 
            `Special pricing for ${client.company_name || client.first_names}`,
            { probability: 0.3 }
          ),
          max_order_quantity: faker.helpers.maybe(() => 
            faker.number.int({ min: 100, max: 1000 }),
            { probability: 0.5 }
          ),
          min_order_quantity: faker.helpers.maybe(() => 
            faker.number.int({ min: 1, max: 10 }),
            { probability: 0.3 }
          ),
        });
      }
    }
    
    // Create assignments in batches
    const batchSize = 50;
    for (let i = 0; i < assignments.length; i += batchSize) {
      const batch = assignments.slice(i, i + batchSize);
      await prisma.clientProductAssignment.createMany({
        data: batch,
        skipDuplicates: true
      });
    }
    
    console.log(`✅ Client product assignments created: ${assignments.length} assignments`);
    
    // Create summary by client
    const clientSummary = {};
    assignments.forEach(assignment => {
      if (!clientSummary[assignment.client_id]) {
        clientSummary[assignment.client_id] = 0;
      }
      clientSummary[assignment.client_id]++;
    });
    
    console.log(`✅ Products assigned per client (range: ${Math.min(...Object.values(clientSummary))} - ${Math.max(...Object.values(clientSummary))} products)`);
    
    return assignments.length;
  } catch (error) {
    console.error("❌ Error creating client product assignments:", error);
    throw error;
  }
}

// ✅ NEW: Function to assign suppliers to clients (each client gets their own supplier catalog)
async function createClientSupplierAssignments() {
  try {
    console.log("Creating client-specific supplier assignments...");
    
    const clients = await prisma.client.findMany({
      include: { creator: true }
    });
    
    const suppliers = await prisma.supplier.findMany();
    
    if (clients.length === 0 || suppliers.length === 0) {
      console.log("⚠️ No clients or suppliers found for assignments");
      return;
    }
    
    const assignments = [];
    
    for (const client of clients) {
      // Each client gets a random subset of suppliers (40-80% of all suppliers)
      const supplierCount = faker.number.int({ 
        min: Math.floor(suppliers.length * 0.4), 
        max: Math.floor(suppliers.length * 0.8) 
      });
      
      const assignedSuppliers = faker.helpers.arrayElements(suppliers, supplierCount);
      
      for (let i = 0; i < assignedSuppliers.length; i++) {
        const supplier = assignedSuppliers[i];
        assignments.push({
          client_id: client.client_id,
          supplier_id: supplier.supplier_id,
          assigned_by: client.created_by, // Warehouse incharge who created the client
          client_supplier_code: `CS${faker.string.numeric(3)}-${supplier.supplier_id.slice(-6)}`, // Custom code for client
          preferred_supplier: i === 0, // Make first supplier preferred
          credit_limit: faker.helpers.maybe(() => 
            parseFloat(faker.commerce.price({ min: 5000, max: 50000 })), 
            { probability: 0.8 }
          ),
          payment_terms: faker.helpers.arrayElement([
            'Net 15', 'Net 30', 'Net 45', 'COD', 'Prepaid'
          ]),
          notes: `Assigned to ${client.company_name || `${client.first_names} ${client.last_name}`} - ${supplier.company_name || supplier.name}`,
          primary_contact: faker.helpers.maybe(() => 
            faker.person.fullName(),
            { probability: 0.6 }
          ),
          contact_email: faker.helpers.maybe(() => 
            faker.internet.email({ provider: (supplier.company_name || supplier.name).toLowerCase().replace(/\s+/g, '') + '.com' }),
            { probability: 0.5 }
          ),
          contact_phone: faker.helpers.maybe(() => 
            faker.phone.number(),
            { probability: 0.7 }
          ),
        });
      }
    }
    
    // Create assignments in batches
    const batchSize = 50;
    for (let i = 0; i < assignments.length; i += batchSize) {
      const batch = assignments.slice(i, i + batchSize);
      await prisma.clientSupplierAssignment.createMany({
        data: batch,
        skipDuplicates: true
      });
    }
    
    console.log(`✅ Client supplier assignments created: ${assignments.length} assignments`);
    
    // Create summary by client
    const clientSummary = {};
    assignments.forEach(assignment => {
      if (!clientSummary[assignment.client_id]) {
        clientSummary[assignment.client_id] = 0;
      }
      clientSummary[assignment.client_id]++;
    });
    
    console.log(`✅ Suppliers assigned per client (range: ${Math.min(...Object.values(clientSummary))} - ${Math.max(...Object.values(clientSummary))} suppliers)`);
    
    return assignments.length;
  } catch (error) {
    console.error("❌ Error creating client supplier assignments:", error);
    throw error;
  }
}

async function createWarehousesAndCells() {
  try {
    console.log("Creating warehouses and cells...");

    // Create warehouses (MODIFIED: Only 1 warehouse instead of 3)
    const warehouses = await prisma.warehouse.createMany({
      data: [
        {
          name: "Almacén Ancón",
          location: "Lima, Peru",
          capacity: 10000,
          max_occupancy: 8000,
          status: "ACTIVE",
        },
      ],
      skipDuplicates: true,
    });

    // Get warehouse IDs for cell creation
    const warehouseList = await prisma.warehouse.findMany();
    
    // Create cells for each warehouse
    const allCells = [];
    
    for (const warehouse of warehouseList) {
      // Create standard cells A to P (28 bays, 10 positions each)
      for (let row of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P']) {
        for (let bay = 1; bay <= 28; bay++) {
          for (let position = 1; position <= 10; position++) {
            // Determine if this is a passage cell
            const isPassage = (
              // B row specific passages: B.13.01, B.13.02, B.13.03, B.14.01, B.14.02, B.14.03
              (row === 'B' && bay === 13 && [1, 2, 3].includes(position)) ||
              (row === 'B' && bay === 14 && [1, 2, 3].includes(position)) ||
              // Rows C to Q: same pattern as B row - passages in bays 13 and 14, positions 1, 2, 3
              (['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'].includes(row) && 
               ((bay === 13 && [1, 2, 3].includes(position)) || (bay === 14 && [1, 2, 3].includes(position))))
            );
            
            allCells.push({
              warehouse_id: warehouse.warehouse_id,
              row: row,
              bay: bay,
              position: position,
              kind: "NORMAL",
              status: "AVAILABLE",
              cell_role: "STANDARD",
              is_passage: isPassage,
              capacity: 100.00,
              currentUsage: 0.00,
              current_packaging_qty: 0,
              current_weight: 0.00,
            });
          }
        }
      }
      
      // Create Q row cells (20 bays, 10 positions)
      for (let bay = 1; bay <= 20; bay++) {
        for (let position = 1; position <= 10; position++) {
          // Q row follows same passage pattern as other rows
          const isPassage = (
            (bay === 13 && [1, 2, 3].includes(position)) || 
            (bay === 14 && [1, 2, 3].includes(position))
          );
          
          allCells.push({
            warehouse_id: warehouse.warehouse_id,
            row: 'Q',
            bay: bay,
            position: position,
            kind: "NORMAL",
            status: "AVAILABLE",
            cell_role: "STANDARD",
            is_passage: isPassage,
            capacity: 100.00,
            currentUsage: 0.00,
            current_packaging_qty: 0,
            current_weight: 0.00,
          });
        }
      }
      
      // Create V - Devoluciones (Returns) cells (2 bays, 10 positions)
      for (let bay = 1; bay <= 2; bay++) {
        for (let position = 1; position <= 10; position++) {
          allCells.push({
            warehouse_id: warehouse.warehouse_id,
            row: 'V',
            bay: bay,
            position: position,
            kind: "RESERVED",
            status: "AVAILABLE",
            cell_role: "RETURNS",
            is_passage: false, // Special purpose cells are not passages
            capacity: 75.00,
            currentUsage: 0.00,
            current_packaging_qty: 0,
            current_weight: 0.00,
          });
        }
      }
      
      // Create T - Contramuestras (Samples) cells (4 bays, 10 positions)
      for (let bay = 1; bay <= 4; bay++) {
        for (let position = 1; position <= 10; position++) {
          allCells.push({
            warehouse_id: warehouse.warehouse_id,
            row: 'T',
            bay: bay,
            position: position,
            kind: "RESERVED",
            status: "AVAILABLE",
            cell_role: "SAMPLES",
            is_passage: false, // Special purpose cells are not passages
            capacity: 50.00,
            currentUsage: 0.00,
            current_packaging_qty: 0,
            current_weight: 0.00,
          });
        }
      }
      
      // Create R - Rechazados (Rejected) cells (2 bays, 10 positions)
      for (let bay = 1; bay <= 2; bay++) {
        for (let position = 1; position <= 10; position++) {
          allCells.push({
            warehouse_id: warehouse.warehouse_id,
            row: 'R',
            bay: bay,
            position: position,
            kind: "DAMAGED",
            status: "AVAILABLE",
            cell_role: "REJECTED",
            is_passage: false, // Special purpose cells are not passages
            capacity: 50.00,
            currentUsage: 0.00,
            current_packaging_qty: 0,
            current_weight: 0.00,
          });
        }
      }
    }

    await prisma.warehouseCell.createMany({
      data: allCells,
      skipDuplicates: true,
    });

    console.log("✅ Warehouses and cells created");
  } catch (error) {
    console.error("❌ Error creating warehouses and cells:", error);
    throw error;
  }
}

async function createEntryOrdersWithProducts() {
  try {
    console.log("🌱 Creating entry orders with products (FIFO scenarios)...");
    
    // Get required data
    const clientUsers = await prisma.user.findMany({
      where: { role: { name: "CLIENT" } },
    });
    const adminUsers = await prisma.user.findMany({
      where: { role: { name: "ADMIN" } },
    });
    const suppliers = await prisma.supplier.findMany();
    const origins = await prisma.origin.findMany();
    const documentTypes = await prisma.documentType.findMany();
    const products = await prisma.product.findMany();
    const warehouses = await prisma.warehouse.findMany();
    
    const entryOrders = [];
    
    // ✅ NEW: Create FIFO test scenarios with specific dates
    const fifoTestProducts = products.slice(0, 5); // Use first 5 products for FIFO testing
    const baseDate = new Date('2024-01-01'); // Start from this date
    
    // ✅ Create multiple entries of the same products at different dates (for FIFO testing)
    let fifoOrderCounter = 1; // Global counter for unique FIFO order numbers
    
    for (let fifoIndex = 0; fifoIndex < 3; fifoIndex++) {
      const entryDate = new Date(baseDate);
      entryDate.setDate(baseDate.getDate() + (fifoIndex * 10)); // 10 days apart
      
      for (const product of fifoTestProducts) {
        const clientUser = faker.helpers.arrayElement(clientUsers);
        const warehouse = warehouses[0]; // Use same warehouse for FIFO testing
        
        // Create base order
        const order = await prisma.order.create({
          data: {
            order_type: "ENTRY",
            status: "PENDING",
            organisation_id: clientUser.organisation_id,
            created_by: clientUser.id,
            created_at: entryDate,
          },
        });
        
        // Create entry order with specific entry_date_time for FIFO
        const entryOrder = await prisma.entryOrder.create({
          data: {
            order_id: order.order_id,
            entry_order_no: `FIFO-${String(fifoOrderCounter).padStart(3, '0')}-${product.product_code.slice(-4)}`,
            origin_id: faker.helpers.arrayElement(origins).origin_id,
            document_type_id: faker.helpers.arrayElement(documentTypes).document_type_id,
            registration_date: entryDate,
            document_date: entryDate,
            entry_date_time: entryDate, // ✅ Specific date for FIFO testing
            created_by: clientUser.id,
            order_status: OrderStatusEntry.FINALIZACION,
            total_volume: parseFloat(faker.commerce.price({ min: 100, max: 500 })),
            total_weight: parseFloat(faker.commerce.price({ min: 500, max: 2000 })),
            cif_value: parseFloat(faker.commerce.price({ min: 10000, max: 50000 })),
            total_pallets: faker.number.int({ min: 3, max: 8 }),
            observation: `FIFO Test Entry #${fifoIndex + 1} for ${product.name}`,
            uploaded_documents: {
              documents: [
                { name: `fifo_invoice_${fifoIndex + 1}.pdf`, url: `/documents/fifo_invoice_${fifoIndex + 1}.pdf` },
                { name: `fifo_packing_${fifoIndex + 1}.pdf`, url: `/documents/fifo_packing_${fifoIndex + 1}.pdf` }
              ]
            },
            warehouse_id: warehouse.warehouse_id,
            review_status: ReviewStatus.APPROVED, // Auto-approve for FIFO testing
            review_comments: `Approved for FIFO testing scenario ${fifoIndex + 1}`,
            reviewed_by: faker.helpers.arrayElement(adminUsers).id,
            reviewed_at: entryDate,
          },
        });
        
        entryOrders.push(entryOrder);
        fifoOrderCounter++; // Increment counter for next unique order number
        
        // ✅ Create audit log for FIFO entry
        await createAuditLog(
          clientUser.id,
          SystemAction.ENTRY_ORDER_CREATED,
          "EntryOrder",
          entryOrder.entry_order_id,
          `Created FIFO test entry order ${entryOrder.entry_order_no} for ${product.name}`,
          null,
          {
            entry_order_no: entryOrder.entry_order_no,
            entry_date_time: entryOrder.entry_date_time,
            product_code: product.product_code,
            fifo_sequence: fifoIndex + 1
          },
          {
            warehouse_id: entryOrder.warehouse_id,
            fifo_test: true
          }
        );
        
        // Create specific EntryOrderProduct for FIFO testing
        const inventoryQuantity = 100 + (fifoIndex * 50); // Different quantities
        const packageQuantity = 20 + (fifoIndex * 10);
        const weightKg = 50 + (fifoIndex * 25);
        
        await prisma.entryOrderProduct.create({
          data: {
            entry_order_id: entryOrder.entry_order_id,
            serial_number: `FIFO-SN-${fifoIndex + 1}-${product.product_code}`,
            supplier_id: faker.helpers.arrayElement(suppliers).supplier_id,
            product_code: product.product_code,
            product_id: product.product_id,
            lot_series: `FIFO-LOT-${fifoIndex + 1}-${faker.string.alphanumeric(6)}`,
            manufacturing_date: new Date(entryDate.getTime() - (30 * 24 * 60 * 60 * 1000)), // 30 days before entry
            expiration_date: new Date(entryDate.getTime() + (365 * 24 * 60 * 60 * 1000)), // 1 year after entry
            inventory_quantity: inventoryQuantity,
            package_quantity: packageQuantity,
            quantity_pallets: Math.ceil(packageQuantity / 20),
            presentation: "CAJA",
            guide_number: `FIFO-GN-${fifoIndex + 1}-${faker.string.numeric(6)}`,
            weight_kg: weightKg,
            volume_m3: parseFloat((weightKg * 0.1).toFixed(2)), // Calculate volume based on weight
            insured_value: parseFloat(faker.commerce.price({ min: 5000, max: 25000 })),
            temperature_range: "AMBIENTE",
            humidity: "50%",
            health_registration: `FIFO-HR-${fifoIndex + 1}-${faker.string.alphanumeric(8)}`,
          },
        });
      }
    }
    
    // ✅ Create remaining random entry orders
    let regularOrderCounter = 1000; // Start regular orders from 1000 to avoid conflicts
    
    for (let i = 0; i < (COUNT.ENTRY_ORDERS - (fifoTestProducts.length * 3)); i++) {
      const clientUser = faker.helpers.arrayElement(clientUsers);
      const warehouse = faker.helpers.arrayElement(warehouses);
      
      // Create base order
      const order = await prisma.order.create({
        data: {
          order_type: "ENTRY",
          status: "PENDING",
          organisation_id: clientUser.organisation_id,
          created_by: clientUser.id,
          created_at: faker.date.recent({ days: 60 }),
        },
      });
      
      // Create entry order
      const entryOrder = await prisma.entryOrder.create({
        data: {
          order_id: order.order_id,
          entry_order_no: `ENTRY-${String(regularOrderCounter).padStart(5, '0')}`,
          origin_id: faker.helpers.arrayElement(origins).origin_id,
          document_type_id: faker.helpers.arrayElement(documentTypes).document_type_id,
          registration_date: new Date(),
          document_date: faker.date.past({ years: 1 }),
          entry_date_time: faker.date.future({ days: 7 }),
          created_by: clientUser.id,
          order_status: faker.helpers.arrayElement(Object.values(OrderStatusEntry)),
          total_volume: parseFloat(faker.commerce.price({ min: 100, max: 1000 })),
          total_weight: parseFloat(faker.commerce.price({ min: 500, max: 5000 })),
          cif_value: parseFloat(faker.commerce.price({ min: 10000, max: 100000 })),
          total_pallets: faker.number.int({ min: 5, max: 20 }),
          observation: faker.lorem.paragraph(),
          uploaded_documents: {
            documents: [
              { name: "invoice.pdf", url: "/documents/invoice.pdf" },
              { name: "packing_list.pdf", url: "/documents/packing_list.pdf" }
            ]
          },
          warehouse_id: warehouse.warehouse_id,
          review_status: faker.helpers.arrayElement([ReviewStatus.PENDING, ReviewStatus.APPROVED, ReviewStatus.REJECTED]),
          review_comments: faker.lorem.sentence(),
          reviewed_by: faker.helpers.maybe(() => faker.helpers.arrayElement(adminUsers).id),
          reviewed_at: faker.helpers.maybe(() => faker.date.recent({ days: 30 })),
        },
      });
      
      entryOrders.push(entryOrder);
      regularOrderCounter++; // Increment counter for next unique order number
      
      // ✅ NEW: Create audit log for entry order creation
      await createAuditLog(
        clientUser.id,
        SystemAction.ENTRY_ORDER_CREATED,
        "EntryOrder",
        entryOrder.entry_order_id,
        `Created entry order ${entryOrder.entry_order_no} with ${entryOrder.total_pallets} pallets`,
        null,
        {
          entry_order_no: entryOrder.entry_order_no,
          total_pallets: entryOrder.total_pallets,
          total_weight: parseFloat(entryOrder.total_weight),
          order_status: entryOrder.order_status
        },
        {
          warehouse_id: entryOrder.warehouse_id,
          origin_id: entryOrder.origin_id
        }
      );
      
      // Create multiple products for this entry order (2-5 products per order)
      const numberOfProducts = faker.number.int({ min: 2, max: 5 });
      const selectedProducts = faker.helpers.arrayElements(products, numberOfProducts);
      
      for (const product of selectedProducts) {
        const inventoryQuantity = faker.number.int({ min: 50, max: 500 });
        const packageQuantity = faker.number.int({ min: 10, max: 100 });
        const weightKg = parseFloat(faker.commerce.price({ min: 10, max: 500 }));
        const volumeM3 = parseFloat(faker.commerce.price({ min: 1, max: 50 }));
        
        // Create EntryOrderProduct with new schema fields
        await prisma.entryOrderProduct.create({
          data: {
            entry_order_id: entryOrder.entry_order_id,
            serial_number: `SN-${faker.string.alphanumeric(10)}`,
            supplier_id: faker.helpers.arrayElement(suppliers).supplier_id,
            product_code: product.product_code,
            product_id: product.product_id,
            lot_series: `LOT-${faker.string.alphanumeric(8)}`,
            manufacturing_date: faker.date.past({ years: 1 }),
            expiration_date: faker.date.future({ years: 2 }),
            inventory_quantity: inventoryQuantity,
            package_quantity: packageQuantity,
            quantity_pallets: Math.ceil(packageQuantity / 20),
            presentation: faker.helpers.arrayElement(Object.values(PresentationType)),
            guide_number: `GN-${faker.string.numeric(8)}`,
            weight_kg: weightKg,
            volume_m3: volumeM3,
            insured_value: parseFloat(faker.commerce.price({ min: 1000, max: 50000 })),
            temperature_range: faker.helpers.arrayElement(Object.values(TemperatureRangeType)),
            humidity: `${faker.number.int({ min: 30, max: 80 })}%`,
            health_registration: `HR-${faker.string.alphanumeric(10)}`,
          },
        });
      }
    }
    
    console.log("✅ Entry orders with products created");
    return entryOrders;
  } catch (error) {
    console.error("❌ Error creating entry orders:", error);
    throw error;
  }
}

async function createInventoryAllocations() {
  try {
    console.log("🌱 Creating inventory allocations with quarantine flow...");
    
    // Get approved entry orders
    const approvedEntryOrders = await prisma.entryOrder.findMany({
      where: { review_status: ReviewStatus.APPROVED },
      include: { products: { include: { product: true } } },
    });
    
    if (approvedEntryOrders.length === 0) {
      console.log("⚠️ No approved entry orders to create allocations");
      return;
    }
    
    const warehouseUsers = await prisma.user.findMany({
    where: { role: { name: "WAREHOUSE_INCHARGE" } },
    });
    
    const availableCells = await prisma.warehouseCell.findMany({
      where: { status: CellStatus.AVAILABLE },
      orderBy: [{ row: 'asc' }, { bay: 'asc' }, { position: 'asc' }],
    });
    
    for (const entryOrder of approvedEntryOrders.slice(0, 15)) { // Limit to avoid too many allocations
      const warehouseUser = faker.helpers.arrayElement(warehouseUsers);
      
      for (const entryProduct of entryOrder.products) {
        if (availableCells.length === 0) break;
        
        const cell = availableCells.shift(); // Take next available cell
        const product = entryProduct.product;
        
        // Create allocation with partial quantities (warehouse decides how much to allocate)
        const allocatedQuantity = Math.floor(entryProduct.inventory_quantity * faker.number.float({ min: 0.7, max: 1.0 }));
        const allocatedPackages = Math.floor(entryProduct.package_quantity * faker.number.float({ min: 0.7, max: 1.0 }));
        const allocatedWeight = entryProduct.weight_kg * (allocatedQuantity / entryProduct.inventory_quantity);
        const allocatedVolume = entryProduct.volume_m3 ? entryProduct.volume_m3 * (allocatedQuantity / entryProduct.inventory_quantity) : null;
        
        const productStatus = faker.helpers.arrayElement(Object.values(ProductStatus));
        const statusCode = getStatusCodeFromEnum(productStatus);
        
        // ✅ NEW: Create inventory allocation with quarantine status
        const allocation = await prisma.inventoryAllocation.create({
          data: {
            entry_order_id: entryOrder.entry_order_id,
            entry_order_product_id: entryProduct.entry_order_product_id,
            inventory_quantity: allocatedQuantity,
            package_quantity: allocatedPackages,
            quantity_pallets: Math.ceil(allocatedPackages / 20),
            presentation: faker.helpers.arrayElement(Object.values(PresentationType)),
            weight_kg: allocatedWeight,
            volume_m3: allocatedVolume,
            cell_id: cell.id,
            product_status: productStatus,
            status_code: statusCode,
            quality_status: QualityControlStatus.CUARENTENA, // ✅ Starts in quarantine
            guide_number: `AG-${faker.string.numeric(8)}`,
            uploaded_documents: {
              documents: [
                { name: "allocation_doc.pdf", url: "/documents/allocation_doc.pdf" }
              ]
            },
            observations: `Initial allocation to quarantine area. Cell: ${cell.row}.${cell.bay}.${cell.position}`,
            allocated_by: warehouseUser.id,
          },
        });
        
        // ✅ NEW: Create inventory record in quarantine status
        const inventory = await prisma.inventory.create({
          data: {
            allocation_id: allocation.allocation_id,
            product_id: product.product_id,
            cell_id: cell.id,
            warehouse_id: entryOrder.warehouse_id,
            current_quantity: allocatedQuantity,
            current_package_quantity: allocatedPackages,
            current_weight: allocatedWeight,
            current_volume: allocatedVolume,
            status: InventoryStatus.QUARANTINED, // ✅ Start in quarantine
            product_status: productStatus,
            status_code: statusCode,
            quality_status: QualityControlStatus.CUARENTENA, // ✅ Quarantine status
            created_by: warehouseUser.id,
          },
        });
        
        // Update cell status
        await prisma.warehouseCell.update({
          where: { id: cell.id },
          data: {
            status: CellStatus.OCCUPIED,
            currentUsage: 1,
            current_packaging_qty: allocatedPackages,
            current_weight: allocatedWeight,
          },
        });
        
        // Create inventory log
        await prisma.inventoryLog.create({
          data: {
            user_id: warehouseUser.id,
            product_id: product.product_id,
            movement_type: MovementType.ENTRY,
            quantity_change: allocatedQuantity,
            package_change: allocatedPackages,
            weight_change: allocatedWeight,
            volume_change: allocatedVolume,
            entry_order_id: entryOrder.entry_order_id,
            entry_order_product_id: entryProduct.entry_order_product_id,
            allocation_id: allocation.allocation_id,
            warehouse_id: entryOrder.warehouse_id,
            cell_id: cell.id,
            product_status: productStatus,
            status_code: statusCode,
            notes: `Entry allocation: ${allocatedQuantity} units allocated to quarantine in cell ${cell.row}.${cell.bay}.${cell.position}`,
          },
        });
        
        // ✅ NEW: Create audit log for inventory allocation
        await createAuditLog(
          warehouseUser.id,
          SystemAction.INVENTORY_ALLOCATED,
          "InventoryAllocation",
          allocation.allocation_id,
          `Allocated ${allocatedQuantity} units of ${product.name} to quarantine in cell ${cell.row}.${cell.bay}.${cell.position}`,
          null,
          {
            quantity: allocatedQuantity,
            cell: `${cell.row}.${cell.bay}.${cell.position}`,
            quality_status: "CUARENTENA"
          },
          {
            entry_order_no: entryOrder.entry_order_no,
            product_code: product.product_code
          }
        );
      }
    }
    
    console.log("✅ Inventory allocations created with quarantine status");
  } catch (error) {
    console.error("❌ Error creating inventory allocations:", error);
    throw error;
  }
}

// ✅ NEW: Create quality control transitions from quarantine to other states
async function createQualityControlTransitions() {
  try {
    console.log("🌱 Creating quality control transitions...");
    
    // Get inventory allocations currently in quarantine
    const quarantineAllocations = await prisma.inventoryAllocation.findMany({
      where: { quality_status: QualityControlStatus.CUARENTENA },
      include: {
        inventory: true,
        entry_order_product: {
          include: { product: true }
        },
        cell: true
      },
    });
    
    if (quarantineAllocations.length === 0) {
      console.log("⚠️ No quarantine allocations to transition");
      return;
    }
    
    const warehouseUsers = await prisma.user.findMany({
    where: { role: { name: "WAREHOUSE_INCHARGE" } },
    });
    
    // ✅ NEW: Prioritize FIFO test products for approval
    const fifoTestAllocations = quarantineAllocations.filter(allocation => 
      allocation.entry_order_product.guide_number?.startsWith('FIFO-GN')
    );
    const otherAllocations = quarantineAllocations.filter(allocation => 
      !allocation.entry_order_product.guide_number?.startsWith('FIFO-GN')
    );
    
    // First, approve ALL FIFO test products for departure testing
    for (const allocation of fifoTestAllocations) {
      const warehouseUser = faker.helpers.arrayElement(warehouseUsers);
      const product = allocation.entry_order_product.product;
      
      // ✅ FIFO test products are always approved
      const finalStatus = QualityControlStatus.APROBADO;
      
      // Create quality control transition record
      const qcTransition = await prisma.qualityControlTransition.create({
        data: {
          allocation_id: allocation.allocation_id,
          inventory_id: allocation.inventory[0]?.inventory_id,
          from_status: QualityControlStatus.CUARENTENA,
          to_status: finalStatus,
          quantity_moved: allocation.inventory_quantity,
          package_quantity_moved: allocation.package_quantity,
          weight_moved: parseFloat(allocation.weight_kg),
          volume_moved: allocation.volume_m3 ? parseFloat(allocation.volume_m3) : null,
          performed_by: warehouseUser.id,
          reason: "FIFO test product - approved for departure testing",
          notes: `FIFO test allocation approved for product ${product.product_code}`,
        },
      });
      
      // Update allocation and inventory status
      await prisma.inventoryAllocation.update({
        where: { allocation_id: allocation.allocation_id },
        data: {
          quality_status: finalStatus,
          last_modified_by: warehouseUser.id,
          last_modified_at: new Date(),
          observations: `FIFO test product - approved for departure testing`,
        },
      });
      
      if (allocation.inventory.length > 0) {
        await prisma.inventory.update({
          where: { inventory_id: allocation.inventory[0].inventory_id },
          data: {
            quality_status: finalStatus,
            status: InventoryStatus.AVAILABLE,
            last_modified_by: warehouseUser.id,
            last_modified_at: new Date(),
          },
        });
      }
      
      // Create audit logs
      await createAuditLog(
        warehouseUser.id,
        SystemAction.QUALITY_STATUS_CHANGED,
        "QualityControlTransition",
        qcTransition.transition_id,
        `FIFO test product approved: ${allocation.inventory_quantity} units of ${product.name}`,
        { quality_status: "CUARENTENA" },
        { quality_status: finalStatus },
        {
          allocation_id: allocation.allocation_id,
          product_code: product.product_code,
          fifo_test: true,
          cell: `${allocation.cell.row}.${allocation.cell.bay}.${allocation.cell.position}`
        }
      );
    }
    
    // Process remaining allocations with normal distribution
    for (const allocation of otherAllocations.slice(0, 15)) { // Limit transitions
      const warehouseUser = faker.helpers.arrayElement(warehouseUsers);
      const product = allocation.entry_order_product.product;
      
      // Randomly determine final quality status (most should be approved)
      const finalStatus = faker.helpers.weightedArrayElement([
        { weight: 70, value: QualityControlStatus.APROBADO },     // 70% approved
        { weight: 15, value: QualityControlStatus.DEVOLUCIONES }, // 15% returns
        { weight: 10, value: QualityControlStatus.CONTRAMUESTRAS }, // 10% samples
        { weight: 5, value: QualityControlStatus.RECHAZADOS },   // 5% rejected
      ]);
      
      // For some cases, split the allocation (partial transitions)
      const shouldSplit = faker.helpers.maybe(() => true, { probability: 0.3 });
      let transitions = [];
      
      if (shouldSplit && allocation.inventory_quantity > 10) {
        // Split allocation into multiple parts
        const totalQuantity = allocation.inventory_quantity;
        const totalWeight = parseFloat(allocation.weight_kg);
        const totalPackages = allocation.package_quantity;
        
        // Main portion (60-80%)
        const mainPortion = faker.number.float({ min: 0.6, max: 0.8 });
        const mainQuantity = Math.floor(totalQuantity * mainPortion);
        const mainWeight = totalWeight * mainPortion;
        const mainPackages = Math.floor(totalPackages * mainPortion);
        
        // Secondary portion (remaining)
        const secondQuantity = totalQuantity - mainQuantity;
        const secondWeight = totalWeight - mainWeight;
        const secondPackages = totalPackages - mainPackages;
        
        const secondaryStatus = faker.helpers.arrayElement([
          QualityControlStatus.DEVOLUCIONES,
          QualityControlStatus.CONTRAMUESTRAS,
          QualityControlStatus.RECHAZADOS,
        ]);
        
        transitions = [
          {
            to_status: finalStatus,
            quantity: mainQuantity,
            packages: mainPackages,
            weight: mainWeight,
            reason: "Quality inspection passed"
          },
          {
            to_status: secondaryStatus,
            quantity: secondQuantity,
            packages: secondPackages,
            weight: secondWeight,
            reason: secondaryStatus === QualityControlStatus.DEVOLUCIONES ? "Minor defects found" :
                    secondaryStatus === QualityControlStatus.CONTRAMUESTRAS ? "Reserved for sampling" :
                    "Quality standards not met"
          }
        ];
      } else {
        // Single transition for entire allocation
        transitions = [{
          to_status: finalStatus,
          quantity: allocation.inventory_quantity,
          packages: allocation.package_quantity,
          weight: parseFloat(allocation.weight_kg),
          reason: finalStatus === QualityControlStatus.APROBADO ? "Quality inspection passed" :
                  finalStatus === QualityControlStatus.DEVOLUCIONES ? "Customer return requested" :
                  finalStatus === QualityControlStatus.CONTRAMUESTRAS ? "Reserved for quality sampling" :
                  "Failed quality inspection"
        }];
      }
      
      // Create transitions
      for (const transition of transitions) {
        // Create quality control transition record
        const qcTransition = await prisma.qualityControlTransition.create({
          data: {
            allocation_id: allocation.allocation_id,
            inventory_id: allocation.inventory[0]?.inventory_id,
            from_status: QualityControlStatus.CUARENTENA,
            to_status: transition.to_status,
            quantity_moved: transition.quantity,
            package_quantity_moved: transition.packages,
            weight_moved: transition.weight,
            volume_moved: allocation.volume_m3 ? parseFloat(allocation.volume_m3) * (transition.quantity / allocation.inventory_quantity) : null,
            performed_by: warehouseUser.id,
            reason: transition.reason,
            notes: `Transitioned ${transition.quantity} units from quarantine to ${transition.to_status}`,
          },
        });
        
        // Create audit log for quality transition
        await createAuditLog(
          warehouseUser.id,
          SystemAction.QUALITY_STATUS_CHANGED,
          "QualityControlTransition",
          qcTransition.transition_id,
          `Quality status changed: ${transition.quantity} units of ${product.name} from CUARENTENA to ${transition.to_status}`,
          { quality_status: "CUARENTENA" },
          { quality_status: transition.to_status },
          {
            allocation_id: allocation.allocation_id,
            product_code: product.product_code,
            cell: `${allocation.cell.row}.${allocation.cell.bay}.${allocation.cell.position}`,
            reason: transition.reason
          }
        );
      }
      
      // Update the allocation's quality status to the primary status
      const primaryTransition = transitions[0];
      await prisma.inventoryAllocation.update({
        where: { allocation_id: allocation.allocation_id },
        data: {
          quality_status: primaryTransition.to_status,
          last_modified_by: warehouseUser.id,
          last_modified_at: new Date(),
          observations: `${allocation.observations || ''}\nQuality control completed: ${primaryTransition.reason}`,
        },
      });
      
      // Update inventory status
      if (allocation.inventory.length > 0) {
        await prisma.inventory.update({
          where: { inventory_id: allocation.inventory[0].inventory_id },
          data: {
            quality_status: primaryTransition.to_status,
            status: primaryTransition.to_status === QualityControlStatus.APROBADO ? 
                   InventoryStatus.AVAILABLE : 
                   primaryTransition.to_status === QualityControlStatus.RECHAZADOS ?
                   InventoryStatus.DAMAGED : InventoryStatus.RETURNED,
            last_modified_by: warehouseUser.id,
            last_modified_at: new Date(),
          },
        });
      }
      
      // Create inventory log for status change
      await prisma.inventoryLog.create({
        data: {
          user_id: warehouseUser.id,
          product_id: product.product_id,
          movement_type: MovementType.ADJUSTMENT,
          quantity_change: 0, // No quantity change, just status
          package_change: 0,
          weight_change: 0,
          volume_change: 0,
          allocation_id: allocation.allocation_id,
          warehouse_id: allocation.inventory[0]?.warehouse_id,
          cell_id: allocation.cell_id,
          product_status: allocation.product_status,
          status_code: allocation.status_code,
          notes: `Quality control transition: ${allocation.inventory_quantity} units moved from CUARENTENA to ${primaryTransition.to_status}. Reason: ${primaryTransition.reason}`,
        },
      });
    }
    
    console.log("✅ Quality control transitions created");
  } catch (error) {
    console.error("❌ Error creating quality control transitions:", error);
    throw error;
  }
}

async function createDepartureOrdersWithProducts() {
  try {
    console.log("🌱 Creating departure orders with products...");
    
    const clientUsers = await prisma.user.findMany({
      where: { role: { name: "CLIENT" } },
    });
    const warehouseUsers = await prisma.user.findMany({
      where: { 
        role: { 
          name: { 
            in: ["WAREHOUSE_INCHARGE", "WAREHOUSE_ASSISTANT", "PHARMACIST"] 
          } 
        } 
      },
    });
    const customers = await prisma.customer.findMany();
    const labels = await prisma.label.findMany();
    const exitOptions = await prisma.exitOption.findMany();
    const departureDocTypes = await prisma.departureDocumentType.findMany();
    
    // ✅ NEW: Get available inventory that has been approved (not in quarantine)
    const availableInventory = await prisma.inventory.findMany({
      where: {
        status: InventoryStatus.AVAILABLE,
        quality_status: QualityControlStatus.APROBADO, // ✅ Only approved inventory
        current_quantity: { gt: 0 },
      },
      include: {
        product: true,
        allocation: {
          include: {
            entry_order_product: {
              include: { product: true }
            }
          }
        },
        warehouse: true,
        cell: true,
      },
    });
    
    if (availableInventory.length === 0) {
      console.log("⚠️ No available inventory for departure orders");
      return [];
    }
    
    // Group inventory by product
    const inventoryByProduct = {};
    availableInventory.forEach(inv => {
      if (!inventoryByProduct[inv.product_id]) {
        inventoryByProduct[inv.product_id] = [];
      }
      inventoryByProduct[inv.product_id].push(inv);
    });
    
    const productIds = Object.keys(inventoryByProduct);
    
    let departureOrderCounter = 2000; // Start departure orders from 2000 to avoid conflicts
    
    for (let i = 0; i < Math.min(COUNT.DEPARTURE_ORDERS, productIds.length); i++) {
      const clientUser = faker.helpers.arrayElement(clientUsers);
      const customer = faker.helpers.arrayElement(customers);
      
      // Create base order
      const order = await prisma.order.create({
        data: {
          order_type: "DEPARTURE",
          status: "PROCESSING",
          priority: faker.helpers.arrayElement(["HIGH", "NORMAL", "LOW"]),
          created_at: faker.date.recent({ days: 30 }),
          organisation_id: clientUser.organisation_id,
          created_by: clientUser.id,
        },
      });
      
      // Create departure order
      const departureOrder = await prisma.departureOrder.create({
        data: {
          order_id: order.order_id,
          departure_order_no: `DEP-${String(departureOrderCounter).padStart(5, '0')}`,
          customer_id: customer.customer_id,
          document_type_id: faker.helpers.maybe(() => faker.helpers.arrayElement(departureDocTypes).document_type_id),
          registration_date: new Date(),
          document_date: faker.date.recent({ days: 7 }),
          departure_date_time: faker.date.future({ days: 5 }),
          created_by: clientUser.id,
          order_status: faker.helpers.arrayElement([
            OrderStatusDeparture.PENDING,
            OrderStatusDeparture.APPROVED,
            OrderStatusDeparture.REVISION,
            OrderStatusDeparture.REJECTED
          ]),
          destination_point: `${faker.location.city()}, ${faker.location.country()}`,
          transport_type: faker.helpers.arrayElement(["Truck", "Ship", "Air", "Rail"]),
          carrier_name: faker.company.name(),
          total_volume: parseFloat(faker.commerce.price({ min: 50, max: 500 })),
          total_weight: parseFloat(faker.commerce.price({ min: 200, max: 2000 })),
          total_value: parseFloat(faker.commerce.price({ min: 5000, max: 50000 })),
          total_pallets: faker.number.int({ min: 2, max: 10 }),
          observation: faker.lorem.paragraph(),
          uploaded_documents: {
            documents: [
              { name: "departure_invoice.pdf", url: "/documents/departure_invoice.pdf" }
            ]
          },
          warehouse_id: availableInventory[0].warehouse_id,
          label_id: faker.helpers.maybe(() => faker.helpers.arrayElement(labels).label_id),
          exit_option_id: faker.helpers.maybe(() => faker.helpers.arrayElement(exitOptions).exit_option_id),
          review_status: faker.helpers.arrayElement([ReviewStatus.PENDING, ReviewStatus.APPROVED]),
        },
              });
      
      departureOrderCounter++; // Increment counter for next unique order number
      
      // ✅ NEW: Create audit log for departure order creation
      await createAuditLog(
        clientUser.id,
        SystemAction.DEPARTURE_ORDER_CREATED,
        "DepartureOrder",
        departureOrder.departure_order_id,
        `Created departure order ${departureOrder.departure_order_no} for ${customer.name}`,
        null,
        {
          departure_order_no: departureOrder.departure_order_no,
          customer_name: customer.name,
          total_pallets: departureOrder.total_pallets,
          destination: departureOrder.destination_point
        },
        {
          warehouse_id: departureOrder.warehouse_id,
          transport_type: departureOrder.transport_type
        }
      );
      
      // Create departure products (2-4 products per departure)
      const numberOfProducts = faker.number.int({ min: 2, max: 4 });
      const selectedProductIds = faker.helpers.arrayElements(productIds, numberOfProducts);
      
      for (const productId of selectedProductIds) {
        const productInventory = inventoryByProduct[productId];
        const firstInventory = productInventory[0];
        const product = firstInventory.product;
        
        // Calculate totals available for this product
        const totalAvailable = productInventory.reduce((sum, inv) => sum + inv.current_quantity, 0);
        const totalWeight = productInventory.reduce((sum, inv) => sum + parseFloat(inv.current_weight), 0);
        const totalVolume = productInventory.reduce((sum, inv) => sum + parseFloat(inv.current_volume || 0), 0);
        
        // Request partial quantity
        const requestedQuantity = faker.number.int({ min: 1, max: Math.floor(totalAvailable * 0.8) });
        const requestedWeight = (requestedQuantity / totalAvailable) * totalWeight;
        const requestedVolume = (requestedQuantity / totalAvailable) * totalVolume;
        
        // Create departure order product
        await prisma.departureOrderProduct.create({
          data: {
            departure_order_id: departureOrder.departure_order_id,
            product_code: product.product_code,
            product_id: productId,
            lot_series: firstInventory.allocation?.entry_order_product?.lot_series,
            requested_quantity: requestedQuantity,
            requested_packages: Math.ceil(requestedQuantity / 10),
            requested_pallets: Math.ceil(requestedQuantity / 200),
            presentation: faker.helpers.arrayElement(Object.values(PresentationType)),
            requested_weight: requestedWeight,
            requested_volume: requestedVolume,
            unit_price: parseFloat(faker.commerce.price({ min: 10, max: 100 })),
            total_value: parseFloat(faker.commerce.price({ min: 500, max: 5000 })),
            temperature_requirement: faker.helpers.arrayElement(Object.values(TemperatureRangeType)),
            special_handling: faker.helpers.maybe(() => faker.lorem.sentence()),
            delivery_instructions: faker.lorem.sentence(),
          },
        });
      }
    }
    
    console.log("✅ Departure orders with products created");
  } catch (error) {
    console.error("❌ Error creating departure orders:", error);
    throw error;
  }
}

// ✅ SIMPLIFIED: Create a complete seed for testing the new simplified dispatch flow
async function main() {
  try {
    console.log("🌱 Starting complete seed for simplified dispatch flow...");
    
    // Create all base data
    await createBaseLookupTables();
    await createUsersAndOrganization();
    // await createSuppliersAndCustomers();
    // await createClients();
    // await assignClientsToWarehouseAssistants();
    // await createClientProductAssignments();
    // await createClientSupplierAssignments();
    await createWarehousesAndCells();
    
    // Create products (commented out - depends on suppliers)
    // console.log("🌱 Creating products...");
    // const suppliers = await prisma.supplier.findMany();
    // const categories = await prisma.productCategory.findMany();
    // const subcategories1 = await prisma.productSubCategory1.findMany();
    // const subcategories2 = await prisma.productSubCategory2.findMany();
    // const countries = await prisma.country.findMany();
    // const temperatureRanges = await prisma.temperatureRange.findMany();
    
    // Create products for testing
    // for (let i = 0; i < COUNT.PRODUCTS; i++) {
    //   const supplier = faker.helpers.arrayElement(suppliers);
    //   const category = faker.helpers.arrayElement(categories);
    //   const subcategory1 = faker.helpers.arrayElement(subcategories1.filter(s => s.category_id === category.category_id));
    //   const subcategory2 = subcategory1 ? faker.helpers.arrayElement(subcategories2.filter(s => s.subcategory1_id === subcategory1.subcategory1_id)) : null;
    //   
    //   await prisma.product.create({
    //     data: {
    //       product_code: `PROD-${String(i + 1).padStart(4, '0')}`,
    //       name: faker.commerce.productName(),
    //       category_id: category.category_id,
    //       subcategory1_id: subcategory1?.subcategory1_id,
    //       subcategory2_id: subcategory2?.subcategory2_id,
    //       manufacturer: supplier.company_name || supplier.name || faker.company.name(),
    //       temperature_range_id: faker.helpers.maybe(() => faker.helpers.arrayElement(temperatureRanges).temperature_range_id),
    //       humidity: faker.helpers.maybe(() => `${faker.number.int({ min: 30, max: 70 })}%`),
    //       observations: faker.lorem.sentence(),
    //       uploaded_documents: faker.helpers.maybe(() => ({
    //         documents: [
    //           { name: "product_spec.pdf", url: "/documents/product_spec.pdf" }
    //         ]
    //       })),
    //     },
    //   });
    // }
    // console.log("✅ Products created");
    
    // Create entry orders and inventory (commented out - depends on products)
    // await createEntryOrdersWithProducts();
    // await createInventoryAllocations();
    // await createQualityControlTransitions();
    
    // Create departure orders with simplified flow (commented out - depends on products)
    // await createDepartureOrdersWithProducts();
    
    console.log("🎉 Complete seed data created successfully!");
    console.log("\n📊 Seed Summary:");
    console.log(`   • ✅ ORGANISATIONS: ${COUNT.ORGANISATIONS} created`);
    console.log(`   • ✅ USERS: ${COUNT.USERS} created with proper roles`);
    console.log(`   • ❌ SUPPLIERS: Skipped (not needed)`);
    console.log(`   • ❌ CUSTOMERS: Skipped (not needed)`);
    console.log(`   • ❌ CLIENTS: Skipped (not needed)`);
    console.log(`   • ❌ PRODUCTS: Skipped (depends on suppliers)`);
    console.log(`   • ✅ WAREHOUSES: ${COUNT.WAREHOUSES} created with cells`);
    console.log(`   • ❌ ENTRY ORDERS: Skipped (depends on products)`);
    console.log(`   • ❌ DEPARTURE ORDERS: Skipped (depends on products)`);
    console.log("\n🔄 Simplified Dispatch Flow Features:");
    console.log("   • ✅ No partial dispatch tracking");
    console.log("   • ✅ APPROVED → COMPLETED status flow");
    console.log("   • ✅ Flexible dispatch quantities");
    console.log("   • ✅ FIFO + expiry date inventory selection");
    console.log("   • ✅ Complete audit trail");
    console.log("\n🔑 Test Credentials:");
    console.log("   • Admin: admin1 / Admin123!");
    console.log("   • Warehouse Incharge: wh_incharge1 / WhIncharge123!");
    console.log("   • Pharmacist: pharmacist1 / Pharmacist123!");
    console.log("   • Warehouse Assistant: wh_assistant1 / WhAssistant123!");
    console.log("   • Client: client1 / Client123!");
    console.log("\n🧪 Ready for Testing:");
    console.log("   • API endpoints for simplified dispatch flow");
    console.log("   • Auto-selection of inventory with FIFO");
    console.log("   • Flexible quantity dispatch");
    console.log("   • Complete order lifecycle");
    
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();