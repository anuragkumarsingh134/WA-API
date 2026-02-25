/* ── WhatsApp API Dashboard — App Logic ────────────────────── */

const API = window.location.origin;
let token = localStorage.getItem('wa_token');
let user = JSON.parse(localStorage.getItem('wa_user') || 'null');
let qrInterval = null;

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
});

// ── Auth ────────────────────────────────────────────────────
function showAuth() {
    document.getElementById('authPage').classList.remove('hidden');
    document.getElementById('dashboardPage').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('authPage').classList.add('hidden');
    document.getElementById('dashboardPage').classList.remove('hidden');
    document.getElementById('userEmail').textContent = user?.email || '';
    loadDevices();
    loadApiKey();
    renderDocs();
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
          ${d.status !== 'connected' ? `<button class="btn btn-primary btn-sm" onclick="showQR('${esc(d.device_id)}')">QR</button>` : ''}
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

    const sectionMap = { devices: 'sectionDevices', sendMessage: 'sectionSendMessage', apiKey: 'sectionApiKey', docs: 'sectionDocs' };
    document.getElementById(sectionMap[section])?.classList.remove('hidden');
    document.querySelector(`.nav-item[data-section="${section}"]`)?.classList.add('active');

    // Refresh data when switching
    if (section === 'devices') loadDevices();
    if (section === 'sendMessage') loadDevices(); // refresh selects
    if (section === 'docs') renderDocs();

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// ── API Docs Renderer ───────────────────────────────────────
function renderDocs() {
    const base = window.location.origin;
    const key = user?.apiKey || 'YOUR_API_KEY';
    const keyShort = user?.apiKey ? user.apiKey.substring(0, 16) + '...' : 'Not generated';

    document.getElementById('docsBaseUrl').textContent = base;
    const docsKeyEl = document.getElementById('docsApiKey');
    docsKeyEl.textContent = keyShort;
    docsKeyEl.title = key;

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
