const ProductService = require("./product.service");

/**
 * Create a new product
 */
async function createProduct(req, res) {
  try {
    const productData = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const files = req.files; // For multipart/form-data with file uploads

    console.log("📝 Creating product with potential documents...");
    console.log("Product data:", productData);
    console.log("Files received:", files ? files.length : 0);

    // ✅ LOG: Product creation process started
    await req.logEvent(
      'PRODUCT_CREATION_STARTED',
      'Product',
      'NEW_PRODUCT',
      `Started creating new product: ${productData.name}`,
      null,
      {
        product_name: productData.name,
        product_code: productData.product_code || 'AUTO_GENERATED',
        manufacturer: productData.manufacturer,
        
        // ✅ NEW: Log new category fields
        category_id: productData.category_id,
        subcategory1_id: productData.subcategory1_id,
        subcategory2_id: productData.subcategory2_id,
        observations: productData.observations,
        has_uploaded_documents: !!productData.uploaded_documents,
        
        // ✅ DEPRECATED: Keep old fields for backward compatibility
        temperature_range_id: productData.temperature_range_id,
        
        created_by: userId,
        creator_role: userRole,
        creation_timestamp: new Date().toISOString(),
        has_description: !!productData.description,
        has_specifications: !!productData.specifications
      },
      { operation_type: 'PRODUCT_MANAGEMENT', action_type: 'CREATION_START' }
    );

    const product = await ProductService.createProduct(productData, userId, userRole);

    // ✅ NEW: If files are uploaded, process document uploads
    if (files && files.length > 0 && product) {
      console.log(`📎 Processing ${files.length} document uploads for product ${product.product_id}`);
      
      const { uploadDocument, validateFile } = require("../../utils/supabase");
      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();
      // Parse document types if it's a string
      let documentTypes = productData.document_types || [];
      if (typeof documentTypes === 'string') {
        try {
          documentTypes = JSON.parse(documentTypes);
        } catch (e) {
          console.log('Failed to parse document_types, using as single type:', documentTypes);
          documentTypes = [documentTypes];
        }
      }
      
      const uploadResults = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const documentType = Array.isArray(documentTypes) 
          ? (documentTypes[i] || 'OTRO') 
          : (documentTypes || 'OTRO');

        // Validate file
        const validation = validateFile(file.originalname, file.size);
        if (!validation.valid) {
          uploadResults.push({
            filename: file.originalname,
            success: false,
            error: validation.error
          });
          continue;
        }

        // Upload to Supabase
        const uploadResult = await uploadDocument(
          file.buffer,
          file.originalname,
          'product',
          product.product_id,
          documentType,
          userId
        );

        uploadResults.push({
          filename: file.originalname,
          ...uploadResult
        });
      }

      // Update product with document information
      const successfulUploads = uploadResults.filter(r => r.success);
      if (successfulUploads.length > 0) {
        const documentMetadata = successfulUploads.map(upload => ({
          file_name: upload.file_name,
          file_path: upload.file_path,
          public_url: upload.public_url,
          document_type: upload.document_type,
          uploaded_by: upload.uploaded_by,
          uploaded_at: upload.uploaded_at,
          file_size: upload.file_size,
          content_type: upload.content_type
        }));

        // Update product with documents
        await prisma.product.update({
          where: { product_id: product.product_id },
          data: {
            uploaded_documents: documentMetadata
          }
        });

        // Log document upload activity
        await req.logEvent(
          'DOCUMENTOS_SUBIDOS_CREACION_PRODUCTO',
          'Producto',
          product.product_id,
          `Se subieron ${successfulUploads.length} documentos durante la creación del producto ${product.name}`,
          null,
          {
            producto_id: product.product_id,
            producto_nombre: product.name,
            producto_codigo: product.product_code,
            documentos_subidos: successfulUploads.length,
            tipos_documento: documentMetadata.map(d => d.document_type),
            usuario_id: userId
          }
        );
      }

      // Add upload results to response
      product.document_uploads = {
        total_files: files.length,
        successful_uploads: successfulUploads.length,
        failed_uploads: uploadResults.filter(r => !r.success).length,
        upload_details: uploadResults
      };
    }

    // ✅ LOG: Successful product creation
    await req.logEvent(
      'PRODUCT_CREATED',
      'Product',
      product.product_id,
      `Successfully created new product: ${product.name}`,
      null,
      {
        product_id: product.product_id,
        product_name: product.name,
        product_code: product.product_code,
        manufacturer: product.manufacturer,
        
        // ✅ NEW: Log new category fields
        category_id: product.category_id,
        subcategory1_id: product.subcategory1_id,
        subcategory2_id: product.subcategory2_id,
        observations: product.observations,
        uploaded_documents: product.uploaded_documents,
        
        // ✅ DEPRECATED: Keep old fields for backward compatibility
        temperature_range_id: product.temperature_range_id,
        
        description: product.description,
        specifications: product.specifications,
        created_by: userId,
        creator_role: userRole,
        created_at: product.created_at,
        business_impact: 'NEW_PRODUCT_AVAILABLE_FOR_ORDERS'
      },
      { 
        operation_type: 'PRODUCT_MANAGEMENT', 
        action_type: 'CREATION_SUCCESS',
        business_impact: 'PRODUCT_CATALOG_EXPANDED',
        next_steps: 'PRODUCT_AVAILABLE_FOR_ENTRY_ORDERS'
      }
    );

    res.status(201).json(product);
  } catch (error) {
    console.error('Error creating product:', error);
    
    // ✅ LOG: Product creation failure
    await req.logError(error, {
      controller: 'product',
      action: 'createProduct',
      product_data: {
        name: req.body.name,
        product_code: req.body.product_code,
        manufacturer: req.body.manufacturer,
        category_id: req.body.category_id,
        subcategory1_id: req.body.subcategory1_id,
        subcategory2_id: req.body.subcategory2_id,
        // ✅ DEPRECATED: Keep old fields
        temperature_range_id: req.body.temperature_range_id
      },
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'PRODUCT_CREATION_FAILED'
    });
    
    // ✅ IMPROVED: Better error handling for unique constraint violations
    if (error.message.includes('already exists')) {
      res.status(409).json({ 
        success: false,
        error: error.message,
        error_type: 'DUPLICATE_PRODUCT_CODE',
        suggestion: 'Please use a different product code or leave it empty for auto-generation'
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: error.message 
      });
    }
  }
}

/**
 * Get all products
 */
async function getAllProducts(req, res) {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    const filters = {
      // ✅ NEW: Category-based filters
      category_id: req.query.category_id,
      subcategory1_id: req.query.subcategory1_id,
      subcategory2_id: req.query.subcategory2_id,
      manufacturer: req.query.manufacturer,
      
      // ✅ DEPRECATED: Keep old filters for backward compatibility
      name: req.query.name,
    };

    // ✅ LOG: Product list access
    await req.logEvent(
      'PRODUCT_UPDATED', // Use valid SystemAction value
      'Product',
      'PRODUCT_LIST',
      `User accessed product list`,
      null,
      {
        accessed_by: userId,
        accessor_role: userRole,
        access_timestamp: new Date().toISOString(),
        filters_applied: filters,
        has_filters: !!(filters.category_id || filters.subcategory1_id || filters.subcategory2_id || 
                       filters.manufacturer || filters.name)
      },
      { operation_type: 'PRODUCT_MANAGEMENT', action_type: 'LIST_ACCESS' }
    );

    const products = await ProductService.getAllProducts(filters, userRole, userId);
    
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    
    // ✅ LOG: Product list access failure
    await req.logError(error, {
      controller: 'product',
      action: 'getAllProducts',
      filters: req.query,
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'PRODUCT_LIST_ACCESS_FAILED'
    });
    
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get product by ID
 */
async function getProductById(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    // ✅ LOG: Product details access
    await req.logEvent(
      'PRODUCT_UPDATED', // Use valid SystemAction value
      'Product',
      id,
      `User accessed product details for product ${id}`,
      null,
      {
        product_id: id,
        accessed_by: userId,
        accessor_role: userRole,
        access_timestamp: new Date().toISOString()
      },
      { operation_type: 'PRODUCT_MANAGEMENT', action_type: 'DETAILS_ACCESS' }
    );

    const product = await ProductService.getProductById(id);
    
    if (!product) {
      // ✅ LOG: Product not found
      await req.logEvent(
        'PRODUCT_UPDATED', // Use valid SystemAction value
        'Product',
        id,
        `Product ${id} not found during details access`,
        null,
        {
          product_id: id,
          accessed_by: userId,
          accessor_role: userRole
        },
        { operation_type: 'PRODUCT_MANAGEMENT', action_type: 'NOT_FOUND' }
      );
      
      return res.status(404).json({ error: "Product not found" });
    }
    
    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    
    // ✅ LOG: Product details access failure
    await req.logError(error, {
      controller: 'product',
      action: 'getProductById',
      product_id: req.params.id,
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'PRODUCT_DETAILS_ACCESS_FAILED'
    });
    
    res.status(500).json({ error: error.message });
  }
}

/**
 * Update product
 */
async function updateProduct(req, res) {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    // ✅ LOG: Product update process started
    await req.logEvent(
      'PRODUCT_UPDATED', // Use valid SystemAction value
      'Product',
      id,
      `Started updating product ${id}`,
      null,
      {
        product_id: id,
        update_fields: Object.keys(updateData),
        updated_by: userId,
        updater_role: userRole,
        update_timestamp: new Date().toISOString(),
        has_name_change: !!updateData.name,
        has_code_change: !!updateData.product_code,
        has_manufacturer_change: !!updateData.manufacturer,
        has_category_change: !!(updateData.category_id),
        has_temperature_change: !!updateData.temperature_range_id,
        has_description_change: !!updateData.description,
        has_specifications_change: !!updateData.specifications
      },
      { operation_type: 'PRODUCT_MANAGEMENT', action_type: 'UPDATE_START' }
    );

    const product = await ProductService.updateProduct(id, updateData);

    // ✅ LOG: Successful product update
    await req.logEvent(
      'PRODUCT_UPDATED',
      'Product',
      id,
      `Successfully updated product ${id}`,
      null, // Old values would come from service if implemented
      {
        product_id: id,
        updated_fields: Object.keys(updateData),
        updated_by: userId,
        updater_role: userRole,
        updated_at: new Date().toISOString(),
        business_impact: 'PRODUCT_INFORMATION_UPDATED'
      },
      { 
        operation_type: 'PRODUCT_MANAGEMENT', 
        action_type: 'UPDATE_SUCCESS',
        business_impact: 'PRODUCT_CATALOG_MODIFIED',
        changes_summary: {
          fields_updated: Object.keys(updateData),
          critical_info_changed: !!(updateData.name || updateData.product_code || updateData.manufacturer),
          categorization_changed: !!(updateData.category_id),
          storage_requirements_changed: !!updateData.temperature_range_id
        }
      }
    );
    
    res.json(product);
  } catch (error) {
    console.error('Error updating product:', error);
    
    // ✅ LOG: Product update failure
    await req.logError(error, {
      controller: 'product',
      action: 'updateProduct',
      product_id: req.params.id,
      update_data_keys: Object.keys(req.body || {}),
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'PRODUCT_UPDATE_FAILED'
    });
    
    res.status(400).json({ error: error.message });
  }
}

/**
 * Delete product
 */
async function deleteProduct(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    // ✅ LOG: Product deletion process started
    await req.logEvent(
      'PRODUCT_DELETED', // Use valid SystemAction value
      'Product',
      id,
      `Started deleting product ${id}`,
      null,
      {
        product_id: id,
        deleted_by: userId,
        deleter_role: userRole,
        deletion_timestamp: new Date().toISOString()
      },
      { operation_type: 'PRODUCT_MANAGEMENT', action_type: 'DELETION_START' }
    );

    await ProductService.deleteProduct(id);

    // ✅ LOG: Successful product deletion
    await req.logEvent(
      'PRODUCT_DELETED',
      'Product',
      id,
      `Successfully deleted product ${id}`,
      null,
      {
        product_id: id,
        deleted_by: userId,
        deleter_role: userRole,
        deleted_at: new Date().toISOString(),
        business_impact: 'PRODUCT_REMOVED_FROM_CATALOG'
      },
      { 
        operation_type: 'PRODUCT_MANAGEMENT', 
        action_type: 'DELETION_SUCCESS',
        business_impact: 'PRODUCT_CATALOG_REDUCED',
        next_steps: 'VERIFY_NO_ACTIVE_INVENTORY_REMAINS'
      }
    );
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting product:', error);
    
    // ✅ LOG: Product deletion failure
    await req.logError(error, {
      controller: 'product',
      action: 'deleteProduct',
      product_id: req.params.id,
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'PRODUCT_DELETION_FAILED'
    });
    
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get temperature ranges
 */
async function getTemperatureRanges(req, res) {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    // ✅ LOG: Temperature ranges access
    await req.logEvent(
      'TEMPERATURE_RANGES_ACCESSED',
      'TemperatureRange',
      'TEMPERATURE_RANGES_LIST',
      `User accessed temperature ranges list`,
      null,
      {
        accessed_by: userId,
        accessor_role: userRole,
        access_timestamp: new Date().toISOString()
      },
      { operation_type: 'PRODUCT_MANAGEMENT', action_type: 'REFERENCE_DATA_ACCESS' }
    );

    const ranges = await ProductService.getTemperatureRanges();
    res.json(ranges);
  } catch (error) {
    console.error('Error fetching temperature ranges:', error);
    
    // ✅ LOG: Temperature ranges access failure
    await req.logError(error, {
      controller: 'product',
      action: 'getTemperatureRanges',
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'TEMPERATURE_RANGES_ACCESS_FAILED'
    });
    
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get form fields: productLines, groups, and temperatureRanges
 */
async function getFormFields(req, res) {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    // ✅ LOG: Form fields access
    await req.logEvent(
      'PRODUCT_CREATED', // Use valid SystemAction value
      'ProductFormFields',
      'FORM_FIELDS',
      `User accessed product form fields`,
      null,
      {
        accessed_by: userId,
        accessor_role: userRole,
        access_timestamp: new Date().toISOString()
      },
      { operation_type: 'PRODUCT_MANAGEMENT', action_type: 'FORM_DATA_ACCESS' }
    );

    const formFields = await ProductService.getFormFields();
    res.json(formFields);
  } catch (error) {
    console.error('Error fetching form fields:', error);
    
    // ✅ LOG: Form fields access failure
    await req.logError(error, {
      controller: 'product',
      action: 'getFormFields',
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'PRODUCT_FORM_FIELDS_ACCESS_FAILED'
    });
    
    res.status(500).json({ error: error.message });
  }
}

// ✅ NEW: Get product categories
async function getProductCategories(req, res) {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    // ✅ LOG: Product categories access
    await req.logEvent(
      'PRODUCT_UPDATED', // Use valid SystemAction value
      'ProductCategory',
      'CATEGORIES_LIST',
      `User accessed product categories list`,
      null,
      {
        accessed_by: userId,
        accessor_role: userRole,
        access_timestamp: new Date().toISOString()
      },
      { operation_type: 'PRODUCT_MANAGEMENT', action_type: 'CATEGORY_DATA_ACCESS' }
    );

    const categories = await ProductService.getProductCategories();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching product categories:', error);
    
    // ✅ LOG: Product categories access failure
    await req.logError(error, {
      controller: 'product',
      action: 'getProductCategories',
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'CATEGORIES_ACCESS_FAILED'
    });
    
    res.status(500).json({ error: error.message });
  }
}

// ✅ NEW: Create product category
async function createProductCategory(req, res) {
  try {
    const { name, description } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    // Validation
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Category name is required' });
    }
    
    // ✅ LOG: Category creation process started
    await req.logEvent(
      'PRODUCT_CREATED', // Use valid SystemAction value
      'ProductCategory',
      'NEW_CATEGORY',
      `Started creating new product category: ${name}`,
      null,
      {
        category_name: name,
        description: description,
        created_by: userId,
        creator_role: userRole,
        creation_timestamp: new Date().toISOString()
      },
      { operation_type: 'PRODUCT_MANAGEMENT', action_type: 'CATEGORY_CREATION_START' }
    );

    const category = await ProductService.createProductCategory({ name: name.trim(), description });
    
    // ✅ LOG: Successful category creation
    await req.logEvent(
      'PRODUCT_CREATED', // Use valid SystemAction value
      'ProductCategory',
      category.category_id,
      `Successfully created new product category: ${category.name}`,
      null,
      {
        category_id: category.category_id,
        category_name: category.name,
        description: category.description,
        created_by: userId,
        creator_role: userRole,
        created_at: category.created_at,
        business_impact: 'NEW_CATEGORY_AVAILABLE_FOR_PRODUCTS'
      },
      { 
        operation_type: 'PRODUCT_MANAGEMENT', 
        action_type: 'CATEGORY_CREATION_SUCCESS',
        business_impact: 'PRODUCT_CATEGORIZATION_EXPANDED'
      }
    );

    res.status(201).json({
      success: true,
      message: 'Product category created successfully',
      data: category
    });
  } catch (error) {
    console.error('Error creating product category:', error);
    
    // ✅ LOG: Category creation failure
    await req.logError(error, {
      controller: 'product',
      action: 'createProductCategory',
      category_data: {
        name: req.body.name,
        description: req.body.description
      },
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'CATEGORY_CREATION_FAILED'
    });
    
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
}

// ✅ NEW: Get subcategories1 for a category
async function getSubCategories1(req, res) {
  try {
    const { categoryId, category_id } = req.query; // Support both parameter names
    const finalCategoryId = categoryId || category_id; // Flexible parameter handling
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    // ✅ LOG: Subcategories1 access
    await req.logEvent(
      'PRODUCT_UPDATED', // Use valid SystemAction value
      'ProductSubCategory1',
      'SUBCATEGORIES1_LIST',
      `User accessed subcategories1 list${finalCategoryId ? ` for category ${finalCategoryId}` : ''}`,
      null,
      {
        accessed_by: userId,
        accessor_role: userRole,
        category_id: finalCategoryId,
        access_timestamp: new Date().toISOString()
      },
      { operation_type: 'PRODUCT_MANAGEMENT', action_type: 'SUBCATEGORY_DATA_ACCESS' }
    );

    const subcategories = await ProductService.getSubCategories1(finalCategoryId);
    res.json(subcategories);
  } catch (error) {
    console.error('Error fetching subcategories1:', error);
    
    // ✅ LOG: Subcategories1 access failure
    await req.logError(error, {
      controller: 'product',
      action: 'getSubCategories1',
      category_id: req.query.categoryId || req.query.category_id,
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'SUBCATEGORIES1_ACCESS_FAILED'
    });
    
    res.status(500).json({ error: error.message });
  }
}

// ✅ NEW: Create subcategory1
async function createSubCategory1(req, res) {
  try {
    const { name, description, category_id } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    // Validation
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Subcategory name is required' });
    }
    if (!category_id) {
      return res.status(400).json({ error: 'Category ID is required' });
    }
    
    // ✅ LOG: Subcategory1 creation process started
    await req.logEvent(
      'PRODUCT_CREATED', // Use valid SystemAction value
      'ProductSubCategory1',
      'NEW_SUBCATEGORY1',
      `Started creating new subcategory1: ${name}`,
      null,
      {
        subcategory_name: name,
        description: description,
        category_id: category_id,
        created_by: userId,
        creator_role: userRole,
        creation_timestamp: new Date().toISOString()
      },
      { operation_type: 'PRODUCT_MANAGEMENT', action_type: 'SUBCATEGORY1_CREATION_START' }
    );

    const subcategory = await ProductService.createSubCategory1({ 
      name: name.trim(), 
      description, 
      category_id 
    });
    
    // ✅ LOG: Successful subcategory1 creation
    await req.logEvent(
      'PRODUCT_CREATED', // Use valid SystemAction value
      'ProductSubCategory1',
      subcategory.subcategory1_id,
      `Successfully created new subcategory1: ${subcategory.name}`,
      null,
      {
        subcategory1_id: subcategory.subcategory1_id,
        subcategory_name: subcategory.name,
        description: subcategory.description,
        category_id: subcategory.category_id,
        created_by: userId,
        creator_role: userRole,
        created_at: subcategory.created_at,
        business_impact: 'NEW_SUBCATEGORY_AVAILABLE_FOR_PRODUCTS'
      },
      { 
        operation_type: 'PRODUCT_MANAGEMENT', 
        action_type: 'SUBCATEGORY1_CREATION_SUCCESS',
        business_impact: 'PRODUCT_CATEGORIZATION_EXPANDED'
      }
    );

    res.status(201).json({
      success: true,
      message: 'Subcategory1 created successfully',
      data: subcategory
    });
  } catch (error) {
    console.error('Error creating subcategory1:', error);
    
    // ✅ LOG: Subcategory1 creation failure
    await req.logError(error, {
      controller: 'product',
      action: 'createSubCategory1',
      subcategory_data: {
        name: req.body.name,
        description: req.body.description,
        category_id: req.body.category_id
      },
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'SUBCATEGORY1_CREATION_FAILED'
    });
    
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
}

// ✅ NEW: Get subcategories2 for a subcategory1
async function getSubCategories2(req, res) {
  try {
    const { subcategory1Id, subcategory1_id } = req.query; // Support both parameter names
    const finalSubcategory1Id = subcategory1Id || subcategory1_id; // Flexible parameter handling
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    // ✅ LOG: Subcategories2 access
    await req.logEvent(
      'PRODUCT_SUBCATEGORIES2_ACCESSED',
      'ProductSubCategory2',
      'SUBCATEGORIES2_LIST',
      `User accessed subcategories2 list${finalSubcategory1Id ? ` for subcategory1 ${finalSubcategory1Id}` : ''}`,
      null,
      {
        accessed_by: userId,
        accessor_role: userRole,
        subcategory1_id: finalSubcategory1Id,
        access_timestamp: new Date().toISOString()
      },
      { operation_type: 'PRODUCT_MANAGEMENT', action_type: 'SUBCATEGORY_DATA_ACCESS' }
    );

    const subcategories = await ProductService.getSubCategories2(finalSubcategory1Id);
    res.json(subcategories);
  } catch (error) {
    console.error('Error fetching subcategories2:', error);
    
    // ✅ LOG: Subcategories2 access failure
    await req.logError(error, {
      controller: 'product',
      action: 'getSubCategories2',
      subcategory1_id: req.query.subcategory1Id || req.query.subcategory1_id,
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'SUBCATEGORIES2_ACCESS_FAILED'
    });
    
    res.status(500).json({ error: error.message });
  }
}

// ✅ NEW: Create subcategory2
async function createSubCategory2(req, res) {
  try {
    const { name, description, subcategory1_id } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    // Validation
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Subcategory name is required' });
    }
    if (!subcategory1_id) {
      return res.status(400).json({ error: 'Subcategory1 ID is required' });
    }
    
    // ✅ LOG: Subcategory2 creation process started
    await req.logEvent(
      'PRODUCT_SUBCATEGORY2_CREATION_STARTED',
      'ProductSubCategory2',
      'NEW_SUBCATEGORY2',
      `Started creating new subcategory2: ${name}`,
      null,
      {
        subcategory_name: name,
        description: description,
        subcategory1_id: subcategory1_id,
        created_by: userId,
        creator_role: userRole,
        creation_timestamp: new Date().toISOString()
      },
      { operation_type: 'PRODUCT_MANAGEMENT', action_type: 'SUBCATEGORY2_CREATION_START' }
    );

    const subcategory = await ProductService.createSubCategory2({ 
      name: name.trim(), 
      description, 
      subcategory1_id 
    });
    
    // ✅ LOG: Successful subcategory2 creation
    await req.logEvent(
      'PRODUCT_SUBCATEGORY2_CREATED',
      'ProductSubCategory2',
      subcategory.subcategory2_id,
      `Successfully created new subcategory2: ${subcategory.name}`,
      null,
      {
        subcategory2_id: subcategory.subcategory2_id,
        subcategory_name: subcategory.name,
        description: subcategory.description,
        subcategory1_id: subcategory.subcategory1_id,
        subcategory1_name: subcategory.subcategory1?.name,
        category_name: subcategory.subcategory1?.category?.name,
        created_by: userId,
        creator_role: userRole,
        created_at: subcategory.created_at,
        business_impact: 'NEW_SUBCATEGORY2_AVAILABLE_FOR_PRODUCTS'
      },
      { 
        operation_type: 'PRODUCT_MANAGEMENT', 
        action_type: 'SUBCATEGORY2_CREATION_SUCCESS',
        business_impact: 'PRODUCT_CATEGORIZATION_EXPANDED'
      }
    );

    res.status(201).json({
      success: true,
      message: 'Subcategory2 created successfully',
      data: subcategory
    });
  } catch (error) {
    console.error('Error creating subcategory2:', error);
    
    // ✅ LOG: Subcategory2 creation failure
    await req.logError(error, {
      controller: 'product',
      action: 'createSubCategory2',
      subcategory_data: {
        name: req.body.name,
        description: req.body.description,
        subcategory1_id: req.body.subcategory1_id
      },
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'SUBCATEGORY2_CREATION_FAILED'
    });
    
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
}

/**
 * Generate bulk upload template
 */
async function getBulkUploadTemplate(req, res) {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    // ✅ LOG: Template download access
    await req.logEvent(
      'PRODUCT_CREATED', // Use valid SystemAction value
      'ProductBulkTemplate',
      'TEMPLATE_DOWNLOAD',
      `User downloaded bulk product upload template`,
      null,
      {
        accessed_by: userId,
        accessor_role: userRole,
        access_timestamp: new Date().toISOString()
      },
      { operation_type: 'PRODUCT_MANAGEMENT', action_type: 'TEMPLATE_DOWNLOAD' }
    );

    const { processBulkProductUpload, generateProductTemplate } = require('./bulk-product.service');
    const result = await generateProductTemplate();

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    // Set headers for Excel download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.buffer.length);

    res.send(result.buffer);
  } catch (error) {
    console.error('Error generating bulk upload template:', error);

    // ✅ LOG: Template download failure
    await req.logError(error, {
      controller: 'product',
      action: 'getBulkUploadTemplate',
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'TEMPLATE_GENERATION_FAILED'
    });

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Process bulk product upload
 */
async function processBulkUpload(req, res) {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Validate file type
    const validMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream' // Excel files may be detected as this
    ];

    if (!validMimeTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: `Invalid file type: ${file.mimetype}. Please upload an Excel (.xlsx) file.`
      });
    }

    // ✅ LOG: Bulk upload process started
    await req.logEvent(
      'PRODUCT_CREATED', // Use valid SystemAction value
      'ProductBulkUpload',
      'BULK_UPLOAD_START',
      `Started bulk product upload process`,
      null,
      {
        uploaded_by: userId,
        uploader_role: userRole,
        upload_timestamp: new Date().toISOString(),
        file_name: file.originalname,
        file_size: file.size
      },
      { operation_type: 'PRODUCT_MANAGEMENT', action_type: 'BULK_UPLOAD_START' }
    );

    const { processBulkProductUpload } = require('./bulk-product.service');
    const result = await processBulkProductUpload(file.buffer, userId, userRole);

    // ✅ LOG: Bulk upload process completed
    await req.logEvent(
      'PRODUCT_CREATED', // Use valid SystemAction value
      'ProductBulkUpload',
      'BULK_UPLOAD_COMPLETE',
      `Completed bulk product upload: ${result.data?.successCount || 0} successful, ${result.data?.errorCount || 0} failed`,
      null,
      {
        uploaded_by: userId,
        uploader_role: userRole,
        upload_timestamp: new Date().toISOString(),
        file_name: file.originalname,
        file_size: file.size,
        success_count: result.data?.successCount || 0,
        error_count: result.data?.errorCount || 0,
        processing_time_ms: result.processing_time_ms,
        business_impact: result.success ? 'PRODUCTS_ADDED_TO_CATALOG' : 'PARTIAL_PRODUCT_UPLOAD'
      },
      {
        operation_type: 'PRODUCT_MANAGEMENT',
        action_type: 'BULK_UPLOAD_COMPLETE',
        business_impact: result.success ? 'PRODUCT_CATALOG_EXPANDED' : 'PARTIAL_CATALOG_UPDATE'
      }
    );

    res.json(result);
  } catch (error) {
    console.error('Error processing bulk upload:', error);

    // ✅ LOG: Bulk upload failure
    await req.logError(error, {
      controller: 'product',
      action: 'processBulkUpload',
      file_info: {
        name: req.file?.originalname,
        size: req.file?.size,
        mimetype: req.file?.mimetype
      },
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'BULK_UPLOAD_FAILED'
    });

    res.status(500).json({
      success: false,
      message: 'Bulk upload processing failed',
      error: error.message
    });
  }
}

module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,

  // ✅ NEW: Category system controllers
  getProductCategories,
  createProductCategory,
  getSubCategories1,
  createSubCategory1,
  getSubCategories2,
  createSubCategory2,

  // ✅ NEW: Bulk upload controllers
  getBulkUploadTemplate,
  processBulkUpload,

  // ✅ DEPRECATED: Keep old controllers for backward compatibility
  getTemperatureRanges,
  getFormFields,
};
