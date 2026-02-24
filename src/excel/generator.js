const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

/**
 * Generate Excel file with courier data for Power Apps attachment
 */
async function generateCourierExcel(couriers) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('SCA Couriers');

    // Define columns
    worksheet.columns = [
        { header: 'courier_id', key: 'courier_id', width: 15 },
        { header: 'courier_name', key: 'courier_name', width: 25 },
        { header: 'courier_password', key: 'courier_password', width: 20 },
        { header: 'courier_phone', key: 'courier_phone', width: 18 },
        { header: 'courier_email', key: 'courier_email', width: 30 },
        { header: 'courier_nik', key: 'courier_nik', width: 25 },
        { header: 'courier_regional', key: 'courier_regional', width: 15 },
        { header: 'courier_branch', key: 'courier_branch', width: 12 },
        { header: 'courier_zone', key: 'courier_zone', width: 12 },
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2E7D32' }
    };
    headerRow.alignment = { horizontal: 'center' };

    // Add data
    for (const courier of couriers) {
        worksheet.addRow(courier);
    }

    // Auto-filter
    worksheet.autoFilter = {
        from: 'A1',
        to: `I${couriers.length + 1}`
    };

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `SCA_Kurir_${timestamp}.xlsx`;
    const filepath = path.join(__dirname, '../../exports', filename);

    // Ensure directory exists
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    await workbook.xlsx.writeFile(filepath);

    return { filepath, filename };
}

/**
 * Generate formatted description text for Power Apps
 */
function generateDescription(couriers, notFoundIds = []) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
    });

    let desc = `Request Aktivasi SCA Kurir\n`;
    desc += `Tanggal: ${dateStr} ${timeStr}\n`;
    desc += `Jumlah: ${couriers.length} kurir\n\n`;
    desc += `Daftar Kurir:\n`;

    couriers.forEach((c, i) => {
        desc += `${i + 1}. ${c.courier_id} - ${c.courier_name} - ${c.courier_phone}\n`;
    });

    if (notFoundIds.length > 0) {
        desc += `\nTIDAK DITEMUKAN (${notFoundIds.length}):\n`;
        notFoundIds.forEach(id => {
            desc += `- ${id}\n`;
        });
    }

    desc += `\nDetail data kurir terlampir pada file attachment.`;

    return desc;
}

module.exports = { generateCourierExcel, generateDescription };
