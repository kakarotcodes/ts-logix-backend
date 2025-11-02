const departureService = require("./departure.service");
const bulkDepartureService = require("./bulk-departure.service");

// Dropdown fields for Departure form
async function getDepartureFormFields(req, res) {
  try {
    const userRole = req.user?.role;
    const userId = req.user?.id;
    const data = await departureService.getDepartureFormFields(userRole, userId);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// Exit options for Departure
async function getDepartureExitOptions(req, res) {
  try {
    const data = await departureService.getDepartureExitOptions();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// Fetch all Departure Orders
async function getAllDepartureOrders(req, res) {
  try {
    const search = req.query.orderNo || "";
    const organisationId = req.query.organisationId || null;
    const status = req.query.status || null; // ✅ NEW: Filter by status
    
    // ✅ FIXED: The JWT token stores role as a string directly (from auth.service.js)
    const userRole = req.user?.role; // Role is stored directly as string in JWT
    const userOrgId = req.user?.organisation_id;
    
    const data = await departureService.getAllDepartureOrders(search, organisationId, userRole, userOrgId, status);
    return res.status(200).json({ 
      success: true,
      message: "Departure orders fetched successfully", 
      count: data.length,
      data 
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * NEW: Get products with available inventory grouped by entry order product
 */
async function getProductsWithInventory(req, res) {
  try {
    const { warehouseId } = req.query;
    const userRole = req.user?.role;
    const userId = req.user?.id;
    
    const data = await departureService.getProductsWithInventory(warehouseId || null, userRole, userId);
    
    return res.status(200).json({ 
      success: true,
      message: userRole === "CLIENT" 
        ? "Products assigned to your client account with inventory fetched successfully"
        : "Products with inventory fetched successfully", 
      count: data.length,
      data,
      user_role: userRole,
      filtered_by_client_assignments: userRole === "CLIENT"
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * NEW: Get available cells for a specific entry order product
 */
async function getAvailableCellsForProduct(req, res) {
  try {
    const { entryOrderProductId } = req.params;
    const { warehouseId } = req.query;
    const userRole = req.user?.role;
    const userId = req.user?.id;
    
    if (!entryOrderProductId) {
      return res.status(400).json({
        success: false,
        message: "Entry Order Product ID is required",
      });
    }
    
    const data = await departureService.getAvailableCellsForProduct(
      entryOrderProductId,
      warehouseId || null,
      userRole,
      userId
    );
    
    return res.status(200).json({ 
      success: true,
      message: userRole === "CLIENT" 
        ? "Available inventory in your assigned cells fetched successfully"
        : "Available cells fetched successfully", 
      count: data.length,
      data,
      user_role: userRole,
      filtered_by_client_assignments: userRole === "CLIENT"
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

// Validate selected cell
async function validateSelectedCell(req, res) {
  try {
    const { inventory_id, requested_qty, requested_weight } = req.body;
    
    if (!inventory_id || !requested_qty || !requested_weight) {
      return res.status(400).json({
        success: false,
        message: "inventory_id, requested_qty, and requested_weight are required",
      });
    }
    
    const data = await departureService.validateSelectedCell(
      inventory_id,
      parseInt(requested_qty),
      parseFloat(requested_weight)
    );
    
    return res.status(200).json({ 
      success: true,
      message: "Cell validation successful", 
      data 
    });
  } catch (error) {
    return res.status(400).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * NEW: Validate multiple cell selections for bulk departure
 */
async function validateMultipleCells(req, res) {
  try {
    const { inventory_selections } = req.body;
    
    if (!inventory_selections || !Array.isArray(inventory_selections) || inventory_selections.length === 0) {
      return res.status(400).json({
        success: false,
        message: "inventory_selections array is required",
      });
    }
    
    const validations = [];
    for (const selection of inventory_selections) {
      try {
        const validation = await departureService.validateSelectedCell(
          selection.inventory_id,
          parseInt(selection.requested_qty), // ✅ FIXED: Use requested_qty not requested_quantity
          parseFloat(selection.requested_weight)
        );
        validations.push({ ...validation, valid: true });
      } catch (error) {
        validations.push({
          inventory_id: selection.inventory_id,
          valid: false,
          error: error.message,
        });
      }
    }
    
    const allValid = validations.every(v => v.valid);
    const totalQty = validations.filter(v => v.valid).reduce((sum, v) => sum + v.requested_qty, 0);
    const totalWeight = validations.filter(v => v.valid).reduce((sum, v) => sum + v.requested_weight, 0);
    
    return res.status(200).json({ 
      success: true,
      message: allValid ? "All cell validations successful" : "Some validations failed",
      all_valid: allValid,
      total_qty: totalQty,
      total_weight: totalWeight,
      validations 
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

// ✅ ENHANCED: Create new Departure Order with Spanish tracking
async function createDepartureOrder(req, res) {
  try {
    const departureData = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const files = req.files; // For multipart/form-data with file uploads

    console.log("📝 Creating departure order with potential documents...");
    console.log("Departure data:", departureData);
    console.log("Files received:", files ? files.length : 0);

    // ✅ SPANISH TRACKING: Inicio de creación de orden
    await req.logEvent(
      'CREACION_ORDEN_SALIDA_INICIADA',
      'OrdenDeSalida',
      'NUEVA_ORDEN_SALIDA',
      `Iniciando creación de nueva orden de salida para ${departureData.client_id ? 'cliente' : 'customer'}: ${departureData.client_id || departureData.customer_id}`,
      null,
      {
        cliente_id: departureData.client_id,
        customer_id: departureData.customer_id,
        almacen_id: departureData.warehouse_id,
        fecha_salida: departureData.departure_date_time,
        tipo_transporte: departureData.transport_type,
        destino: departureData.destination_point,
        creado_por: userId,
        rol_creador: userRole,
        timestamp_creacion: new Date().toISOString(),
        cantidad_productos: departureData.products ? departureData.products.length : 0,
        tiene_instrucciones_especiales: !!departureData.special_handling,
        tiene_requerimientos_temperatura: !!departureData.temperature_requirement,
        peso_total_estimado: departureData.total_weight,
        volumen_total_estimado: departureData.total_volume,
        // ✅ NUEVO: Seguimiento de flujo de aprobación
        tipo_workflow: 'REQUIERE_APROBACION',
        estado_inicial: 'PENDIENTE',
        campos_obligatorios_provistos: {
          numero_orden_salida: !!departureData.departure_order_no,
          numero_documento_despacho: !!departureData.dispatch_document_number,
          tipos_documento: !!departureData.document_type_ids,
          documentos_subidos: !!departureData.uploaded_documents,
          cantidad_pallets: !!departureData.total_pallets,
        }
      },
      { tipo_operacion: 'GESTION_ORDEN_SALIDA', tipo_accion: 'INICIO_CREACION' }
    );

    const result = await departureService.createDepartureOrder(departureData);

    // ✅ NEW: If files are uploaded, process document uploads
    if (files && files.length > 0 && result.departure_order) {
      console.log(`📎 Processing ${files.length} document uploads for departure order ${result.departure_order.departure_order_id}`);
      
      const { uploadDocument, validateFile } = require("../../utils/supabase");
      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();
      // Parse document types if it's a string
      let documentTypes = departureData.document_types || [];
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
          'departure-order',
          result.departure_order.departure_order_id,
          documentType,
          userId
        );

        uploadResults.push({
          filename: file.originalname,
          ...uploadResult
        });
      }

      // Update departure order with document information
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

        // Update departure order with documents
        await prisma.departureOrder.update({
          where: { departure_order_id: result.departure_order.departure_order_id },
          data: {
            uploaded_documents: documentMetadata
          }
        });

        // Log document upload activity
        await req.logEvent(
          'DOCUMENTOS_SUBIDOS_CREACION_ORDEN_SALIDA',
          'OrdenDeSalida',
          result.departure_order.departure_order_id,
          `Se subieron ${successfulUploads.length} documentos durante la creación de la orden de salida ${result.departure_order.departure_order_no}`,
          null,
          {
            orden_salida_id: result.departure_order.departure_order_id,
            orden_salida_no: result.departure_order.departure_order_no,
            documentos_subidos: successfulUploads.length,
            tipos_documento: documentMetadata.map(d => d.document_type),
            usuario_id: userId
          }
        );
      }

      // Add upload results to response
      result.document_uploads = {
        total_files: files.length,
        successful_uploads: successfulUploads.length,
        failed_uploads: uploadResults.filter(r => !r.success).length,
        upload_details: uploadResults
      };
    }

    // ✅ SPANISH TRACKING: Orden creada exitosamente
    await req.logEvent(
      'ORDEN_SALIDA_CREADA',
      'OrdenDeSalida',
      result.departure_order.departure_order_id,
      `Orden de salida ${result.departure_order.departure_order_no} creada exitosamente - pendiente de aprobación`,
      null,
      {
        orden_salida_id: result.departure_order.departure_order_id,
        numero_orden_salida: result.departure_order.departure_order_no,
        cliente_id: result.departure_order.client_id,
        customer_id: result.departure_order.customer_id,
        almacen_id: result.departure_order.warehouse_id,
        fecha_salida: result.departure_order.departure_date_time,
        tipo_transporte: result.departure_order.transport_type,
        destino: result.departure_order.destination_point,
        estado: result.departure_order.order_status,
        estado_revision: result.departure_order.review_status,
        estado_despacho: result.departure_order.dispatch_status,
        creado_por: userId,
        rol_creador: userRole,
        fecha_creacion: result.departure_order.registration_date,
        productos_definidos: result.departure_products ? result.departure_products.length : 0,
        peso_total: result.departure_order.total_weight,
        volumen_total: result.departure_order.total_volume,
        total_pallets: result.departure_order.total_pallets,
        // ✅ NUEVO: Seguimiento de workflow y campos obligatorios
        estado_workflow: result.departure_order.workflow_status,
        campos_obligatorios_capturados: result.departure_order.mandatory_fields_captured,
        proximos_pasos: result.next_steps,
        workflow_aprobacion: result.approval_workflow,
        impacto_negocio: 'ORDEN_SALIDA_PENDIENTE_APROBACION'
      },
      { 
        tipo_operacion: 'GESTION_ORDEN_SALIDA', 
        tipo_accion: 'CREACION_EXITOSA',
        impacto_negocio: 'ORDEN_SALIDA_ESPERANDO_APROBACION',
        proximos_pasos: 'REQUIERE_APROBACION_ENCARGADO_ALMACEN_O_ADMIN'
      }
    );

    // ✅ SPANISH TRACKING: Productos registrados en orden
    if (result.departure_products && result.departure_products.length > 0) {
      await req.logEvent(
        'PRODUCTOS_REGISTRADOS_ORDEN',
        'ProductosOrdenSalida',
        result.departure_order.departure_order_id,
        `${result.departure_products.length} productos registrados en orden de salida`,
        null,
        {
          orden_salida_id: result.departure_order.departure_order_id,
          numero_orden: result.departure_order.departure_order_no,
          productos_registrados: result.departure_products.map(product => ({
            producto_id: product.product_id,
            codigo_producto: product.product?.product_code,
            nombre_producto: product.product?.name,
            cantidad_solicitada: product.requested_quantity,
            peso_solicitado: product.requested_weight,
            tipo_empaque: product.packaging_type,
            numero_lote: product.lot_number,
            orden_entrada_numero: product.entry_order_number
          })),
          resumen_productos: {
            total_productos: result.departure_products.length,
            cantidad_total_solicitada: result.departure_products.reduce((sum, p) => sum + p.requested_quantity, 0),
            peso_total_solicitado: result.departure_products.reduce((sum, p) => sum + parseFloat(p.requested_weight || 0), 0)
          }
        },
        { 
          tipo_operacion: 'GESTION_PRODUCTOS_ORDEN', 
          tipo_accion: 'PRODUCTOS_REGISTRADOS',
          impacto_negocio: 'PRODUCTOS_ASOCIADOS_ORDEN'
        }
      );
    }

    // ✅ SPANISH TRACKING: Documentación de orden
    await req.logEvent(
      'DOCUMENTACION_ORDEN_REGISTRADA',
      'DocumentacionOrden',
      result.departure_order.departure_order_id,
      `Documentación y datos obligatorios registrados para orden de salida`,
      null,
      {
        orden_salida_id: result.departure_order.departure_order_id,
        numero_orden: result.departure_order.departure_order_no,
        documentacion: {
          numero_documento_despacho: departureData.dispatch_document_number,
          tipos_documento_seleccionados: departureData.document_type_ids,
          documentos_adjuntos: !!departureData.uploaded_documents,
          observaciones: departureData.observation
        },
        datos_transporte: {
          tipo_transporte: departureData.transport_type,
          transportista: departureData.carrier_name,
          punto_destino: departureData.destination_point
        },
        datos_empaque: {
          total_pallets: departureData.total_pallets,
          peso_estimado: departureData.total_weight,
          volumen_estimado: departureData.total_volume
        }
      },
      { 
        tipo_operacion: 'DOCUMENTACION_ORDEN', 
        tipo_accion: 'DOCUMENTACION_CAPTURADA',
        impacto_negocio: 'DOCUMENTACION_COMPLETA'
      }
    );

    return res.status(201).json(result);
  } catch (error) {
    console.error("Error creating departure order:", error);
    
    // ✅ SPANISH TRACKING: Error en creación de orden
    await req.logEvent(
      'ERROR_CREACION_ORDEN_SALIDA',
      'OrdenDeSalida',
      'ERROR_CREACION',
      `Error durante creación de orden de salida: ${error.message}`,
      null,
      {
        datos_orden: {
          cliente_id: req.body.client_id,
          customer_id: req.body.customer_id,
          almacen_id: req.body.warehouse_id,
          fecha_salida: req.body.departure_date_time,
          tipo_transporte: req.body.transport_type,
          destino: req.body.destination_point,
          cantidad_productos: req.body.products ? req.body.products.length : 0
        },
        usuario_id: req.user?.id,
        rol_usuario: req.user?.role,
        tipo_error: error.name || 'Error',
        mensaje_error: error.message,
        fecha_error: new Date().toISOString(),
        contexto_error: 'CREACION_ORDEN_SALIDA_FALLIDA'
      },
      { 
        tipo_operacion: 'GESTION_ORDEN_SALIDA', 
        tipo_accion: 'ERROR_CREACION',
        impacto_negocio: 'CREACION_ORDEN_FALLIDA'
      }
    );
    
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * ✅ ENHANCED: Approve departure order with Spanish tracking
 */
async function approveDepartureOrder(req, res) {
  try {
    const { departureOrderId } = req.params;
    const { comments } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!departureOrderId) {
      return res.status(400).json({
        success: false,
        message: "Departure Order ID is required",
      });
    }

    // ✅ ROLE VALIDATION: Only WAREHOUSE_INCHARGE and ADMIN can approve
    if (!['WAREHOUSE_INCHARGE', 'ADMIN'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only warehouse incharge or admin can approve departure orders',
        user_role: userRole,
        required_roles: ['WAREHOUSE_INCHARGE', 'ADMIN']
      });
    }

    // ✅ SPANISH TRACKING: Inicio de proceso de aprobación
    await req.logEvent(
      'PROCESO_APROBACION_INICIADO',
      'OrdenDeSalida',
      departureOrderId,
      `Iniciando proceso de aprobación de orden de salida por ${userRole}`,
      null,
      {
        orden_salida_id: departureOrderId,
        aprobador: userId,
        rol_aprobador: userRole,
        comentarios_aprobacion: comments || 'Sin comentarios adicionales',
        fecha_inicio_aprobacion: new Date().toISOString()
      },
      { 
        tipo_operacion: 'FLUJO_APROBACION', 
        tipo_accion: 'INICIO_APROBACION',
        impacto_negocio: 'PROCESO_APROBACION_INICIADO'
      }
    );
    
    const result = await departureService.approveDepartureOrder(departureOrderId, userId, userRole, comments);
    
    // ✅ SPANISH TRACKING: Orden aprobada exitosamente
    await req.logEvent(
      'ORDEN_SALIDA_APROBADA',
      'OrdenDeSalida',
      departureOrderId,
      `Orden de salida ${result.departure_order.departure_order_no} aprobada exitosamente por ${userRole}`,
      null,
      {
        orden_salida_id: departureOrderId,
        numero_orden_salida: result.departure_order.departure_order_no,
        aprobado_por: userId,
        rol_aprobador: userRole,
        fecha_aprobacion: result.approved_at,
        comentarios_aprobacion: comments,
        estado_anterior: 'PENDIENTE',
        estado_nuevo: 'APROBADO',
        proximos_pasos: 'LISTA_PARA_ASIGNACION_INVENTARIO_Y_DESPACHO'
      },
      { 
        tipo_operacion: 'FLUJO_APROBACION', 
        tipo_accion: 'APROBACION_EXITOSA',
        impacto_negocio: 'ORDEN_APROBADA_LISTA_DESPACHO',
        proximos_pasos: 'ASIGNACION_INVENTARIO_Y_DESPACHO_DISPONIBLE'
      }
    );

    // ✅ SPANISH TRACKING: Cambio de estado de workflow
    await req.logEvent(
      'CAMBIO_ESTADO_WORKFLOW',
      'WorkflowOrdenSalida',
      departureOrderId,
      `Estado de workflow cambiado: PENDIENTE → APROBADO`,
      null,
      {
        orden_salida_id: departureOrderId,
        numero_orden: result.departure_order.departure_order_no,
        flujo_workflow: {
          estado_anterior: 'PENDIENTE',
          estado_nuevo: 'APROBADO',
          accion_ejecutada: 'APROBACION',
          autorizado_por: userId,
          rol_autorizador: userRole
        },
        impacto_operacional: {
          puede_asignar_inventario: true,
          puede_despachar: true,
          requiere_autorizacion_adicional: false
        }
      },
      { 
        tipo_operacion: 'GESTION_WORKFLOW', 
        tipo_accion: 'CAMBIO_ESTADO',
        impacto_negocio: 'WORKFLOW_PROGRESADO'
      }
    );
    
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error approving departure order:", error);

    // ✅ SPANISH TRACKING: Error en aprobación
    await req.logEvent(
      'ERROR_APROBACION_ORDEN',
      'OrdenDeSalida',
      req.params.departureOrderId,
      `Error durante aprobación de orden de salida: ${error.message}`,
      null,
      {
        orden_salida_id: req.params.departureOrderId,
        usuario_aprobador: req.user?.id,
        rol_usuario: req.user?.role,
        comentarios_intento: req.body.comments,
        tipo_error: error.name || 'Error',
        mensaje_error: error.message,
        fecha_error: new Date().toISOString()
      },
      { 
        tipo_operacion: 'FLUJO_APROBACION', 
        tipo_accion: 'ERROR_APROBACION',
        impacto_negocio: 'APROBACION_FALLIDA'
      }
    );

    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * ✅ ENHANCED: Reject departure order with Spanish tracking
 */
async function rejectDepartureOrder(req, res) {
  try {
    const { departureOrderId } = req.params;
    const { comments } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!departureOrderId) {
      return res.status(400).json({
        success: false,
        message: "Departure Order ID is required",
      });
    }
    
    if (!comments || comments.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Rejection comments are required",
      });
    }

    // ✅ ROLE VALIDATION: Only WAREHOUSE_INCHARGE and ADMIN can reject
    if (!['WAREHOUSE_INCHARGE', 'ADMIN'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only warehouse incharge or admin can reject departure orders',
        user_role: userRole,
        required_roles: ['WAREHOUSE_INCHARGE', 'ADMIN']
      });
    }

    // ✅ SPANISH TRACKING: Inicio de proceso de rechazo
    await req.logEvent(
      'PROCESO_RECHAZO_INICIADO',
      'OrdenDeSalida',
      departureOrderId,
      `Iniciando proceso de rechazo de orden de salida por ${userRole}`,
      null,
      {
        orden_salida_id: departureOrderId,
        rechazado_por: userId,
        rol_rechazador: userRole,
        motivo_rechazo: comments,
        fecha_inicio_rechazo: new Date().toISOString()
      },
      { 
        tipo_operacion: 'FLUJO_APROBACION', 
        tipo_accion: 'INICIO_RECHAZO',
        impacto_negocio: 'PROCESO_RECHAZO_INICIADO'
      }
    );
    
    const result = await departureService.rejectDepartureOrder(departureOrderId, userId, userRole, comments);
    
    // ✅ SPANISH TRACKING: Orden rechazada
    await req.logEvent(
      'ORDEN_SALIDA_RECHAZADA',
      'OrdenDeSalida',
      departureOrderId,
      `Orden de salida ${result.departure_order.departure_order_no} rechazada por ${userRole}`,
      null,
      {
        orden_salida_id: departureOrderId,
        numero_orden_salida: result.departure_order.departure_order_no,
        rechazado_por: userId,
        rol_rechazador: userRole,
        fecha_rechazo: result.rejected_at,
        motivo_rechazo: comments,
        estado_anterior: 'PENDIENTE',
        estado_nuevo: 'RECHAZADO',
        impacto_operacional: 'ORDEN_CANCELADA'
      },
      { 
        tipo_operacion: 'FLUJO_APROBACION', 
        tipo_accion: 'RECHAZO_COMPLETADO',
        impacto_negocio: 'ORDEN_RECHAZADA',
        proximos_pasos: 'CREADOR_ORDEN_NOTIFICADO_RECHAZO'
      }
    );

    // ✅ SPANISH TRACKING: Notificación al creador
    await req.logEvent(
      'NOTIFICACION_RECHAZO_ENVIADA',
      'NotificacionOrden',
      departureOrderId,
      `Notificación de rechazo enviada al creador de la orden`,
      null,
      {
        orden_salida_id: departureOrderId,
        numero_orden: result.departure_order.departure_order_no,
        notificacion: {
          tipo: 'RECHAZO_ORDEN',
          destinatario_rol: 'CREADOR_ORDEN',
          motivo_rechazo: comments,
          accion_requerida: 'REVISAR_Y_CREAR_NUEVA_ORDEN',
          rechazado_por: userRole
        }
      },
      { 
        tipo_operacion: 'NOTIFICACIONES', 
        tipo_accion: 'NOTIFICACION_ENVIADA',
        impacto_negocio: 'COMUNICACION_RECHAZO'
      }
    );
    
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error rejecting departure order:", error);

    // ✅ SPANISH TRACKING: Error en rechazo
    await req.logEvent(
      'ERROR_RECHAZO_ORDEN',
      'OrdenDeSalida',
      req.params.departureOrderId,
      `Error durante rechazo de orden de salida: ${error.message}`,
      null,
      {
        orden_salida_id: req.params.departureOrderId,
        usuario_rechazador: req.user?.id,
        rol_usuario: req.user?.role,
        motivo_rechazo_intento: req.body.comments,
        tipo_error: error.name || 'Error',
        mensaje_error: error.message,
        fecha_error: new Date().toISOString()
      },
      { 
        tipo_operacion: 'FLUJO_APROBACION', 
        tipo_accion: 'ERROR_RECHAZO',
        impacto_negocio: 'RECHAZO_FALLIDO'
      }
    );

    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * ✅ ENHANCED: Request revision for departure order with Spanish tracking
 */
async function requestRevisionDepartureOrder(req, res) {
  try {
    const { departureOrderId } = req.params;
    const { comments } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!departureOrderId) {
      return res.status(400).json({
        success: false,
        message: "Departure Order ID is required",
      });
    }
    
    if (!comments || comments.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Revision comments are required",
      });
    }

    // ✅ ROLE VALIDATION: Only WAREHOUSE_INCHARGE and ADMIN can request revision
    if (!['WAREHOUSE_INCHARGE', 'ADMIN'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only warehouse incharge or admin can request revisions',
        user_role: userRole,
        required_roles: ['WAREHOUSE_INCHARGE', 'ADMIN']
      });
    }

    // ✅ SPANISH TRACKING: Inicio de solicitud de revisión
    await req.logEvent(
      'SOLICITUD_REVISION_INICIADA',
      'OrdenDeSalida',
      departureOrderId,
      `Iniciando solicitud de revisión de orden de salida por ${userRole}`,
      null,
      {
        orden_salida_id: departureOrderId,
        solicitado_por: userId,
        rol_solicitante: userRole,
        comentarios_revision: comments,
        fecha_solicitud: new Date().toISOString()
      },
      { 
        tipo_operacion: 'FLUJO_APROBACION', 
        tipo_accion: 'INICIO_SOLICITUD_REVISION',
        impacto_negocio: 'PROCESO_REVISION_INICIADO'
      }
    );
    
    const result = await departureService.requestRevisionDepartureOrder(departureOrderId, userId, userRole, comments);
    
    // ✅ SPANISH TRACKING: Revisión solicitada exitosamente
    await req.logEvent(
      'REVISION_ORDEN_SOLICITADA',
      'OrdenDeSalida',
      departureOrderId,
      `Revisión solicitada para orden de salida ${result.departure_order.departure_order_no} por ${userRole}`,
      null,
      {
        orden_salida_id: departureOrderId,
        numero_orden_salida: result.departure_order.departure_order_no,
        solicitado_por: userId,
        rol_solicitante: userRole,
        fecha_solicitud: result.requested_at,
        notas_revision: comments,
        estado_anterior: 'PENDIENTE',
        estado_nuevo: 'REVISION',
        accion_disponible: 'EDITAR_Y_REENVIAR'
      },
      { 
        tipo_operacion: 'FLUJO_APROBACION', 
        tipo_accion: 'REVISION_SOLICITADA',
        impacto_negocio: 'ORDEN_REQUIERE_REVISION',
        proximos_pasos: 'CREADOR_PUEDE_EDITAR_Y_REENVIAR'
      }
    );

    // ✅ SPANISH TRACKING: Habilitación de edición
    await req.logEvent(
      'EDICION_ORDEN_HABILITADA',
      'PermisoOrden',
      departureOrderId,
      `Orden habilitada para edición tras solicitud de revisión`,
      null,
      {
        orden_salida_id: departureOrderId,
        numero_orden: result.departure_order.departure_order_no,
        permisos_habilitados: {
          puede_editar: true,
          puede_reenviar: true,
          puede_cancelar: true
        },
        revision_solicitada_por: userId,
        comentarios_para_revision: comments,
        tiempo_limite_revision: null // Sin límite de tiempo definido
      },
      { 
        tipo_operacion: 'GESTION_PERMISOS', 
        tipo_accion: 'PERMISOS_EDICION_HABILITADOS',
        impacto_negocio: 'ORDEN_EDITABLE'
      }
    );
    
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error requesting revision for departure order:", error);

    // ✅ SPANISH TRACKING: Error en solicitud de revisión
    await req.logEvent(
      'ERROR_SOLICITUD_REVISION',
      'OrdenDeSalida',
      req.params.departureOrderId,
      `Error durante solicitud de revisión: ${error.message}`,
      null,
      {
        orden_salida_id: req.params.departureOrderId,
        usuario_solicitante: req.user?.id,
        rol_usuario: req.user?.role,
        comentarios_revision: req.body.comments,
        tipo_error: error.name || 'Error',
        mensaje_error: error.message,
        fecha_error: new Date().toISOString()
      },
      { 
        tipo_operacion: 'FLUJO_APROBACION', 
        tipo_accion: 'ERROR_SOLICITUD_REVISION',
        impacto_negocio: 'SOLICITUD_REVISION_FALLIDA'
      }
    );

    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * ✅ NEW: Dispatch approved departure order (WAREHOUSE_INCHARGE/ADMIN only)
 */
async function dispatchDepartureOrder(req, res) {
  try {
    const { departureOrderId } = req.params;
    const dispatchData = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!departureOrderId) {
      return res.status(400).json({
        success: false,
        message: "Departure Order ID is required",
      });
    }
    
    const result = await departureService.dispatchDepartureOrder(departureOrderId, userId, userRole, dispatchData);
    
    // ✅ LOG: Departure order dispatch
    await req.logEvent(
      'DEPARTURE_ORDER_DISPATCHED',
      'DepartureOrder',
      departureOrderId,
      `Departure order ${result.departure_order.departure_order_no} dispatched by ${userRole}`,
      null,
      {
        departure_order_id: departureOrderId,
        departure_order_no: result.departure_order.departure_order_no,
        dispatched_by: userId,
        dispatcher_role: userRole,
        dispatched_at: result.dispatched_at,
        dispatch_notes: dispatchData.dispatch_notes,
        previous_status: 'APPROVED',
        new_status: 'DISPATCHED',
        inventory_cells_affected: result.dispatch_result.totals.cells_affected,
        total_quantity_dispatched: result.dispatch_result.totals.total_qty,
        total_weight_dispatched: result.dispatch_result.totals.total_weight,
        cells_depleted: result.dispatch_result.totals.cells_depleted,
        business_impact: 'DEPARTURE_ORDER_DISPATCHED_FROM_WAREHOUSE'
      },
      { 
        operation_type: 'DEPARTURE_ORDER_DISPATCH', 
        action_type: 'DISPATCH_SUCCESS',
        business_impact: 'INVENTORY_REMOVED_FROM_WAREHOUSE',
        next_steps: 'DEPARTURE_ORDER_COMPLETED'
      }
    );
    
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error dispatching departure order:", error);
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * ✅ NEW: Batch dispatch multiple departure orders (WAREHOUSE_INCHARGE/ADMIN only)
 */
async function batchDispatchDepartureOrders(req, res) {
  try {
    const { departure_order_ids, batch_dispatch_data } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!departure_order_ids || !Array.isArray(departure_order_ids) || departure_order_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "departure_order_ids array is required",
      });
    }
    
    const result = await departureService.batchDispatchDepartureOrders(departure_order_ids, userId, userRole, batch_dispatch_data);
    
    // ✅ LOG: Batch departure order dispatch
    await req.logEvent(
      'DEPARTURE_ORDERS_BATCH_DISPATCHED',
      'DepartureOrder',
      'BATCH_DISPATCH',
      `Batch dispatch of ${departure_order_ids.length} departure orders by ${userRole}`,
      null,
      {
        departure_order_ids: departure_order_ids,
        dispatched_by: userId,
        dispatcher_role: userRole,
        dispatched_at: result.dispatched_at,
        total_processed: result.total_processed,
        successful_dispatches: result.successful_dispatches.length,
        failed_dispatches: result.failed_dispatches.length,
        business_impact: 'MULTIPLE_DEPARTURE_ORDERS_DISPATCHED'
      },
      { 
        operation_type: 'DEPARTURE_ORDER_DISPATCH', 
        action_type: 'BATCH_DISPATCH',
        business_impact: 'BULK_INVENTORY_REMOVAL',
        next_steps: 'BATCH_DEPARTURE_COMPLETED'
      }
    );
    
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error batch dispatching departure orders:", error);
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * NEW: Get departure order details by ID
 */
async function getDepartureOrderById(req, res) {
  try {
    const { departureOrderId } = req.params;
    
    if (!departureOrderId) {
      return res.status(400).json({
        success: false,
        message: "Departure Order ID is required",
      });
    }
    
    const data = await departureService.getDepartureOrderById(departureOrderId);
    
    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Departure order not found",
      });
    }
    
    return res.status(200).json({ 
      success: true,
      message: "Departure order details fetched successfully", 
      data 
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * ✅ NEW: Get departure inventory summary by warehouse
 */
async function getDepartureInventorySummary(req, res) {
  try {
    const { warehouseId } = req.query;
    
    const data = await departureService.getDepartureInventorySummary(warehouseId || null);
    
    return res.status(200).json({ 
      success: true,
      message: "Departure inventory summary fetched successfully", 
      ...data
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * ✅ NEW: Get FIFO locations for a specific product
 */
async function getFifoLocationsForProduct(req, res) {
  try {
    const { productId } = req.params;
    const { warehouseId } = req.query;
    
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }
    
    const data = await departureService.getFifoLocationsForProduct(productId, warehouseId || null);
    
    return res.status(200).json({ 
      success: true,
      message: "EXPIRY-BASED FIFO locations for product fetched successfully", 
      count: data.length,
      product_id: productId,
      fifo_method: "EXPIRY_DATE_PRIORITY",
      data 
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * ✅ NEW: Get suggested FIFO allocation for a product with requested quantity
 */
async function getSuggestedFifoAllocation(req, res) {
  try {
    const { productId } = req.params;
    const { requestedQuantity, requestedWeight, warehouseId } = req.query;
    
    if (!productId || !requestedQuantity) {
      return res.status(400).json({
        success: false,
        message: "Product ID and requested quantity are required",
      });
    }
    
    const data = await departureService.getSuggestedFifoAllocation(
      productId, 
      parseInt(requestedQuantity),
      requestedWeight ? parseFloat(requestedWeight) : null,
      warehouseId || null
    );
    
    return res.status(200).json({ 
      success: true,
      message: "EXPIRY-BASED FIFO allocation suggestion generated successfully", 
      fifo_method: "EXPIRY_DATE_PRIORITY",
      data 
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * ✅ NEW: Get next departure order number
 */
async function getCurrentDepartureOrderNo(req, res) {
  try {
    const nextOrderNo = await departureService.getCurrentDepartureOrderNo();
    
    return res.status(200).json({ 
      success: true,
      message: "Next departure order number generated successfully", 
      departure_order_no: nextOrderNo
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * ✅ NEW: Get permissions for a specific role
 */
async function getDeparturePermissions(req, res) {
  try {
    const { role } = req.query;
    
    if (!role) {
      return res.status(400).json({
        success: false,
        message: "Role parameter is required",
      });
    }

    // Define permissions based on role
    const permissions = {
      CLIENT: {
        can_create: true,
        can_view_own: true,
        can_view_all: false,
        can_edit: true, // Only in REVISION status
        can_approve: false,
        can_reject: false,
        can_request_revision: false,
        can_dispatch: false,
        can_batch_dispatch: false,
        can_view_all_inventory: false,
        allowed_statuses: ['PENDING', 'REVISION', 'APPROVED', 'REJECTED', 'DISPATCHED'],
        workflow_actions: ['CREATE', 'EDIT_REVISION']
      },
      WAREHOUSE_INCHARGE: {
        can_create: true,
        can_view_own: true,
        can_view_all: true,
        can_edit: true,
        can_approve: true,
        can_reject: true,
        can_request_revision: true,
        can_dispatch: true,
        can_batch_dispatch: true,
        can_view_all_inventory: true,
        allowed_statuses: ['PENDING', 'REVISION', 'APPROVED', 'REJECTED', 'DISPATCHED'],
        workflow_actions: ['CREATE', 'EDIT', 'APPROVE', 'REJECT', 'REQUEST_REVISION', 'DISPATCH', 'BATCH_DISPATCH']
      },
      ADMIN: {
        can_create: true,
        can_view_own: true,
        can_view_all: true,
        can_edit: true,
        can_approve: true,
        can_reject: true,
        can_request_revision: true,
        can_dispatch: true,
        can_batch_dispatch: true,
        can_view_all_inventory: true,
        allowed_statuses: ['PENDING', 'REVISION', 'APPROVED', 'REJECTED', 'DISPATCHED'],
        workflow_actions: ['CREATE', 'EDIT', 'APPROVE', 'REJECT', 'REQUEST_REVISION', 'DISPATCH', 'BATCH_DISPATCH']
      }
    };

    const rolePermissions = permissions[role];
    
    if (!rolePermissions) {
      return res.status(400).json({
        success: false,
        message: `Invalid role: ${role}. Valid roles are: CLIENT, WAREHOUSE_INCHARGE, ADMIN`,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Permissions for role ${role} retrieved successfully`,
      role: role,
      permissions: rolePermissions,
      workflow_info: {
        status_flow: "PENDIENTE → APROBADO/REVISION/RECHAZADO → DESPACHO → COMPLETADO",
        approval_required_roles: ["WAREHOUSE_INCHARGE", "ADMIN"],
        dispatch_required_roles: ["WAREHOUSE_INCHARGE", "ADMIN"],
        fifo_method: "EXPIRY_DATE_PRIORITY"
      }
    });
  } catch (error) {
    console.error("Error in getDeparturePermissions:", error);
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * ✅ NEW: Get expiry urgency dashboard for departure planning
 */
async function getExpiryUrgencyDashboard(req, res) {
  try {
    const { warehouseId } = req.query;
    
    const data = await departureService.getExpiryUrgencyDashboard(warehouseId || null);
    
    return res.status(200).json(data);
  } catch (error) {
    console.error("Error in getExpiryUrgencyDashboard:", error);
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

// ✅ NEW: Create comprehensive departure order
async function createComprehensiveDepartureOrder(req, res) {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const organisationId = req.user?.organisation_id;
    
    // Validate required fields
    const requiredFields = ['organisation_id', 'created_by'];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({
          success: false,
          message: `Missing required field: ${field}`,
          error: `${field} is required for comprehensive departure order creation`
        });
      }
    }

    // Ensure user can only create orders for their organisation
    if (req.body.organisation_id !== organisationId) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Cannot create departure order for different organisation",
        error: "Organisation mismatch"
      });
    }

    // Ensure created_by matches authenticated user
    if (req.body.created_by !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Cannot create departure order on behalf of another user",
        error: "User ID mismatch"
      });
    }

    // Validate products array
    if (!req.body.products || !Array.isArray(req.body.products) || req.body.products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one product is required for comprehensive departure order",
        error: "Products array is empty or invalid"
      });
    }

    // Role-based access control
    const allowedRoles = ['CLIENT', 'WAREHOUSE_INCHARGE', 'ADMIN'];
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Insufficient permissions to create departure orders",
        error: `Role ${userRole} is not authorized for departure order creation`
      });
    }

    // ✅ Special handling for CLIENT role - validate client_id matches authenticated user
    if (userRole === 'CLIENT') {
      try {
        // Get the client associated with this authenticated user from JWT
        const clientIdFromToken = req.user?.client_id;

        if (!clientIdFromToken) {
          return res.status(403).json({
            success: false,
            message: "Client account not found for this user",
            error: "User is not associated with any client account"
          });
        }

        // If client_id is provided in request, validate it matches the user's client
        if (req.body.client_id) {
          if (req.body.client_id !== clientIdFromToken) {
            return res.status(403).json({
              success: false,
              message: "Access denied: Cannot create orders for different client",
              error: "Provided client_id does not match user's client account"
            });
          }
          // client_id is valid, continue
        } else {
          // If no client_id provided, auto-populate from JWT token
          req.body.client_id = clientIdFromToken;
          console.log(`✅ Auto-assigned client_id from JWT: ${clientIdFromToken}`);
        }
        
      } catch (error) {
        console.error("Error mapping client user to client_id:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to process client information",
          error: error.message
        });
      }
    }

    // Call service to create comprehensive departure order
    const result = await departureService.createComprehensiveDepartureOrder(req.body);

    // Success response
    res.status(201).json({
      success: true,
      message: "Comprehensive departure order created successfully",
      data: result,
      metadata: {
        created_by: userId,
        user_role: userRole,
        organisation_id: organisationId,
        creation_timestamp: new Date().toISOString(),
        api_endpoint: '/departure/comprehensive-orders',
        request_method: 'POST'
      }
    });

  } catch (error) {
    console.error("Error creating comprehensive departure order:", error);
    
    // Handle specific error types
    if (error.message.includes('Product with ID') && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: "Product validation failed",
        error: error.message
      });
    }

    if (error.message.includes('Unique constraint failed')) {
      return res.status(409).json({
        success: false,
        message: "Departure order number already exists",
        error: "Please try again with a different order number"
      });
    }

    if (error.message.includes('Foreign key constraint failed')) {
      return res.status(400).json({
        success: false,
        message: "Invalid reference data provided",
        error: "One or more referenced entities (warehouse, customer, etc.) do not exist"
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      message: "Failed to create comprehensive departure order",
      error: error.message || "Internal server error"
    });
  }
}

// ✅ NEW: Get comprehensive departure orders
async function getComprehensiveDepartureOrders(req, res) {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const organisationId = req.user?.organisation_id;
    
    // Extract query parameters
    const {
      organisationId: queryOrgId,
      status,
      startDate,
      endDate,
      warehouseId,
      clientId,
      page = 1,
      limit = 50
    } = req.query;

    // Use organisation from query or user's organisation
    const targetOrgId = queryOrgId || organisationId;

    // Validate organisation access
    if (queryOrgId && queryOrgId !== organisationId) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Cannot access departure orders for different organisation",
        error: "Organisation mismatch"
      });
    }

    // Build filters
    const filters = {};
    if (status) filters.status = status;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (warehouseId) filters.warehouseId = warehouseId;
    if (clientId) filters.clientId = clientId;

    // Call service to get comprehensive departure orders
    const result = await departureService.getComprehensiveDepartureOrders(
      targetOrgId,
      userRole,
      userId,
      filters
    );

    // Apply pagination if needed
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedData = result.data.slice(startIndex, endIndex);

    // Success response
    res.status(200).json({
      success: true,
      message: "Comprehensive departure orders retrieved successfully",
      data: paginatedData,
      summary: result.summary,
      filters_applied: result.filters_applied,
      pagination: {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total_items: result.data.length,
        total_pages: Math.ceil(result.data.length / parseInt(limit)),
        has_next_page: endIndex < result.data.length,
        has_previous_page: parseInt(page) > 1,
      },
      metadata: {
        user_role: userRole,
        organisation_id: targetOrgId,
        request_timestamp: new Date().toISOString(),
        api_endpoint: '/departure/comprehensive-orders',
        request_method: 'GET'
      }
    });

  } catch (error) {
    console.error("Error getting comprehensive departure orders:", error);
    
    // Handle specific error types
    if (error.message.includes('Invalid organisation')) {
      return res.status(400).json({
        success: false,
        message: "Invalid organisation ID provided",
        error: error.message
      });
    }

    if (error.message.includes('Access denied')) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
        error: error.message
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      message: "Failed to retrieve comprehensive departure orders",
      error: error.message || "Internal server error"
    });
  }
}

// ✅ NEW: Get comprehensive departure order by order number
async function getComprehensiveDepartureOrderByNumber(req, res) {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const organisationId = req.user?.organisation_id;
    
    const { orderNumber } = req.params;

    if (!orderNumber) {
      return res.status(400).json({
        success: false,
        message: "Order number is required",
        error: "Missing order number parameter"
      });
    }

    // Call service to get comprehensive departure order by number
    const result = await departureService.getComprehensiveDepartureOrderByNumber(
      orderNumber,
      userRole,
      userId,
      organisationId
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Departure order not found",
        error: `No departure order found with number: ${orderNumber}`
      });
    }

    // Success response
    res.status(200).json({
      ...result,
      metadata: {
        user_role: userRole,
        organisation_id: organisationId,
        request_timestamp: new Date().toISOString(),
        api_endpoint: `/departure/comprehensive-orders/${orderNumber}`,
        request_method: 'GET',
        order_number: orderNumber
      }
    });

  } catch (error) {
    console.error("Error getting comprehensive departure order by number:", error);
    
    // Handle specific error types
    if (error.message.includes('Invalid order number')) {
      return res.status(400).json({
        success: false,
        message: "Invalid order number format",
        error: error.message
      });
    }

    if (error.message.includes('Access denied')) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
        error: error.message
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      message: "Failed to retrieve comprehensive departure order",
      error: error.message || "Internal server error"
    });
  }
}

// ✅ NEW: Get audit trail for departure order
async function getDepartureOrderAuditTrail(req, res) {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const organisationId = req.user?.organisation_id;
    
    const { departureOrderId } = req.params;

    if (!departureOrderId) {
      return res.status(400).json({
        success: false,
        message: "Departure order ID is required",
        error: "Missing departureOrderId parameter"
      });
    }

    // Call service to get audit trail
    const result = await departureService.getDepartureOrderAuditTrail(
      departureOrderId,
      userRole,
      userId,
      organisationId
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Departure order not found or access denied",
        error: `No departure order found with ID: ${departureOrderId} or insufficient permissions`
      });
    }

    // Success response
    res.status(200).json({
      ...result,
      metadata: {
        user_role: userRole,
        organisation_id: organisationId,
        request_timestamp: new Date().toISOString(),
        api_endpoint: `/departure/departure-orders/${departureOrderId}/audit-trail`,
        request_method: 'GET',
        departure_order_id: departureOrderId
      }
    });

  } catch (error) {
    console.error("Error getting departure order audit trail:", error);
    
    // Handle specific error types
    if (error.message.includes('Invalid departure order ID')) {
      return res.status(400).json({
        success: false,
        message: "Invalid departure order ID format",
        error: error.message
      });
    }

    if (error.message.includes('Access denied')) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
        error: error.message
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      message: "Failed to retrieve departure order audit trail",
      error: error.message || "Internal server error"
    });
  }
}

/**
 * ✅ NEW: Create departure allocations for a departure order
 */
async function createDepartureAllocations(req, res) {
  try {
    const { departureOrderId } = req.params;
    const allocationData = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!departureOrderId) {
      return res.status(400).json({
        success: false,
        message: "Departure Order ID is required",
      });
    }
    
    if (!allocationData.allocations || allocationData.allocations.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Allocation data is required",
      });
    }
    
    const result = await departureService.createDepartureAllocations(departureOrderId, allocationData, userId, userRole);
    
    // ✅ LOG: Departure allocation creation
    await req.logEvent(
      'DEPARTURE_ALLOCATED',
      'DepartureOrder',
      departureOrderId,
      `Departure order allocated with ${result.total_allocations} inventory allocations by ${userRole}`,
      null,
      {
        departure_order_id: departureOrderId,
        total_allocations: result.total_allocations,
        allocated_by: userId,
        allocator_role: userRole,
        allocated_at: result.allocated_at,
        business_impact: 'DEPARTURE_ORDER_READY_FOR_DISPATCH'
      },
      { 
        operation_type: 'DEPARTURE_ALLOCATION', 
        action_type: 'ALLOCATION_SUCCESS',
        business_impact: 'INVENTORY_ALLOCATED_FOR_DEPARTURE',
        next_steps: 'DISPATCH_AVAILABLE'
      }
    );
    
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error creating departure allocations:", error);
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * ✅ NEW: Get available inventory for departure allocation
 */
async function getAvailableInventoryForDeparture(req, res) {
  try {
    const { departureOrderId } = req.params;
    const userRole = req.user?.role;
    const userId = req.user?.id;
    
    if (!departureOrderId) {
      return res.status(400).json({
        success: false,
        message: "Departure Order ID is required",
      });
    }
    
    const data = await departureService.getAvailableInventoryForDeparture(departureOrderId, userRole, userId);
    
    return res.status(200).json(data);
  } catch (error) {
    console.error("Error getting available inventory for departure:", error);
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * ✅ ENHANCED: Auto-dispatch departure order with comprehensive Spanish tracking
 */
async function autoDispatchDepartureOrder(req, res) {
  try {
    const { departureOrderId } = req.params;
    const dispatchData = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!departureOrderId) {
      return res.status(400).json({
        success: false,
        message: "Departure Order ID is required",
      });
    }

    // ✅ SPANISH TRACKING: Inicio del proceso de despacho automático
    await req.logEvent(
      'DESPACHO_AUTOMATICO_INICIADO',
      'OrdenDeSalida',
      departureOrderId,
      `Iniciando despacho automático de orden de salida con lógica FIFO+Vencimiento por ${userRole}`,
      null,
      {
        orden_salida_id: departureOrderId,
        usuario_despachador: userId,
        rol_despachador: userRole,
        metodo_despacho: 'AUTO_FIFO_VENCIMIENTO',
        notas_despacho: dispatchData.dispatch_notes || 'Sin notas adicionales',
        fecha_inicio_proceso: new Date().toISOString()
      },
      { 
        tipo_operacion: 'DESPACHO_AUTOMATICO', 
        tipo_accion: 'INICIO_PROCESO',
        impacto_negocio: 'PROCESO_DESPACHO_INICIADO'
      }
    );
    
    const result = await departureService.autoDispatchDepartureOrder(departureOrderId, userId, userRole, dispatchData);
    
    // ✅ SPANISH TRACKING: Despacho automático exitoso
    await req.logEvent(
      'DESPACHO_AUTOMATICO_COMPLETADO',
      'OrdenDeSalida',
      departureOrderId,
      `Orden de salida despachada automáticamente con éxito usando lógica FIFO+Vencimiento por ${userRole}`,
      null,
      {
        orden_salida_id: departureOrderId,
        numero_orden_salida: result.departure_order?.departure_order_no,
        despachado_por: userId,
        rol_despachador: userRole,
        fecha_despacho: result.dispatched_at,
        metodo_despacho: 'AUTO_FIFO_VENCIMIENTO',
        celdas_procesadas: result.allocated_cells_dispatched,
        logica_fifo_aplicada: result.fifo_logic_applied,
        prioridad_vencimiento_aplicada: result.expiry_priority_applied,
        paso_asignacion_omitido: result.allocation_bypassed,
        resumen_despacho: {
          total_productos: result.dispatch_result?.totals?.total_qty || 0,
          peso_total: result.dispatch_result?.totals?.total_weight || 0,
          celdas_afectadas: result.dispatch_result?.totals?.cells_affected || 0,
          celdas_agotadas: result.dispatch_result?.totals?.cells_depleted || 0
        }
      },
      { 
        tipo_operacion: 'DESPACHO_AUTOMATICO', 
        tipo_accion: 'DESPACHO_EXITOSO',
        impacto_negocio: 'INVENTARIO_DESPACHADO_AUTOMATICAMENTE',
        metodo_fifo: 'PRIORIDAD_FECHA_VENCIMIENTO_CON_FECHA_ENTRADA_SECUNDARIA'
      }
    );

    // ✅ SPANISH TRACKING: Inventario actualizado
    await req.logEvent(
      'INVENTARIO_ACTUALIZADO_DESPACHO',
      'Inventario',
      departureOrderId,
      `Inventario actualizado tras despacho automático - ${result.dispatch_result?.totals?.cells_affected || 0} celdas procesadas`,
      null,
      {
        orden_salida_id: departureOrderId,
        numero_orden: result.departure_order?.departure_order_no,
        celdas_procesadas: result.dispatch_result?.cellAllocations?.map(cell => ({
          referencia_celda: cell.cell_reference,
          codigo_producto: cell.product_code,
          nombre_producto: cell.product_name,
          lote: cell.lot_series,
          cantidad_despachada: cell.dispatched_qty,
          peso_despachado: cell.dispatched_weight,
          celda_agotada: cell.cell_depleted,
          fecha_vencimiento: cell.expiration_date,
          numero_orden_entrada: cell.entry_order_no
        })) || [],
        resumen_inventario: {
          total_productos_removidos: result.dispatch_result?.totals?.total_qty || 0,
          peso_total_removido: result.dispatch_result?.totals?.total_weight || 0,
          celdas_completamente_vaciadas: result.dispatch_result?.totals?.cells_depleted || 0
        }
      },
      { 
        tipo_operacion: 'ACTUALIZACION_INVENTARIO', 
        tipo_accion: 'INVENTARIO_REDUCIDO',
        impacto_negocio: 'INVENTARIO_ACTUALIZADO_POR_DESPACHO'
      }
    );

    // ✅ SPANISH TRACKING: Proceso FIFO aplicado
    if (result.fifo_logic_applied) {
      await req.logEvent(
        'LOGICA_FIFO_APLICADA',
        'ProcesoInventario',
        departureOrderId,
        `Lógica FIFO aplicada exitosamente - productos despachados por fecha de vencimiento`,
        null,
        {
          orden_salida_id: departureOrderId,
          metodo_fifo: 'FECHA_VENCIMIENTO_PRIMERO',
          prioridad_aplicada: 'VENCIMIENTO_MAS_PROXIMO',
          criterio_secundario: 'FECHA_ENTRADA_MAS_ANTIGUA',
          productos_priorizados: result.dispatch_result?.cellAllocations?.map(cell => ({
            producto: cell.product_code,
            lote: cell.lot_series,
            fecha_vencimiento: cell.expiration_date,
            dias_hasta_vencimiento: cell.expiration_date ? 
              Math.ceil((new Date(cell.expiration_date) - new Date()) / (1000 * 60 * 60 * 24)) : 'N/A',
            prioridad_fifo: 'ALTA_PROXIMIDAD_VENCIMIENTO'
          })) || []
        },
        { 
          tipo_operacion: 'GESTION_FIFO', 
          tipo_accion: 'FIFO_APLICADO',
          impacto_negocio: 'ROTACION_INVENTARIO_OPTIMIZADA'
        }
      );
    }

    // ✅ SPANISH TRACKING: Trazabilidad completa
    await req.logEvent(
      'TRAZABILIDAD_DESPACHO_REGISTRADA',
      'Trazabilidad',
      departureOrderId,
      `Trazabilidad completa registrada para despacho automático`,
      null,
      {
        orden_salida_id: departureOrderId,
        numero_orden: result.departure_order?.departure_order_no,
        cadena_trazabilidad: {
          orden_creada: result.departure_order?.registration_date,
          orden_aprobada: result.departure_order?.approved_at,
          despacho_iniciado: new Date().toISOString(),
          despacho_completado: result.dispatched_at,
          productos_rastreados: result.dispatch_result?.cellAllocations?.map(cell => ({
            producto: cell.product_code,
            lote: cell.lot_series,
            orden_entrada_origen: cell.entry_order_no,
            celda_origen: cell.cell_reference,
            almacen: cell.warehouse_name,
            fecha_fabricacion: cell.manufacturing_date,
            fecha_vencimiento: cell.expiration_date
          })) || []
        },
        documentacion: {
          numero_guia_despacho: dispatchData.dispatch_document_number,
          transportista: result.departure_order?.carrier_name,
          destino: result.departure_order?.destination_point,
          fecha_salida_programada: result.departure_order?.departure_date_time
        }
      },
      { 
        tipo_operacion: 'TRAZABILIDAD', 
        tipo_accion: 'REGISTRO_COMPLETO',
        impacto_negocio: 'TRAZABILIDAD_DOCUMENTADA'
      }
    );
    
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error auto-dispatching departure order:", error);
    
    // ✅ SPANISH TRACKING: Error en despacho automático
    await req.logEvent(
      'ERROR_DESPACHO_AUTOMATICO',
      'OrdenDeSalida',
      req.params.departureOrderId,
      `Error durante despacho automático: ${error.message}`,
      null,
      {
        orden_salida_id: req.params.departureOrderId,
        usuario_intento: req.user?.id,
        rol_usuario: req.user?.role,
        tipo_error: error.name || 'Error',
        mensaje_error: error.message,
        datos_despacho: req.body,
        fecha_error: new Date().toISOString(),
        contexto_error: 'DESPACHO_AUTOMATICO_FALLIDO'
      },
      { 
        tipo_operacion: 'DESPACHO_AUTOMATICO', 
        tipo_accion: 'ERROR',
        impacto_negocio: 'DESPACHO_FALLIDO'
      }
    );
    
    // ✅ LOG: Auto-dispatch failure (English for system)
    await req.logError(error, {
      controller: 'departure',
      action: 'autoDispatchDepartureOrder',
      departure_order_id: req.params.departureOrderId,
      user_id: req.user?.id,
      user_role: req.user?.role,
      dispatch_data: req.body,
      error_context: 'AUTO_DISPATCH_FAILED'
    });
    
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * ✅ NEW: Update departure order (CLIENT users only, REVISION status only)
 */
async function updateDepartureOrder(req, res) {
  try {
    const { departureOrderId } = req.params;
    const updateData = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const files = req.files; // For multipart/form-data with file uploads

    if (!userId) {
      // ✅ LOG: Authentication failure
      await req.logEvent(
        'AUTHENTICATION_FAILED',
        'DepartureOrder',
        departureOrderId,
        `Authentication required for updating departure order ${departureOrderId}`,
        null,
        { departure_order_id: departureOrderId, attempted_action: 'UPDATE' },
        { operation_type: 'ACCESS_CONTROL', action_type: 'AUTH_REQUIRED' }
      );
      
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // ✅ NEW: Restrict departure order updates to CLIENT users only
    if (userRole !== "CLIENT") {
      // ✅ LOG: Access denied for update
      await req.logEvent(
        'ACCESS_DENIED',
        'DepartureOrder',
        departureOrderId,
        `Access denied: ${userRole} user attempted to update departure order ${departureOrderId}`,
        null,
        { 
          attempted_role: userRole, 
          required_role: 'CLIENT',
          departure_order_id: departureOrderId,
          user_id: userId
        },
        { operation_type: 'ACCESS_CONTROL', action_type: 'UPDATE_DENIED' }
      );
      
      return res.status(403).json({
        success: false,
        message: "Access denied. Only CLIENT users can update departure orders.",
      });
    }

    // Validate request data
    if (!updateData || Object.keys(updateData).length === 0) {
      // ✅ LOG: Empty update data
      await req.logEvent(
        'VALIDATION_FAILED',
        'DepartureOrder',
        departureOrderId,
        `Empty update data provided for departure order ${departureOrderId}`,
        null,
        { 
          departure_order_id: departureOrderId,
          user_id: userId,
          update_data_keys: Object.keys(updateData || {})
        },
        { operation_type: 'VALIDATION', action_type: 'EMPTY_UPDATE_DATA' }
      );
      
      return res.status(400).json({
        success: false,
        message: "No update data provided",
      });
    }

    // Validate that departure_order_no is not being changed
    if (updateData.departure_order_no && updateData.departure_order_no !== departureOrderId) {
      // ✅ LOG: Attempt to change order number
      await req.logEvent(
        'VALIDATION_FAILED',
        'DepartureOrder',
        departureOrderId,
        `Attempt to change departure order number from ${departureOrderId} to ${updateData.departure_order_no}`,
        null,
        { 
          original_order_id: departureOrderId,
          attempted_new_order_no: updateData.departure_order_no,
          user_id: userId
        },
        { operation_type: 'VALIDATION', action_type: 'ORDER_NUMBER_CHANGE_DENIED' }
      );
      
      return res.status(400).json({
        success: false,
        message: "Departure order number cannot be changed",
      });
    }

    // ✅ LOG: Update process started
    await req.logEvent(
      'DEPARTURE_ORDER_UPDATE_STARTED',
      'DepartureOrder',
      departureOrderId,
      `Started updating departure order ${departureOrderId}`,
      null,
      {
        departure_order_id: departureOrderId,
        user_id: userId,
        user_role: userRole,
        update_fields: Object.keys(updateData),
        products_being_updated: updateData.products ? updateData.products.length : 0,
        update_timestamp: new Date().toISOString(),
        has_product_changes: !!updateData.products,
        has_order_details_changes: !!(updateData.total_volume || updateData.total_weight || updateData.total_pallets),
        has_date_changes: !!(updateData.departure_date_time || updateData.document_date),
        has_document_changes: !!updateData.uploaded_documents,
        has_observation_changes: !!updateData.observation,
        has_transport_changes: !!(updateData.transport_type || updateData.carrier_name || updateData.destination_point)
      },
      { operation_type: 'DEPARTURE_ORDER_MANAGEMENT', action_type: 'UPDATE_START' }
    );

    // Validate product data if provided
    if (updateData.products && Array.isArray(updateData.products)) {
      for (let i = 0; i < updateData.products.length; i++) {
        const product = updateData.products[i];
        
        // Check required fields for new products (without departure_order_product_id)
        if (!product.departure_order_product_id) {
          if (!product.product_id || !product.product_code || 
              !product.requested_quantity || !product.requested_weight) {
            
            // ✅ LOG: Product validation failure during update
            await req.logEvent(
              'PRODUCT_VALIDATION_FAILED',
              'DepartureOrderProduct',
              `${departureOrderId}-UPDATE-PRODUCT-${i + 1}`,
              `Product ${i + 1} validation failed during departure order ${departureOrderId} update`,
              null,
              { 
                departure_order_id: departureOrderId,
                product_index: i + 1,
                product_data: product,
                missing_fields: {
                  product_id: !product.product_id,
                  product_code: !product.product_code,
                  requested_quantity: !product.requested_quantity,
                  requested_weight: !product.requested_weight
                },
                user_id: userId
              },
              { operation_type: 'VALIDATION', action_type: 'UPDATE_PRODUCT_VALIDATION' }
            );
            
            return res.status(400).json({
              success: false,
              message: `Product ${i + 1}: Missing required fields (product_id, product_code, requested_quantity, requested_weight)`,
            });
          }
        }

        // Validate quantities are positive numbers
        if (product.requested_quantity !== undefined && product.requested_quantity <= 0) {
          // ✅ LOG: Quantity validation failure
          await req.logEvent(
            'QUANTITY_VALIDATION_FAILED',
            'DepartureOrderProduct',
            `${departureOrderId}-UPDATE-PRODUCT-${i + 1}`,
            `Product ${i + 1} requested quantity validation failed during departure order ${departureOrderId} update`,
            null,
            { 
              departure_order_id: departureOrderId,
              product_index: i + 1,
              product_code: product.product_code,
              invalid_requested_quantity: product.requested_quantity,
              user_id: userId
            },
            { operation_type: 'VALIDATION', action_type: 'UPDATE_QUANTITY_VALIDATION' }
          );
          
          return res.status(400).json({
            success: false,
            message: `Product ${i + 1}: Requested quantity must be positive`,
          });
        }

        if (product.requested_weight !== undefined && product.requested_weight <= 0) {
          // ✅ LOG: Weight validation failure
          await req.logEvent(
            'QUANTITY_VALIDATION_FAILED',
            'DepartureOrderProduct',
            `${departureOrderId}-UPDATE-PRODUCT-${i + 1}`,
            `Product ${i + 1} requested weight validation failed during departure order ${departureOrderId} update`,
            null,
            { 
              departure_order_id: departureOrderId,
              product_index: i + 1,
              product_code: product.product_code,
              invalid_requested_weight: product.requested_weight,
              user_id: userId
            },
            { operation_type: 'VALIDATION', action_type: 'UPDATE_WEIGHT_VALIDATION' }
          );
          
          return res.status(400).json({
            success: false,
            message: `Product ${i + 1}: Requested weight must be positive`,
          });
        }
      }
    }

    const result = await departureService.updateDepartureOrder(departureOrderId, updateData, userId);

    // ✅ NEW: If files are uploaded, process document uploads
    if (files && files.length > 0 && result.departure_order) {
      console.log(`📎 Processing ${files.length} document uploads for updated departure order ${result.departure_order.departure_order_id}`);
      
      const { uploadDocument, validateFile } = require("../../utils/supabase");
      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();
      
      // Parse document types if it's a string
      let documentTypes = updateData.document_types || [];
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
          'departure-order',
          result.departure_order.departure_order_id,
          documentType,
          userId
        );

        uploadResults.push({
          filename: file.originalname,
          ...uploadResult
        });
      }

      // Update departure order with document information
      const successfulUploads = uploadResults.filter(r => r.success);
      if (successfulUploads.length > 0) {
        const currentDocuments = result.departure_order.uploaded_documents || [];
        const newDocuments = successfulUploads.map(upload => ({
          file_name: upload.file_name,
          file_path: upload.file_path,
          public_url: upload.public_url,
          document_type: upload.document_type,
          uploaded_by: upload.uploaded_by,
          uploaded_at: upload.uploaded_at,
          file_size: upload.file_size,
          content_type: upload.content_type
        }));

        // Update departure order with documents
        await prisma.departureOrder.update({
          where: { departure_order_id: result.departure_order.departure_order_id },
          data: {
            uploaded_documents: [...currentDocuments, ...newDocuments]
          }
        });

        // Log document upload activity
        await req.logEvent(
          'DOCUMENTOS_SUBIDOS_ACTUALIZACION_ORDEN_SALIDA',
          'OrdenDeSalida',
          result.departure_order.departure_order_id,
          `Se subieron ${successfulUploads.length} documentos durante la actualización de la orden de salida ${result.departure_order.departure_order_no}`,
          null,
          {
            orden_salida_id: result.departure_order.departure_order_id,
            orden_salida_no: result.departure_order.departure_order_no,
            documentos_subidos: successfulUploads.length,
            tipos_documento: newDocuments.map(d => d.document_type),
            usuario_id: userId
          }
        );

        // Add document metadata to result
        result.departure_order.uploaded_documents = [...currentDocuments, ...newDocuments];
      }

      // Add upload results to response
      result.document_uploads = {
        total_files: files.length,
        successful_uploads: successfulUploads.length,
        failed_uploads: uploadResults.filter(r => !r.success).length,
        upload_details: uploadResults
      };
    }

    // ✅ LOG: Successful departure order update
    await req.logEvent(
      'DEPARTURE_ORDER_UPDATED',
      'DepartureOrder',
      result.departure_order.departure_order_id,
      `Successfully updated departure order ${departureOrderId}`,
      result.oldValues,
      result.newValues,
      { 
        operation_type: 'DEPARTURE_ORDER_MANAGEMENT', 
        action_type: 'UPDATE_SUCCESS',
        business_impact: 'ORDER_MODIFIED_REQUIRES_RE_REVIEW',
        next_steps: 'AWAITING_ADMIN_RE_REVIEW',
        changes_summary: {
          fields_updated: Object.keys(updateData),
          products_updated: updateData.products ? updateData.products.length : 0,
          status_reset_to_pending: true,
          requires_new_review: true
        }
      }
    );

    return res.status(200).json({
      success: true,
      data: result,
      message: `Departure order ${departureOrderId} updated successfully. Status reset to PENDING for re-review.`,
    });
  } catch (error) {
    console.error("Error updating departure order:", error);
    
    // ✅ LOG: Update process error
    await req.logError(error, {
      controller: 'departure',
      action: 'updateDepartureOrder',
      departure_order_id: req.params.departureOrderId,
      user_id: req.user?.id,
      user_role: req.user?.role,
      update_data_keys: Object.keys(req.body || {}),
      error_context: 'DEPARTURE_ORDER_UPDATE_FAILED'
    });
    
    // Handle specific business rule errors
    if (error.message.includes("REVISION") || 
        error.message.includes("only update your own") ||
        error.message.includes("not found")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error updating departure order",
      error: error.message,
    });
  }
}

/**
 * ✅ NEW: Get approved departure orders for dispatch (similar to cell assignment flow)
 */
async function getApprovedDepartureOrdersForDispatch(req, res) {
  try {
    const { warehouseId, organisation_id } = req.query;
    const userRole = req.user?.role;
    const userId = req.user?.id;
    
    const data = await departureService.getApprovedDepartureOrdersForDispatch(warehouseId || null, userRole, userId, organisation_id || null);
    
    return res.status(200).json({ 
      success: true,
      message: userRole === "CLIENT" 
        ? "Approved departure orders for your dispatch fetched successfully"
        : "Approved departure orders for dispatch fetched successfully", 
      count: data.length,
      data,
      user_role: userRole,
      filtered_by_client: userRole === "CLIENT",
      warehouse_filter: warehouseId || "ALL_WAREHOUSES",
      organisation_filter: organisation_id || "ALL_ORGANISATIONS",
      dispatch_flow: "APPROVED_ORDER_DISPATCH",
      includes_orders_without_inventory: true
    });
  } catch (error) {
    console.error("Error in getApprovedDepartureOrdersForDispatch:", error);
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * ✅ NEW: Dispatch approved departure order with inventory selection (new flow)
 */
async function dispatchApprovedDepartureOrder(req, res) {
  try {
    const dispatchData = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const files = req.files; // For multipart/form-data with file uploads

    // ✅ ROLE VALIDATION: Only WAREHOUSE_INCHARGE and ADMIN can dispatch
    if (!['WAREHOUSE_INCHARGE', 'ADMIN'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only warehouse incharge or admin can dispatch departure orders',
        user_role: userRole,
        required_roles: ['WAREHOUSE_INCHARGE', 'ADMIN']
      });
    }

    // ✅ Set required fields from authenticated user
    dispatchData.dispatched_by = userId;

    console.log("🚚 Dispatching approved departure order with inventory selection...");
    console.log("Dispatch data:", dispatchData);
    console.log("Inventory selections:", dispatchData.inventory_selections?.length || 0);
    console.log("Files received:", files ? files.length : 0);

    // ✅ SPANISH TRACKING: Inicio de despacho de orden aprobada
    await req.logEvent(
      'DESPACHO_ORDEN_APROBADA_INICIADO',
      'DespachoOrdenAprobada',
      dispatchData.departure_order_id,
      `Iniciando despacho de orden aprobada ${dispatchData.departure_order_id} por ${userRole} - ${dispatchData.inventory_selections?.length || 0} selecciones de inventario`,
      null,
      {
        usuario_id: userId,
        rol_usuario: userRole,
        orden_salida_id: dispatchData.departure_order_id,
        selecciones_inventario: dispatchData.inventory_selections?.length || 0,
        notas_despacho: dispatchData.dispatch_notes,
        timestamp_inicio: new Date().toISOString(),
        metodo_flujo: 'DESPACHO_ORDEN_APROBADA'
      },
      { 
        tipo_operacion: 'DESPACHO_ORDEN_APROBADA', 
        tipo_accion: 'INICIO_PROCESO',
        impacto_negocio: 'PROCESO_DESPACHO_ORDEN_APROBADA_INICIADO'
      }
    );

    const result = await departureService.dispatchApprovedDepartureOrder(dispatchData, userRole);

    // ✅ NEW: If files are uploaded, process document uploads
    if (files && files.length > 0 && result.departure_order) {
      console.log(`📎 Processing ${files.length} document uploads for dispatched order ${result.departure_order.departure_order_id}`);
      
      const { uploadDocument, validateFile } = require("../../utils/supabase");
      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();
      
      // Parse document types if it's a string
      let documentTypes = dispatchData.document_types || [];
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
          ? (documentTypes[i] || 'CUSTOMER_DISPATCH_NOTE') 
          : (documentTypes || 'CUSTOMER_DISPATCH_NOTE');

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
          'departure-order',
          result.departure_order.departure_order_id,
          documentType,
          userId
        );

        uploadResults.push({
          filename: file.originalname,
          ...uploadResult
        });
      }

      // Update departure order with document information
      const successfulUploads = uploadResults.filter(r => r.success);
      if (successfulUploads.length > 0) {
        const currentDocuments = result.departure_order.uploaded_documents || [];
        const newDocuments = successfulUploads.map(upload => ({
          file_name: upload.file_name,
          file_path: upload.file_path,
          public_url: upload.public_url,
          document_type: upload.document_type,
          uploaded_by: upload.uploaded_by,
          uploaded_at: upload.uploaded_at,
          file_size: upload.file_size,
          content_type: upload.content_type
        }));

        // Update departure order with documents
        await prisma.departureOrder.update({
          where: { departure_order_id: result.departure_order.departure_order_id },
          data: {
            uploaded_documents: [...currentDocuments, ...newDocuments]
          }
        });

        // Log document upload activity
        await req.logEvent(
          'DOCUMENTOS_SUBIDOS_DESPACHO_ORDEN_APROBADA',
          'DespachoOrdenAprobada',
          result.departure_order.departure_order_id,
          `Se subieron ${successfulUploads.length} documentos durante el despacho de orden aprobada ${result.departure_order.departure_order_no}`,
          null,
          {
            orden_salida_id: result.departure_order.departure_order_id,
            orden_salida_no: result.departure_order.departure_order_no,
            documentos_subidos: successfulUploads.length,
            tipos_documento: newDocuments.map(d => d.document_type),
            usuario_id: userId,
            metodo_despacho: 'ORDEN_APROBADA'
          }
        );
      }

      // Add upload results to response
      result.document_uploads = {
        total_files: files.length,
        successful_uploads: successfulUploads.length,
        failed_uploads: uploadResults.filter(r => !r.success).length,
        upload_details: uploadResults
      };
    }

    // ✅ SPANISH TRACKING: Despacho de orden aprobada completado exitosamente
    await req.logEvent(
      'DESPACHO_ORDEN_APROBADA_COMPLETADO',
      'DespachoOrdenAprobada',
      result.departure_order.departure_order_id,
      `Despacho de orden aprobada completado exitosamente - Orden ${result.departure_order.departure_order_no} despachada`,
      null,
      {
        orden_salida_id: result.departure_order.departure_order_id,
        numero_orden_salida: result.departure_order.departure_order_no,
        usuario_despachador: userId,
        rol_despachador: userRole,
        fecha_despacho: result.departure_order.dispatched_at,
        metodo_despacho: result.departure_order.dispatch_method,
        fue_pre_aprobada: result.departure_order.was_pre_approved,
        resumen_despacho: {
          productos_totales: result.summary.total_products_dispatched,
          selecciones_inventario: result.summary.total_inventory_selections,
          cantidad_total_despachada: result.summary.total_quantity_dispatched,
          peso_total_despachado: result.summary.total_weight_dispatched,
          celdas_afectadas: result.summary.cells_affected,
          celdas_agotadas: result.summary.cells_depleted
        },
        informacion_workflow: result.workflow_info
      },
      { 
        tipo_operacion: 'DESPACHO_ORDEN_APROBADA', 
        tipo_accion: 'DESPACHO_EXITOSO',
        impacto_negocio: 'ORDEN_APROBADA_DESPACHADA',
        metodo_flujo: 'DISPATCH_FROM_APPROVED_ORDER'
      }
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error dispatching approved departure order:", error);
    
    // ✅ SPANISH TRACKING: Error en despacho de orden aprobada
    await req.logEvent(
      'ERROR_DESPACHO_ORDEN_APROBADA',
      'DespachoOrdenAprobada',
      req.body.departure_order_id || 'ERROR_OPERACION',
      `Error durante despacho de orden aprobada: ${error.message}`,
      null,
      {
        datos_despacho: {
          orden_salida_id: req.body.departure_order_id,
          selecciones_inventario: req.body.inventory_selections?.length || 0,
        },
        usuario_id: req.user?.id,
        rol_usuario: req.user?.role,
        tipo_error: error.name || 'Error',
        mensaje_error: error.message,
        fecha_error: new Date().toISOString(),
        contexto_error: 'DESPACHO_ORDEN_APROBADA_FALLIDO'
      },
      { 
        tipo_operacion: 'DESPACHO_ORDEN_APROBADA', 
        tipo_accion: 'ERROR_DESPACHO',
        impacto_negocio: 'DESPACHO_ORDEN_APROBADA_FALLIDO'
      }
    );
    
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * ✅ NEW: Get warehouse summary for dispatch selection
 */
async function getWarehouseDispatchSummary(req, res) {
  try {
    const userRole = req.user?.role;
    const userId = req.user?.id;
    
    const data = await departureService.getWarehouseDispatchSummary(userRole, userId);
    
    return res.status(200).json({ 
      success: true,
      message: userRole === "CLIENT" 
        ? "Warehouse dispatch summary for your assigned products fetched successfully"
        : "Warehouse dispatch summary fetched successfully", 
      count: data.length,
      data,
      user_role: userRole,
      filtered_by_client_assignments: userRole === "CLIENT",
      summary: {
        total_warehouses: data.length,
        total_quantity: data.reduce((sum, w) => sum + w.total_quantity, 0),
        total_weight: data.reduce((sum, w) => sum + w.total_weight, 0),
        total_products: data.reduce((sum, w) => sum + w.total_products, 0),
        warehouses_with_inventory: data.filter(w => w.can_dispatch).length,
      },
      dispatch_flow: "DIRECT_FROM_INVENTORY"
    });
  } catch (error) {
    console.error("Error in getWarehouseDispatchSummary:", error);
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * ✅ NEW: Get auto-selected inventory for dispatch based on FIFO and expiry
 */
async function getAutoSelectedInventoryForDispatch(req, res) {
  try {
    const { departureOrderId } = req.params;
    const { dispatchQuantities } = req.body;
    const userRole = req.user?.role;
    const userId = req.user?.id;
    
    if (!departureOrderId) {
      return res.status(400).json({
        success: false,
        message: "Departure Order ID is required",
      });
    }

    if (!dispatchQuantities || typeof dispatchQuantities !== 'object') {
      return res.status(400).json({
        success: false,
        message: "Dispatch quantities object is required (productId: quantity)",
      });
    }
    
    const data = await departureService.getAutoSelectedInventoryForDispatch(
      departureOrderId,
      dispatchQuantities
    );
    
    return res.status(200).json({ 
      success: true,
      message: "Auto-selected inventory for dispatch fetched successfully", 
      data,
      departure_order_id: departureOrderId,
      dispatch_quantities: dispatchQuantities,
      user_role: userRole,
      selection_method: "AUTO_FIFO_EXPIRY",
      allows_modification: true,
    });
  } catch (error) {
    console.error("Error in getAutoSelectedInventoryForDispatch:", error);
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * ✅ NEW: Get recalculated FIFO inventory for partial dispatch
 */
async function getRecalculatedFifoInventoryForDeparture(req, res) {
  try {
    const { departureOrderId, productId } = req.params;
    const { requestedQuantity } = req.query;
    const userRole = req.user?.role;
    const userId = req.user?.id;
    
    if (!departureOrderId || !productId) {
      return res.status(400).json({
        success: false,
        message: "Departure Order ID and Product ID are required",
      });
    }

    if (!requestedQuantity || isNaN(parseInt(requestedQuantity))) {
      return res.status(400).json({
        success: false,
        message: "Valid requested quantity is required",
      });
    }
    
    const data = await departureService.getRecalculatedFifoInventoryForDeparture(
      departureOrderId,
      productId,
      parseInt(requestedQuantity),
      userRole,
      userId
    );
    
    return res.status(200).json({ 
      success: true,
      message: "Recalculated FIFO inventory for partial dispatch fetched successfully", 
      data,
      departure_order_id: departureOrderId,
      product_id: productId,
      requested_quantity: parseInt(requestedQuantity),
      user_role: userRole,
      supports_partial_dispatch: true,
      includes_held_inventory: true,
    });
  } catch (error) {
    console.error("Error in getRecalculatedFifoInventoryForDeparture:", error);
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * ✅ NEW: Release held inventory for departure order
 */
async function releaseHeldInventoryForDeparture(req, res) {
  try {
    const { departureOrderId } = req.params;
    const { reason } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!departureOrderId) {
      return res.status(400).json({
        success: false,
        message: "Departure Order ID is required",
      });
    }

    // ✅ SPANISH TRACKING: Inicio de liberación de inventario retenido
    await req.logEvent(
      'LIBERACION_INVENTARIO_RETENIDO_INICIADA',
      'InventarioRetenido',
      departureOrderId,
      `Iniciando liberación de inventario retenido para orden de salida ${departureOrderId}`,
      null,
      {
        usuario_id: userId,
        rol_usuario: userRole,
        orden_salida_id: departureOrderId,
        razon_liberacion: reason || 'ORDER_COMPLETION',
        timestamp_inicio: new Date().toISOString(),
      },
      { 
        tipo_operacion: 'LIBERACION_INVENTARIO_RETENIDO', 
        tipo_accion: 'INICIO_PROCESO',
        impacto_negocio: 'PROCESO_LIBERACION_INVENTARIO_INICIADO'
      }
    );

    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    
    const result = await prisma.$transaction(async (tx) => {
      return await departureService.releaseHeldInventoryForDeparture(
        tx, 
        departureOrderId, 
        userId, 
        reason || "ORDER_COMPLETION"
      );
    });

    // ✅ SPANISH TRACKING: Liberación de inventario completada
    await req.logEvent(
      'INVENTARIO_RETENIDO_LIBERADO',
      'InventarioRetenido',
      departureOrderId,
      `Inventario retenido liberado exitosamente para orden de salida ${departureOrderId}`,
      null,
      {
        orden_salida_id: departureOrderId,
        usuario_liberador: userId,
        rol_liberador: userRole,
        razon_liberacion: reason || 'ORDER_COMPLETION',
        fecha_liberacion: new Date().toISOString(),
        resumen_liberacion: {
          items_liberados: result.released_items,
          cantidad_total_liberada: result.total_quantity_released,
          peso_total_liberado: result.total_weight_released
        }
      },
      { 
        tipo_operacion: 'LIBERACION_INVENTARIO_RETENIDO', 
        tipo_accion: 'LIBERACION_EXITOSA',
        impacto_negocio: 'INVENTARIO_RETENIDO_LIBERADO'
      }
    );
    
    return res.status(200).json({ 
      success: true,
      message: `Held inventory for departure order ${departureOrderId} released successfully`, 
      data: result,
      departure_order_id: departureOrderId,
      release_reason: reason || "ORDER_COMPLETION",
      released_by: {
        user_id: userId,
        user_role: userRole
      }
    });
  } catch (error) {
    console.error("Error in releaseHeldInventoryForDeparture:", error);
    
    // ✅ SPANISH TRACKING: Error en liberación de inventario
    await req.logEvent(
      'ERROR_LIBERACION_INVENTARIO_RETENIDO',
      'InventarioRetenido',
      req.params.departureOrderId || 'ERROR_OPERACION',
      `Error durante liberación de inventario retenido: ${error.message}`,
      null,
      {
        orden_salida_id: req.params.departureOrderId,
        usuario_id: req.user?.id,
        rol_usuario: req.user?.role,
        razon_liberacion: req.body.reason,
        tipo_error: error.name || 'Error',
        mensaje_error: error.message,
        fecha_error: new Date().toISOString(),
        contexto_error: 'LIBERACION_INVENTARIO_RETENIDO_FALLIDA'
      },
      { 
        tipo_operacion: 'LIBERACION_INVENTARIO_RETENIDO', 
        tipo_accion: 'ERROR_LIBERACION',
        impacto_negocio: 'LIBERACION_INVENTARIO_FALLIDA'
      }
    );
    
    return res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

/**
 * ✅ NEW: Process bulk departure orders from Excel upload
 */
async function processBulkDepartureOrders(req, res) {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const organisationId = req.user?.organisation_id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Excel file is required for bulk upload"
      });
    }

    console.log("📋 Processing bulk departure orders upload...");
    console.log("File:", req.file.originalname, "Size:", req.file.size);
    console.log("User:", userId, "Role:", userRole, "Org:", organisationId);

    // Log bulk upload start
    await req.logEvent(
      'BULK_DEPARTURE_UPLOAD_STARTED',
      'BulkDepartureUpload',
      null,
      `Started bulk departure order upload by ${userRole}`,
      null,
      {
        file_name: req.file.originalname,
        file_size: req.file.size,
        user_id: userId,
        user_role: userRole,
        organisation_id: organisationId
      }
    );

    const result = await bulkDepartureService.processBulkDepartureOrders(
      req.file.buffer,
      userId,
      userRole,
      organisationId
    );

    // Log bulk upload completion
    await req.logEvent(
      'BULK_DEPARTURE_UPLOAD_COMPLETED',
      'BulkDepartureUpload',
      null,
      `Bulk departure order upload completed - ${result.summary.successful_orders} orders created`,
      null,
      {
        ...result.summary,
        user_id: userId,
        user_role: userRole,
        organisation_id: organisationId
      }
    );

    return res.status(200).json({
      success: true,
      message: "Bulk departure orders processed successfully",
      data: result
    });

  } catch (error) {
    console.error("Error in processBulkDepartureOrders:", error);

    // Log bulk upload error
    await req.logEvent(
      'BULK_DEPARTURE_UPLOAD_ERROR',
      'BulkDepartureUpload',
      null,
      `Bulk departure order upload failed: ${error.message}`,
      null,
      {
        error_message: error.message,
        user_id: req.user?.id,
        user_role: req.user?.role,
        file_name: req.file?.originalname
      }
    );

    return res.status(500).json({
      success: false,
      message: "Error processing bulk departure orders",
      error: error.message
    });
  }
}

/**
 * ✅ NEW: Generate bulk departure order Excel template
 */
async function generateBulkDepartureTemplate(req, res) {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    console.log("📄 Generating bulk departure order template...");

    const templateResult = await bulkDepartureService.generateBulkDepartureTemplate(userId, userRole);

    // Set response headers for Excel file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${templateResult.filename || 'bulk_departure_template.xlsx'}`);

    // Log template generation
    await req.logEvent(
      'BULK_DEPARTURE_TEMPLATE_GENERATED',
      'BulkDepartureTemplate',
      null,
      `Bulk departure order template generated by ${userRole}`,
      null,
      {
        user_id: userId,
        user_role: userRole,
        template_name: templateResult.filename || 'bulk_departure_template.xlsx'
      }
    );

    return res.send(templateResult.buffer);

  } catch (error) {
    console.error("Error in generateBulkDepartureTemplate:", error);

    return res.status(500).json({
      success: false,
      message: "Error generating bulk departure template",
      error: error.message
    });
  }
}

module.exports = {
  getDepartureFormFields,
  getDepartureExitOptions,
  getAllDepartureOrders,
  createDepartureOrder,
  updateDepartureOrder,
  getProductsWithInventory,
  getAvailableCellsForProduct,
  validateSelectedCell,
  validateMultipleCells,
  getDepartureOrderById,
  getDepartureInventorySummary,
  getCurrentDepartureOrderNo,
  getFifoLocationsForProduct,
  getSuggestedFifoAllocation,
  // ✅ Approval workflow methods
  approveDepartureOrder,
  rejectDepartureOrder,
  requestRevisionDepartureOrder,
  // ✅ Dispatch methods
  dispatchDepartureOrder,
  batchDispatchDepartureOrders,
  // ✅ Permissions method
  getDeparturePermissions,
  // ✅ Expiry urgency dashboard
  getExpiryUrgencyDashboard,
  createComprehensiveDepartureOrder,
  getComprehensiveDepartureOrders,
  getComprehensiveDepartureOrderByNumber,
  getDepartureOrderAuditTrail,
  createDepartureAllocations,
  getAvailableInventoryForDeparture,
  autoDispatchDepartureOrder,
  // ✅ NEW: Corrected dispatch flow methods
  getApprovedDepartureOrdersForDispatch,
  getAutoSelectedInventoryForDispatch,
  dispatchApprovedDepartureOrder,
  getWarehouseDispatchSummary,
  // ✅ NEW: Partial dispatch support methods
  getRecalculatedFifoInventoryForDeparture,
  releaseHeldInventoryForDeparture,
  // ✅ NEW: Bulk departure upload methods
  processBulkDepartureOrders,
  generateBulkDepartureTemplate,
};

