require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { initializeDatabase } = require('./config/db');
const { restoreAllSessions } = require('./services/whatsappService');

const authRoutes = require('./routes/authRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const messageRoutes = require('./routes/messageRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Rate limiter: 60 requests per minute per IP
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests. Please try again later.' },
});
app.use(limiter);

// ── Routes ──────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/device', deviceRoutes);
app.use('/api/messages', messageRoutes);

// Health check
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'WhatsApp Multi-Session API is running',
        version: '1.0.0',
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

// ── Start ───────────────────────────────────────────────────
async function start() {
    try {
        // Initialize database (synchronous with better-sqlite3)
        initializeDatabase();

        // Start HTTP server
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });

        // Restore WhatsApp sessions after a short delay
        setTimeout(async () => {
            await restoreAllSessions();
        }, 2000);
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

start();
