/* ── WhatsApp API Dashboard — App Logic ────────────────────── */

const API = window.location.origin;
let token = localStorage.getItem('wa_token');
let user = JSON.parse(localStorage.getItem('wa_user') || 'null');
let qrInterval = null;

// ── Trial Expiry Helpers ─────────────────────────────────────
function showTrialExpiredPopup() {
    document.getElementById('contactAdminModal').classList.remove('hidden');
}

/**
 * Pass a parsed response body. If it is a TRIAL_EXPIRED error,
 * show the contact-admin popup and return true (caller should stop).
 */
function checkTrialExpired(data) {
    if (!data.success && data.error === 'TRIAL_EXPIRED') {
        showTrialExpiredPopup();
        return true;
    }
    return false;
}

// ── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (token && user) {
        showDashboard();
    } else {
        showAuth();
    }

    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('createDeviceForm').addEventListener('submit', handleCreateDevice);
    document.getElementById('sendTextForm').addEventListener('submit', handleSendText);
    document.getElementById('sendFileForm').addEventListener('submit', handleSendFile);
    document.getElementById('sendImageForm').addEventListener('submit', handleSendImage);
});


// ── Auth ────────────────────────────────────────────────────
function showAuth() {
    document.getElementById('authPage').classList.remove('hidden');
    document.getElementById('dashboardPage').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('authPage').classList.add('hidden');
    document.getElementById('dashboardPage').classList.remove('hidden');

    // Show admin nav item only for admins
    if (user?.role === 'admin') {
        document.getElementById('adminNavItem').classList.remove('hidden');
    }

    // Show trial-expired banner for non-admin users with expired trial and no active plan
    if (user && user.role !== 'admin') {
        const trialExpired = user.trialExpiresAt && new Date(user.trialExpiresAt) < new Date();
        if (trialExpired) {
            showTrialBanner();
        }
    }

    document.getElementById('userEmail').textContent = user?.email || '';
    loadDevices();
    loadApiKey();
}

function showTrialBanner() {
    // Only add banner once
    if (document.getElementById('trialExpiredBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'trialExpiredBanner';
    banner.style.cssText = 'background:#ef4444;color:#fff;text-align:center;padding:.6rem 1rem;font-size:.85rem;font-weight:600;position:sticky;top:0;z-index:100;';
    banner.innerHTML = '⚠️ Your trial has expired. <a onclick="showTrialExpiredPopup()" style="color:#fff;text-decoration:underline;cursor:pointer;">Contact administrator</a> to activate a plan.';
    document.querySelector('.main-content').prepend(banner);
}


// ── Sidebar (Mobile) ─────────────────────────────────────────
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('visible');
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('visible');
}

function showLogin() {
    document.getElementById('loginView').classList.remove('hidden');
    document.getElementById('registerView').classList.add('hidden');
}

function showRegister() {
    document.getElementById('loginView').classList.add('hidden');
    document.getElementById('registerView').classList.remove('hidden');
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const res = await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        token = data.token;
        user = data.user;
        localStorage.setItem('wa_token', token);
        localStorage.setItem('wa_user', JSON.stringify(user));
        toast('Logged in successfully', 'success');
        showDashboard();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;

    try {
        const res = await fetch(`${API}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        toast('Account created! Please sign in.', 'success');
        showLogin();
        document.getElementById('loginEmail').value = email;
    } catch (err) {
        toast(err.message, 'error');
    }
}

function logout() {
    token = null;
    user = null;
    localStorage.removeItem('wa_token');
    localStorage.removeItem('wa_user');
    showAuth();
    toast('Signed out', 'info');
}

// ── Devices ─────────────────────────────────────────────────
async function loadDevices() {
    try {
        const res = await fetch(`${API}/device/list`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const container = document.getElementById('deviceList');
        if (!data.devices || data.devices.length === 0) {
            container.innerHTML = `
        <div class="empty-state">
          <div class="icon">📱</div>
          <p>No devices yet. Add one to get started.</p>
        </div>`;
            populateDeviceSelects([]);
            return;
        }

        container.innerHTML = data.devices.map(d => `
      <div class="device-item">
        <div class="device-info">
          <div class="device-avatar">📱</div>
          <div>
            <div class="device-name">${esc(d.session_name)}</div>
            <div class="device-id">${esc(d.device_id)}</div>
          </div>
        </div>
        <div class="device-actions">
          <span class="badge ${statusBadge(d.status)}">${d.status}</span>
          <button class="btn btn-outline btn-sm" onclick="viewDeviceStatus('${esc(d.device_id)}')" title="View Status">📋</button>
          ${d.status === 'connected' ? `<button class="btn btn-outline btn-sm" onclick="viewProfilePhoto('${esc(d.device_id)}')" title="Profile Photo">🖼️</button>` : ''}
          ${d.status !== 'connected' ? `<button class="btn btn-primary btn-sm" onclick="showQR('${esc(d.device_id)}')" title="Scan QR">QR</button>` : ''}
          <button class="btn btn-red btn-sm" onclick="deleteDevice('${esc(d.device_id)}')" title="Delete">🗑️</button>
        </div>
      </div>
    `).join('');

        populateDeviceSelects(data.devices);
    } catch (err) {
        toast(err.message, 'error');
    }
}

function populateDeviceSelects(devices) {
    const connected = devices.filter(d => d.status === 'connected');
    const options = connected.length === 0
        ? '<option value="">No connected devices</option>'
        : connected.map(d => `<option value="${esc(d.device_id)}">${esc(d.session_name)} (${esc(d.device_id)})</option>`).join('');

    document.getElementById('txtDeviceId').innerHTML = options;
    document.getElementById('fileDeviceId').innerHTML = options;
    document.getElementById('imgDeviceId').innerHTML = options;
}

function statusBadge(status) {
    if (status === 'connected') return 'badge-green';
    if (status === 'disconnected') return 'badge-red';
    return 'badge-yellow';
}

function openCreateDeviceModal() {
    document.getElementById('newDeviceId').value = '';
    document.getElementById('newSessionName').value = '';
    document.getElementById('createDeviceModal').classList.remove('hidden');
}

// View device status / profile
async function viewDeviceStatus(deviceId) {
    try {
        const res = await fetch(`${API}/device/status?deviceId=${encodeURIComponent(deviceId)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const d = data;
        const statusClass = statusBadge(d.status);
        const html = `
            <div style="text-align:center;margin-bottom:1rem">
                <div style="font-size:3rem;margin-bottom:.5rem">📱</div>
                <div style="font-size:1.1rem;font-weight:700;color:var(--navy)">${esc(d.sessionName)}</div>
                <div style="font-size:.82rem;color:var(--gray-400);font-family:Consolas,monospace">${esc(d.deviceId)}</div>
            </div>
            <table class="docs-table" style="margin-top:.75rem">
                <tr><td style="font-weight:600;color:var(--gray-500)">Status</td><td><span class="badge ${statusClass}">${d.status}</span></td></tr>
                <tr><td style="font-weight:600;color:var(--gray-500)">Created</td><td>${new Date(d.createdAt).toLocaleString()}</td></tr>
                <tr><td style="font-weight:600;color:var(--gray-500)">Device ID</td><td style="font-family:Consolas,monospace;font-size:.85rem">${esc(d.deviceId)}</td></tr>
            </table>`;

        // Reuse the QR modal container for status display
        document.getElementById('qrModal').querySelector('h3').textContent = 'Device Profile';
        document.getElementById('qrContainer').innerHTML = html;
        document.getElementById('qrModal').classList.remove('hidden');
    } catch (err) {
        toast(err.message, 'error');
    }
}

// Delete a device
async function deleteDevice(deviceId) {
    if (!confirm(`Are you sure you want to delete device "${deviceId}" and all its data? This cannot be undone.`)) {
        return;
    }
    try {
        const res = await fetch(`${API}/device/delete?deviceId=${encodeURIComponent(deviceId)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        toast('Device deleted successfully', 'success');
        loadDevices();
    } catch (err) {
        toast(err.message, 'error');
    }
}

// View profile photo
async function viewProfilePhoto(deviceId) {
    document.getElementById('qrModal').querySelector('h3').textContent = 'Profile Photo';
    document.getElementById('qrContainer').innerHTML = '<p class="text-gray">Loading profile photo...</p>';
    document.getElementById('qrModal').classList.remove('hidden');

    try {
        const res = await fetch(`${API}/device/profile-photo?deviceId=${encodeURIComponent(deviceId)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        if (data.profilePhoto) {
            document.getElementById('qrContainer').innerHTML = `
                <div style="text-align:center">
                    <img src="${data.profilePhoto}" alt="Profile Photo" style="max-width:260px;border-radius:50%;border:3px solid var(--green);box-shadow:var(--shadow-md)">
                    <p style="margin-top:1rem;font-size:.88rem;font-weight:600;color:var(--navy)">${esc(deviceId)}</p>
                </div>`;
        } else {
            document.getElementById('qrContainer').innerHTML = `
                <div style="text-align:center;padding:2rem">
                    <div style="font-size:3rem;margin-bottom:.75rem">👤</div>
                    <p style="color:var(--gray-500);font-size:.9rem">No profile photo set for this device</p>
                </div>`;
        }
    } catch (err) {
        document.getElementById('qrContainer').innerHTML = `<p class="text-red">${esc(err.message)}</p>`;
    }
}

async function handleCreateDevice(e) {
    e.preventDefault();
    const deviceId = document.getElementById('newDeviceId').value;
    const sessionName = document.getElementById('newSessionName').value;

    try {
        const res = await fetch(`${API}/device/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ deviceId, sessionName })
        });
        const data = await res.json();

        // Trial expired — close device modal and show contact admin popup
        if (!data.success && data.error === 'TRIAL_EXPIRED') {
            closeModal('createDeviceModal');
            document.getElementById('contactAdminModal').classList.remove('hidden');
            return;
        }

        if (!data.success) throw new Error(data.error);

        toast('Device created! Scan QR to connect.', 'success');
        closeModal('createDeviceModal');
        loadDevices();

        // Auto-open QR modal
        setTimeout(() => showQR(deviceId), 1000);
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ── QR Code ─────────────────────────────────────────────────
function showQR(deviceId) {
    document.getElementById('qrContainer').innerHTML = '<p class="text-gray">Loading QR code...</p>';
    document.getElementById('qrModal').classList.remove('hidden');
    pollQR(deviceId);
}

function pollQR(deviceId) {
    stopQrPolling();
    fetchQR(deviceId);
    qrInterval = setInterval(() => fetchQR(deviceId), 3000);
}

async function fetchQR(deviceId) {
    try {
        const res = await fetch(`${API}/device/qr?deviceId=${encodeURIComponent(deviceId)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.status === 'connected') {
            document.getElementById('qrContainer').innerHTML = `
        <div class="icon" style="font-size:3rem;margin-bottom:.5rem">✅</div>
        <p class="text-green" style="font-weight:600">Device Connected!</p>`;
            stopQrPolling();
            loadDevices();
            return;
        }

        if (data.qr) {
            document.getElementById('qrContainer').innerHTML = `
        <img src="${data.qr}" alt="QR Code">
        <div class="qr-status">Open WhatsApp → Linked Devices → Scan this code</div>`;
        } else {
            document.getElementById('qrContainer').innerHTML = '<p class="text-gray">Waiting for QR code... Please wait a few seconds.</p>';
        }
    } catch (err) {
        document.getElementById('qrContainer').innerHTML = '<p class="text-red">Failed to load QR code</p>';
    }
}

function stopQrPolling() {
    if (qrInterval) {
        clearInterval(qrInterval);
        qrInterval = null;
    }
}

// ── Send Messages ───────────────────────────────────────────
async function handleSendText(e) {
    e.preventDefault();
    const deviceId = document.getElementById('txtDeviceId').value;
    const number = document.getElementById('txtNumber').value;
    const message = document.getElementById('txtMessage').value;

    if (!user?.apiKey) {
        toast('Generate an API key first (API Key section)', 'error');
        return;
    }

    try {
        const params = new URLSearchParams({ deviceId, apiKey: user.apiKey, number, message });
        const res = await fetch(`${API}/api/messages/send-text?${params}`);
        const data = await res.json();

        if (!data.success) throw new Error(data.error);

        toast(`Message sent! ID: ${data.messageId}`, 'success');
        document.getElementById('txtMessage').value = '';
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function handleSendFile(e) {
    e.preventDefault();
    const deviceId = document.getElementById('fileDeviceId').value;
    const number = document.getElementById('fileNumber').value;
    const url = document.getElementById('fileUrl').value;
    const fileName = document.getElementById('fileName').value;

    if (!user?.apiKey) {
        toast('Generate an API key first (API Key section)', 'error');
        return;
    }

    try {
        const params = new URLSearchParams({ deviceId, apiKey: user.apiKey, number, url, fileName });
        const res = await fetch(`${API}/api/messages/send-file?${params}`);
        const data = await res.json();

        if (!data.success) throw new Error(data.error);

        toast(`PDF sent! ID: ${data.messageId}`, 'success');
        document.getElementById('fileUrl').value = '';
        document.getElementById('fileName').value = '';
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function handleSendImage(e) {
    e.preventDefault();
    const deviceId = document.getElementById('imgDeviceId').value;
    const number = document.getElementById('imgNumber').value;
    const url = document.getElementById('imgUrl').value;
    const caption = document.getElementById('imgCaption').value;

    if (!user?.apiKey) {
        toast('Generate an API key first (API Key section)', 'error');
        return;
    }

    try {
        const params = new URLSearchParams({ deviceId, apiKey: user.apiKey, number, url });
        if (caption) params.append('caption', caption);

        const res = await fetch(`${API}/api/messages/send-image?${params}`);
        const data = await res.json();

        if (!data.success) throw new Error(data.error);

        toast(`Image sent! ID: ${data.messageId}`, 'success');
        document.getElementById('imgUrl').value = '';
        document.getElementById('imgCaption').value = '';
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ── API Key ─────────────────────────────────────────────────
function loadApiKey() {
    const container = document.getElementById('apiKeyContainer');
    if (user?.apiKey) {
        container.innerHTML = `
      <div class="api-key-display">
        <code id="apiKeyValue">${esc(user.apiKey)}</code>
        <button class="btn btn-outline btn-sm" onclick="copyApiKey()" title="Copy">📋</button>
      </div>`;
    } else {
        container.innerHTML = '<p class="text-gray text-sm">No API key generated yet.</p>';
    }
}

async function generateApiKey() {
    try {
        const res = await fetch(`${API}/auth/api-key`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        user.apiKey = data.apiKey;
        localStorage.setItem('wa_user', JSON.stringify(user));
        loadApiKey();
        toast('API key generated', 'success');
    } catch (err) {
        toast(err.message, 'error');
    }
}

function copyApiKey() {
    const key = document.getElementById('apiKeyValue')?.textContent;
    if (key) {
        navigator.clipboard.writeText(key).then(() => toast('Copied!', 'info'));
    }
}

// ── Navigation ──────────────────────────────────────────────
function switchSection(section) {
    document.querySelectorAll('.main-content > section').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const sectionMap = { devices: 'sectionDevices', sendMessage: 'sectionSendMessage', apiKey: 'sectionApiKey', docs: 'sectionDocs', plans: 'sectionPlans', admin: 'sectionAdmin' };
    document.getElementById(sectionMap[section])?.classList.remove('hidden');
    document.querySelector(`.nav-item[data-section="${section}"]`)?.classList.add('active');

    // Refresh data when switching
    if (section === 'devices') loadDevices();
    if (section === 'sendMessage') loadDevices(); // refresh selects
    if (section === 'docs') renderDocs();
    if (section === 'plans') { loadPlans(); }
    if (section === 'admin') { loadAdminUsers(); loadAdminPlans(); }

    // Close mobile sidebar and overlay
    closeSidebar();
}



// ── API Docs Renderer ───────────────────────────────────────
function renderDocs() {
    const base = window.location.origin;
    const key = user?.apiKey || 'YOUR_API_KEY';
    const keyShort = user?.apiKey ? user.apiKey.substring(0, 16) + '...' : 'Not generated';

    document.getElementById('docsBaseUrl').textContent = base;
    const docsKeyEl = document.getElementById('docsApiKey');
    if (docsKeyEl) {
        docsKeyEl.textContent = keyShort;
        docsKeyEl.title = key;
    }

    // ── Auth endpoints
    document.getElementById('docsAuthEndpoints').innerHTML = [
        {
            method: 'POST', path: '/auth/register',
            desc: 'Create a new user account',
            params: [{ n: 'email', r: true }, { n: 'password', r: true }],
            bodyType: 'json',
            example: `curl -X POST ${base}/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@example.com","password":"pass123"}'`,
            response: `{\n  "success": true,\n  "userId": 1,\n  "message": "User registered successfully"\n}`
        },
        {
            method: 'POST', path: '/auth/login',
            desc: 'Authenticate and receive a JWT token',
            params: [{ n: 'email', r: true }, { n: 'password', r: true }],
            bodyType: 'json',
            example: `curl -X POST ${base}/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@example.com","password":"pass123"}'`,
            response: `{\n  "success": true,\n  "token": "eyJhbGciOi...",\n  "user": { "id": 1, "email": "you@example.com", "apiKey": null }\n}`
        },
        {
            method: 'POST', path: '/auth/api-key',
            desc: 'Generate or regenerate your API key (JWT required)',
            params: [],
            bodyType: 'none',
            example: `curl -X POST ${base}/auth/api-key \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
            response: `{\n  "success": true,\n  "apiKey": "47928fe5dd65f94e...",\n  "message": "API key generated successfully"\n}`
        }
    ].map(renderEndpoint).join('');

    // ── Device endpoints
    document.getElementById('docsDeviceEndpoints').innerHTML = [
        {
            method: 'POST', path: '/device/create',
            desc: 'Register a new WhatsApp device and initialize the Baileys session',
            params: [{ n: 'deviceId', r: true }, { n: 'sessionName', r: false }],
            bodyType: 'json',
            example: `curl -X POST ${base}/device/create \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"deviceId":"918919007019","sessionName":"My Phone"}'`,
            response: `{\n  "success": true,\n  "deviceId": "918919007019",\n  "sessionName": "My Phone",\n  "status": "pending",\n  "message": "Device created. Scan QR code to connect."\n}`
        },
        {
            method: 'GET', path: '/device/qr',
            desc: 'Get the QR code image (base64 PNG) for pairing',
            params: [{ n: 'deviceId', r: true, q: true }],
            bodyType: 'none',
            example: `curl "${base}/device/qr?deviceId=918919007019" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
            response: `{\n  "success": true,\n  "qr": "data:image/png;base64,..."\n}`
        },
        {
            method: 'GET', path: '/device/status',
            desc: 'Check the connection status of a device',
            params: [{ n: 'deviceId', r: true, q: true }],
            bodyType: 'none',
            example: `curl "${base}/device/status?deviceId=918919007019" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
            response: `{\n  "success": true,\n  "deviceId": "918919007019",\n  "status": "connected"\n}`
        },
        {
            method: 'GET', path: '/device/list',
            desc: 'List all devices belonging to the authenticated user',
            params: [],
            bodyType: 'none',
            example: `curl "${base}/device/list" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
            response: `{\n  "success": true,\n  "devices": [\n    { "device_id": "918919007019", "session_name": "My Phone", "status": "connected" }\n  ]\n}`
        }
    ].map(renderEndpoint).join('');

    // ── Message endpoints (live key + base URL)
    document.getElementById('docsMessageEndpoints').innerHTML = [
        {
            method: 'GET', path: '/api/messages/send-text',
            desc: 'Send a text message to a WhatsApp number',
            params: [
                { n: 'deviceId', r: true, q: true },
                { n: 'apiKey', r: true, q: true },
                { n: 'number', r: true, q: true },
                { n: 'message', r: true, q: true }
            ],
            bodyType: 'none',
            example: `${base}/api/messages/send-text?deviceId=918919007019&apiKey=${key}&number=919704107158&message=Hello`,
            exampleLabel: 'full url',
            response: `{\n  "success": true,\n  "messageId": "ABCD1234",\n  "status": "sent",\n  "error": null\n}`
        },
        {
            method: 'GET', path: '/api/messages/send-file',
            desc: 'Send a PDF document via HTTPS URL',
            params: [
                { n: 'deviceId', r: true, q: true },
                { n: 'apiKey', r: true, q: true },
                { n: 'number', r: true, q: true },
                { n: 'url', r: true, q: true },
                { n: 'fileName', r: true, q: true }
            ],
            bodyType: 'none',
            example: `${base}/api/messages/send-file?deviceId=918919007019&apiKey=${key}&number=919704107158&url=https://pdf.domain.com/file.pdf&fileName=file.pdf`,
            exampleLabel: 'full url',
            response: `{\n  "success": true,\n  "messageId": "XYZ98765",\n  "status": "sent",\n  "error": null\n}`
        },
        {
            method: 'GET', path: '/api/messages/send-image',
            desc: 'Send an image via HTTPS URL',
            params: [
                { n: 'deviceId', r: true, q: true },
                { n: 'apiKey', r: true, q: true },
                { n: 'number', r: true, q: true },
                { n: 'url', r: true, q: true },
                { n: 'caption', r: false, q: true }
            ],
            bodyType: 'none',
            example: `${base}/api/messages/send-image?deviceId=918919007019&apiKey=${key}&number=919704107158&url=https://domain.com/img.jpg&caption=Hello`,
            exampleLabel: 'full url',
            response: `{\n  "success": true,\n  "messageId": "IMG12345",\n  "status": "sent",\n  "error": null\n}`
        }
    ].map(renderEndpoint).join('');
}

function renderEndpoint(ep) {
    const methodClass = ep.method === 'GET' ? 'docs-method-get' : 'docs-method-post';
    const paramsHtml = ep.params.length > 0 ? `
    <div class="docs-params">
      <div class="docs-params-title">${ep.params[0]?.q ? 'Query' : 'Body'} Parameters</div>
      ${ep.params.map(p => `<span class="docs-param">${p.n}${p.r ? ' <span class="docs-param-required">*</span>' : ''}</span>`).join('')}
    </div>` : '';

    const label = ep.exampleLabel || 'curl';
    const uid = 'ex-' + Math.random().toString(36).substring(2, 8);

    return `
    <div class="docs-endpoint">
      <div class="docs-endpoint-header">
        <span class="docs-method ${methodClass}">${ep.method}</span>
        <span class="docs-path">${ep.path}</span>
      </div>
      <div class="docs-desc">${ep.desc}</div>
      ${paramsHtml}
      <div class="docs-response-label">Example (${label})</div>
      <div class="docs-example-block" id="${uid}">
        <button class="docs-copy-btn" onclick="copyDocBlock('${uid}')">Copy</button>${escHtml(ep.example)}</div>
      <div class="docs-response-label">Response</div>
      <div class="docs-example-block"><span class="hl-str">${escHtml(ep.response)}</span></div>
    </div>`;
}

function copyDocBlock(id) {
    const text = document.getElementById(id)?.textContent?.replace('Copy', '').trim();
    if (text) navigator.clipboard.writeText(text).then(() => toast('Copied!', 'info'));
}

function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Modals ──────────────────────────────────────────────────
function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.add('hidden');
        stopQrPolling();
    }
});

// ── Toasts ──────────────────────────────────────────────────
function toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3500);
}

// ── Helpers ─────────────────────────────────────────────────
function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// ── Admin Panel ─────────────────────────────────────────────────
async function loadAdminUsers() {
    try {
        const res = await fetch(`${API}/admin/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const container = document.getElementById('adminUserList');
        if (!data.users || data.users.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No users found.</p></div>';
            return;
        }

        container.innerHTML = `
            <table class="docs-table" style="width:100%">
                <thead>
                    <tr>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Devices</th>
                        <th>Msg Today</th>
                        <th>Trial Expires</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.users.map(u => `
                        <tr>
                            <td style="font-weight:600;font-size:.85rem">${esc(u.email)}</td>
                            <td><span class="badge ${u.role === 'admin' ? 'badge-green' : 'badge-yellow'}">${u.role}</span></td>
                            <td>${u.device_count} / ${u.device_limit}</td>
                            <td>${u.messages_sent_today} / ${u.message_limit}</td>
                            <td style="font-size:.8rem">${u.trial_expires_at ? new Date(u.trial_expires_at).toLocaleDateString() : '∞'}</td>
                            <td><span class="badge ${u.is_active ? 'badge-green' : 'badge-red'}">${u.is_active ? 'Active' : 'Disabled'}</span></td>
                            <td style="display:flex;gap:.3rem">
                                <button class="btn btn-outline btn-sm" onclick="openEditUser(${u.id})" title="Edit">✏️</button>
                                ${u.role !== 'admin' ? `<button class="btn btn-red btn-sm" onclick="adminDeleteUser(${u.id})" title="Delete">🗑️</button>` : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function openEditUser(userId) {
    try {
        const res = await fetch(`${API}/admin/users/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const u = data.user;
        document.getElementById('editUserId').value = u.id;
        document.getElementById('editUserEmail').value = u.email;
        document.getElementById('editUserRole').value = u.role;
        document.getElementById('editDeviceLimit').value = u.device_limit;
        document.getElementById('editMessageLimit').value = u.message_limit;
        document.getElementById('editIsActive').value = u.is_active ? '1' : '0';

        // Format datetime-local
        if (u.trial_expires_at) {
            const dt = new Date(u.trial_expires_at);
            document.getElementById('editTrialExpiry').value = dt.toISOString().slice(0, 16);
        } else {
            document.getElementById('editTrialExpiry').value = '';
        }

        document.getElementById('editUserModal').classList.remove('hidden');
    } catch (err) {
        toast(err.message, 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('editUserForm')?.addEventListener('submit', handleEditUser);
});

async function handleEditUser(e) {
    e.preventDefault();
    const userId = document.getElementById('editUserId').value;

    const body = {
        role: document.getElementById('editUserRole').value,
        deviceLimit: parseInt(document.getElementById('editDeviceLimit').value),
        messageLimit: parseInt(document.getElementById('editMessageLimit').value),
        isActive: document.getElementById('editIsActive').value === '1',
    };

    const expiryVal = document.getElementById('editTrialExpiry').value;
    body.trialExpiresAt = expiryVal ? new Date(expiryVal).toISOString() : null;

    try {
        const res = await fetch(`${API}/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        toast('User updated successfully', 'success');
        closeModal('editUserModal');
        loadAdminUsers();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function adminDeleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user and ALL their data?')) return;

    try {
        const res = await fetch(`${API}/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        toast('User deleted', 'success');
        loadAdminUsers();
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ── Plans ───────────────────────────────────────────────────
async function loadPlans() {
    try {
        const res = await fetch(`${API}/plans/list`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const container = document.getElementById('planCards');

        // Show current plan info
        const userRes = await fetch(`${API}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => null);

        let currentUser = null;
        if (userRes && userRes.ok) {
            const userData = await userRes.json();
            if (userData.success) currentUser = userData.user;
        }

        if (currentUser && currentUser.current_plan_id) {
            const planCard = document.getElementById('currentPlanCard');
            planCard.style.display = '';
            const expiry = currentUser.plan_expires_at ? new Date(currentUser.plan_expires_at) : null;
            const daysLeft = expiry ? Math.max(0, Math.ceil((expiry - Date.now()) / 86400000)) : 0;
            document.getElementById('currentPlanInfo').innerHTML = `
                <div style="padding:1rem;display:flex;gap:2rem;flex-wrap:wrap;align-items:center">
                    <div><strong>Devices:</strong> ${currentUser.device_limit}</div>
                    <div><strong>Messages/day:</strong> ${currentUser.message_limit}</div>
                    <div><strong>Expires:</strong> ${expiry ? expiry.toLocaleDateString() : 'Never'}</div>
                    <div><span class="badge ${daysLeft > 7 ? 'badge-green' : daysLeft > 0 ? 'badge-yellow' : 'badge-red'}">${daysLeft > 0 ? daysLeft + ' days left' : 'Expired'}</span></div>
                </div>`;
        } else {
            document.getElementById('currentPlanCard').style.display = 'none';
        }

        if (!data.plans || data.plans.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="icon">💎</div><p>No plans available yet.</p></div>';
            return;
        }

        container.innerHTML = data.plans.map((p, i) => {
            const isPopular = i === Math.floor(data.plans.length / 2);
            return `
            <div class="plan-card ${isPopular ? 'plan-popular' : ''}">
                ${isPopular ? '<div class="plan-badge">Most Popular</div>' : ''}
                <h3 class="plan-name">${esc(p.name)}</h3>
                <p class="plan-desc">${esc(p.description || '')}</p>
                <div class="plan-price">₹${p.price}<span>/for ${p.duration_days} days</span></div>
                <ul class="plan-features">
                    <li>📱 ${p.device_limit} Devices</li>
                    <li>✉️ ${p.message_limit} Messages/day</li>
                    <li>📅 ${p.duration_days} Days validity</li>
                </ul>
                <button class="btn btn-primary plan-btn" onclick="buyPlan(${p.id})">Buy Now</button>
            </div>`;
        }).join('');
    } catch (err) {
        toast(err.message, 'error');
    }
}

function buyPlan(planId) {
    document.getElementById('contactAdminModal').classList.remove('hidden');
}

// ── Admin Plans ─────────────────────────────────────────────
function toggleCreatePlan() {
    document.getElementById('createPlanForm').classList.toggle('hidden');
}

async function handleCreatePlan(e) {
    e.preventDefault();
    try {
        const body = {
            name: document.getElementById('newPlanName').value,
            description: document.getElementById('newPlanDesc').value,
            price: parseFloat(document.getElementById('newPlanPrice').value),
            durationDays: parseInt(document.getElementById('newPlanDuration').value),
            deviceLimit: parseInt(document.getElementById('newPlanDevices').value),
            messageLimit: parseInt(document.getElementById('newPlanMessages').value),
        };

        const res = await fetch(`${API}/plans/create`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        toast('Plan created!', 'success');
        toggleCreatePlan();
        // Clear form
        ['newPlanName', 'newPlanDesc', 'newPlanPrice'].forEach(id => document.getElementById(id).value = '');
        loadAdminPlans();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function loadAdminPlans() {
    try {
        const res = await fetch(`${API}/plans/all`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const container = document.getElementById('adminPlanList');
        if (!data.plans || data.plans.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No plans created yet. Click "+ New Plan" above.</p></div>';
            return;
        }

        container.innerHTML = `
            <table class="docs-table" style="width:100%">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Price</th>
                        <th>Duration</th>
                        <th>Devices</th>
                        <th>Msg/Day</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.plans.map(p => `
                        <tr>
                            <td style="font-weight:600">${esc(p.name)}</td>
                            <td>₹${p.price}</td>
                            <td>${p.duration_days}d</td>
                            <td>${p.device_limit}</td>
                            <td>${p.message_limit}</td>
                            <td><span class="badge ${p.is_active ? 'badge-green' : 'badge-red'}">${p.is_active ? 'Active' : 'Hidden'}</span></td>
                            <td>
                                <div style="display:flex;gap:.25rem">
                                    <button class="btn btn-outline btn-sm" onclick="openEditPlanModal(${p.id})">✏️ Edit</button>
                                    <button class="btn btn-outline btn-sm" onclick="togglePlanActive(${p.id}, ${p.is_active})">${p.is_active ? '🚫 Hide' : '✅ Show'}</button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function togglePlanActive(planId, currentState) {
    try {
        const res = await fetch(`${API}/plans/${planId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ isActive: !currentState })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        toast(`Plan ${currentState ? 'hidden' : 'shown'}`, 'success');
        loadAdminPlans();
    } catch (err) {
        toast(err.message, 'error');
    }
}


