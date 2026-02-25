const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { dbGet, dbRun, dbAll } = require('../config/db');

const SALT_ROUNDS = 10;

/**
 * POST /auth/register
 * Body: { email, password }
 * First user becomes admin with unlimited access.
 */
async function register(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
        }

        const existing = dbGet('SELECT id FROM users WHERE email = ?', [email]);
        if (existing) {
            return res.status(400).json({ success: false, error: 'Email already registered' });
        }

        // Check if this is the first user — make them admin
        const userCount = dbGet('SELECT COUNT(*) as count FROM users', []);
        const isFirstUser = userCount.count === 0;

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // Set trial expiry: admin = null (unlimited), user = 7 days from now
        const trialExpiry = isFirstUser ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const role = isFirstUser ? 'admin' : 'user';
        const deviceLimit = isFirstUser ? 999 : 3;
        const messageLimit = isFirstUser ? 999999 : 100;

        const result = dbRun(
            `INSERT INTO users (email, password_hash, role, device_limit, message_limit, trial_expires_at) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [email, passwordHash, role, deviceLimit, messageLimit, trialExpiry]
        );

        return res.status(201).json({
            success: true,
            userId: result.lastID,
            role,
            message: isFirstUser
                ? 'Admin account created successfully'
                : 'User registered successfully. Trial period: 7 days.',
        });
    } catch (err) {
        console.error('Register error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * POST /auth/login
 * Body: { email, password }
 */
async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password are required' });
        }

        const user = dbGet('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }

        // Check if account is active
        if (!user.is_active) {
            return res.status(403).json({ success: false, error: 'Account has been disabled. Contact admin.' });
        }

        // Check trial expiry (admin has null trial_expires_at = unlimited)
        if (user.trial_expires_at && new Date(user.trial_expires_at) < new Date()) {
            return res.status(403).json({ success: false, error: 'Trial period has expired. Contact admin to extend.' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        return res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                apiKey: user.api_key || null,
                deviceLimit: user.device_limit,
                messageLimit: user.message_limit,
                trialExpiresAt: user.trial_expires_at,
            },
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * POST /auth/api-key
 * Requires JWT. Generates or regenerates a 16-byte (32-char hex) API key.
 */
async function generateApiKey(req, res) {
    try {
        const userId = req.user.id;
        const apiKey = crypto.randomBytes(16).toString('hex');

        dbRun('UPDATE users SET api_key = ? WHERE id = ?', [apiKey, userId]);

        return res.json({
            success: true,
            apiKey,
            message: 'API key generated successfully',
        });
    } catch (err) {
        console.error('API key generation error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

module.exports = { register, login, generateApiKey };
