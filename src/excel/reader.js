const ExcelJS = require('exceljs');

/**
 * Parse master Excel file and return courier data array
 * Expected columns: courier_id, courier_name, courier_password, courier_phone,
 *                   courier_email, courier_nik, courier_regional, courier_branch, courier_zone
 */
async function readMasterExcel(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.worksheets[0]; // First sheet
    const couriers = [];

    // Get header row to map columns
    const headerRow = worksheet.getRow(1);
    const columnMap = {};

    headerRow.eachCell((cell, colNumber) => {
        const header = String(cell.value).toLowerCase().trim().replace(/\*/g, '');
        columnMap[header] = colNumber;
    });

    // Required fields
    const requiredFields = ['courier_id', 'courier_name'];
    for (const field of requiredFields) {
        if (!columnMap[field]) {
            throw new Error(`Kolom "${field}" tidak ditemukan di Excel. Kolom yang tersedia: ${Object.keys(columnMap).join(', ')}`);
        }
    }

    // Parse data rows
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        const courierId = getCellValue(row, columnMap['courier_id']);
        if (!courierId) return; // Skip empty rows

        const courier = {
            courier_id: courierId,
            courier_name: getCellValue(row, columnMap['courier_name']) || '',
            courier_password: getCellValue(row, columnMap['courier_password']) || '',
            courier_phone: getCellValue(row, columnMap['courier_phone']) || '',
            courier_email: getCellValue(row, columnMap['courier_email']) || '',
            courier_nik: getCellValue(row, columnMap['courier_nik']) || '',
            courier_regional: getCellValue(row, columnMap['courier_regional']) || '',
            courier_branch: getCellValue(row, columnMap['courier_branch']) || '',
            courier_zone: getCellValue(row, columnMap['courier_zone']) || '',
        };

        couriers.push(courier);
    });

    return couriers;
}

function getCellValue(row, colNumber) {
    if (!colNumber) return '';
    const cell = row.getCell(colNumber);
    if (cell.value === null || cell.value === undefined) return '';

    // Handle different cell value types
    if (typeof cell.value === 'object') {
        if (cell.value.text) return String(cell.value.text).trim();
        if (cell.value.result) return String(cell.value.result).trim();
        return String(cell.value).trim();
    }

    return String(cell.value).trim();
}

module.exports = { readMasterExcel };
