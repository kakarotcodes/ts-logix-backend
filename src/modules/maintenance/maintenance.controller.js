const maintenanceService = require("./maintenance.service");

async function addSupplier(req, res) {
  const { name, address, city, phone, email, ruc, country_id } = req.body;

  if (!name || !country_id) {
    return res.status(400).json({ message: "Name and Country are required." });
  }

  try {
    const newSupplier = await maintenanceService.createSupplier({
      name,
      address,
      city,
      phone,
      email,
      ruc,
      country_id,
    });

    return res.status(201).json({
      message: "Supplier created successfully",
      supplier: newSupplier,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error creating supplier", error: error.message });
  }
}


/**
 * Controller function to fetch all suppliers.
 */
async function getSuppliers(req, res) {
  try {
    const suppliers = await maintenanceService.getAllSuppliers();
    return res.status(200).json({
      message: "Suppliers fetched successfully",
      suppliers,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error fetching suppliers",
      error: error.message,
    });
  }
}

module.exports = { addSupplier, getSuppliers };
