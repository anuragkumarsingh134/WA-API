# 💬 WhatsApp Multi-Session API

A lightweight, self-hosted WhatsApp API built with **Node.js**, **Baileys**, and **SQLite**. Manage multiple WhatsApp sessions, send text & PDF messages via simple GET endpoints, and control everything from a modern dashboard UI.

---

## ✨ Features

- **Multi-Session Support** — Connect and manage multiple WhatsApp numbers simultaneously
- **Dashboard UI** — Beautiful single-page application with device management, messaging, and API docs
- **Legacy GET Endpoints** — Send text and PDF messages via simple URL query parameters
- **QR Code Pairing** — Scan QR codes directly from the dashboard to connect devices
- **JWT Authentication** — Secure login and registration system
- **API Key System** — Per-user API keys for message endpoints
- **Profile Photo Viewer** — View WhatsApp profile photos for connected devices
- **Device Management** — Create, view status, and delete devices with full data cleanup
- **Auto-Reconnect** — Automatic session restoration on server restart
- **Rate Limiting** — Built-in protection (60 requests/min)
- **Interactive API Docs** — In-app documentation with live examples and your domain/API key auto-filled
- **SQLite Storage** — Zero-config database, auto-created on first run

---

## 📁 Project Structure

```
├── public/                  # Frontend dashboard
│   ├── index.html           # Single-page application
│   ├── css/style.css        # Design system
│   └── js/app.js            # Frontend logic
├── src/
│   ├── server.js            # Express entry point
│   ├── config/db.js         # SQLite setup & helpers
│   ├── middleware/
│   │   ├── authMiddleware.js    # JWT verification
│   │   └── apiKeyMiddleware.js  # API key validation
│   ├── controllers/
│   │   ├── authController.js    # Register, login, API key
│   │   ├── deviceController.js  # CRUD + QR + profile photo
│   │   └── messageController.js # Send text & PDF
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── deviceRoutes.js
│   │   └── messageRoutes.js
│   └── services/
│       ├── sessionManager.js    # In-memory session store
│       └── whatsappService.js   # Baileys integration
├── .env.example             # Environment template
├── package.json
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18+ 
- **npm** v9+

### 1. Clone the repository

```bash
git clone https://github.com/anuragkumarsingh134/WA-API.git
cd WA-API
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
PORT=3000
JWT_SECRET=your_strong_secret_here
```

### 4. Start the server

```bash
npm start
```

Open **http://localhost:3000** in your browser.

### 5. First-time setup

1. **Register** an account on the login page
2. **Create a device** — enter your WhatsApp phone number
3. **Scan the QR code** with WhatsApp → Linked Devices
4. **Generate an API key** from the API Key section
5. Start sending messages!

---

## 📡 API Reference

### Authentication (Public)

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | `{ email, password }` | Create account |
| POST | `/auth/login` | `{ email, password }` | Login → JWT token |
| POST | `/auth/api-key` | — | Generate API key *(JWT required)* |

### Devices (JWT Required)

| Method | Endpoint | Params | Description |
|--------|----------|--------|-------------|
| POST | `/device/create` | `{ deviceId, sessionName }` | Create device |
| GET | `/device/qr` | `?deviceId=xxx` | Get QR code (base64) |
| GET | `/device/status` | `?deviceId=xxx` | Check status |
| GET | `/device/list` | — | List all devices |
| GET | `/device/profile-photo` | `?deviceId=xxx` | Get profile photo |
| DELETE | `/device/delete` | `?deviceId=xxx` | Delete device & data |

### Messages (API Key Required — Legacy GET)

#### Send Text
```
GET /api/messages/send-text?deviceId=YOUR_DEVICE&apiKey=YOUR_KEY&number=919704107158&message=Hello
```

#### Send PDF
```
GET /api/messages/send-file?deviceId=YOUR_DEVICE&apiKey=YOUR_KEY&number=919704107158&url=https://example.com/file.pdf&fileName=doc.pdf
```

### Error Codes

| Status | Meaning |
|--------|---------|
| 400 | Invalid or missing parameters |
| 401 | Invalid API key or expired JWT |
| 403 | Device not owned by API key holder |
| 404 | Device not found or not connected |
| 429 | Rate limit exceeded (60 req/min) |
| 500 | Internal server error |

---

## 🖥️ Production Deployment (Ubuntu/Linux)

### Using PM2

```bash
# Install PM2 globally
npm install -g pm2

# Clone and setup
git clone https://github.com/anuragkumarsingh134/WA-API.git
cd WA-API
npm install
cp .env.example .env
nano .env  # Set your JWT_SECRET and PORT

# Start with PM2
pm2 start src/server.js --name wa-api
pm2 save
pm2 startup  # Auto-start on reboot
```

### Using systemd

```bash
sudo nano /etc/systemd/system/wa-api.service
```

```ini
[Unit]
Description=WhatsApp API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/WA-API
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable wa-api
sudo systemctl start wa-api
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### SSL with Certbot

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 🔧 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `JWT_SECRET` | — | Secret key for JWT tokens *(required)* |
| `DB_HOST` | `localhost` | Database host |
| `DB_USER` | `root` | Database user |
| `DB_PASS` | `password` | Database password |
| `DB_NAME` | `whatsapp_api` | Database name |

---

## 📝 License

MIT
