// ============================================
// State
// ============================================
let lookupResult = null;
let sessionId = 'session_' + Date.now();

// ============================================
// Init
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    loadStatus();

    // File upload handler
    document.getElementById('excelFile').addEventListener('change', uploadMaster);
});

// ============================================
// Load status on page load
// ============================================
async function loadStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        document.getElementById('masterCount').textContent = data.masterCount;
        renderHistory(data.history);
    } catch (err) {
        console.error('Failed to load status:', err);
    }
}

// ============================================
// Upload Master Excel
// ============================================
async function uploadMaster(e) {
    const file = e.target.files[0];
    if (!file) return;

    const btn = document.getElementById('uploadBtn');
    btn.textContent = '⏳ Uploading...';
    btn.disabled = true;

    const formData = new FormData();
    formData.append('excel', file);

    try {
        const res = await fetch('/api/upload-master', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            document.getElementById('masterCount').textContent = data.count;
            alert(`✅ ${data.message}`);
        } else {
            alert(`❌ ${data.error}`);
        }
    } catch (err) {
        alert(`❌ Error: ${err.message}`);
    } finally {
        btn.textContent = '📤 Upload Excel';
        btn.disabled = false;
        e.target.value = ''; // Reset file input
    }
}

// ============================================
// Clear Master Data
// ============================================
async function clearMaster() {
    if (!confirm('Yakin hapus semua data master kurir?')) return;

    try {
        const res = await fetch('/api/clear-master', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            document.getElementById('masterCount').textContent = '0';
            alert('✅ Data master dihapus');
        }
    } catch (err) {
        alert(`❌ Error: ${err.message}`);
    }
}

// ============================================
// Lookup Courier IDs
// ============================================
async function lookupCouriers() {
    const courierIds = document.getElementById('courierIds').value.trim();
    if (!courierIds) {
        alert('Masukkan courier IDs terlebih dahulu');
        return;
    }

    try {
        const res = await fetch('/api/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courierIds })
        });
        const data = await res.json();

        if (data.error) {
            alert(`❌ ${data.error}`);
            return;
        }

        lookupResult = data;
        renderResults(data);
    } catch (err) {
        alert(`❌ Error: ${err.message}`);
    }
}

// ============================================
// Render Lookup Results
// ============================================
function renderResults(data) {
    const card = document.getElementById('resultsCard');
    card.classList.add('show');

    document.getElementById('totalInput').textContent = data.totalInput;
    document.getElementById('totalFound').textContent = data.totalFound;
    document.getElementById('totalNotFound').textContent = data.totalNotFound;

    // Render courier list
    const listEl = document.getElementById('courierList');
    let html = '';

    data.found.forEach(c => {
        html += `
            <div class="courier-item found">
                <span>✅</span>
                <span class="courier-id">${c.courier_id}</span>
                <span class="courier-name">${c.courier_name}</span>
                <span class="courier-phone">${c.courier_phone}</span>
            </div>
        `;
    });

    data.notFound.forEach(id => {
        html += `
            <div class="courier-item not-found">
                <span>❌</span>
                <span class="courier-id">${id}</span>
                <span class="courier-name">TIDAK DITEMUKAN</span>
            </div>
        `;
    });

    listEl.innerHTML = html;

    // Render description
    document.getElementById('descPreview').textContent = data.description;

    // Enable buttons
    document.getElementById('downloadBtn').disabled = false;
    document.getElementById('submitBtn').disabled = false;
}

// ============================================
// Download Excel
// ============================================
async function downloadExcel() {
    const courierIds = document.getElementById('courierIds').value.trim();
    if (!courierIds) return;

    try {
        const res = await fetch('/api/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courierIds })
        });

        if (!res.ok) {
            const error = await res.json();
            alert(`❌ ${error.error}`);
            return;
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SCA_Kurir_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (err) {
        alert(`❌ Error: ${err.message}`);
    }
}

// ============================================
// Submit to Power Apps
// ============================================
async function submitToPowerApps() {
    const courierIds = document.getElementById('courierIds').value.trim();
    if (!courierIds) return;

    if (!confirm('Submit ke Power Apps? Puppeteer akan membuka browser dan mengisi form otomatis.')) return;

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Memproses...';

    // Show log
    const logCard = document.getElementById('logCard');
    const logOutput = document.getElementById('logOutput');
    logCard.classList.add('show');
    logOutput.innerHTML = '';

    // Setup SSE for live logs
    sessionId = 'session_' + Date.now();
    const eventSource = new EventSource(`/api/logs/${sessionId}`);

    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.log) {
            const line = document.createElement('div');
            line.className = 'log-line';
            line.textContent = data.log;
            logOutput.appendChild(line);
            logOutput.scrollTop = logOutput.scrollHeight;
        }

        if (data.done) {
            eventSource.close();
            submitBtn.disabled = false;
            submitBtn.innerHTML = '🚀 Submit ke Power Apps';

            if (data.result && data.result.success) {
                addLogLine('🎉 SELESAI! Form berhasil diisi di Power Apps.');
            } else {
                addLogLine('❌ Ada masalah. Cek screenshot di folder /screenshots/');
            }

            loadStatus(); // Refresh history
        }
    };

    eventSource.onerror = () => {
        addLogLine('⚠️ Koneksi log terputus');
        eventSource.close();
    };

    // Send submit request
    try {
        const res = await fetch('/api/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courierIds, sessionId })
        });
        const data = await res.json();

        if (data.error) {
            addLogLine(`❌ ${data.error}`);
            submitBtn.disabled = false;
            submitBtn.innerHTML = '🚀 Submit ke Power Apps';
            eventSource.close();
        }
    } catch (err) {
        addLogLine(`❌ Error: ${err.message}`);
        submitBtn.disabled = false;
        submitBtn.innerHTML = '🚀 Submit ke Power Apps';
        eventSource.close();
    }
}

function addLogLine(text) {
    const logOutput = document.getElementById('logOutput');
    const line = document.createElement('div');
    line.className = 'log-line';
    line.textContent = text;
    logOutput.appendChild(line);
    logOutput.scrollTop = logOutput.scrollHeight;
}

// ============================================
// Render History
// ============================================
function renderHistory(history) {
    const el = document.getElementById('historyList');

    if (!history || history.length === 0) {
        el.innerHTML = '<p style="color: var(--text-muted); font-size: 13px;">Belum ada riwayat</p>';
        return;
    }

    let html = '';
    history.forEach(h => {
        const date = new Date(h.timestamp);
        const timeStr = date.toLocaleDateString('id-ID', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        });
        const badge = h.success
            ? '<span class="badge badge-success">✅ Success</span>'
            : '<span class="badge badge-danger">❌ Failed</span>';

        html += `
            <div class="history-item">
                <span class="history-time">${timeStr}</span>
                <span class="history-info">${h.found} kurir ditemukan</span>
                ${badge}
            </div>
        `;
    });

    el.innerHTML = html;
}
