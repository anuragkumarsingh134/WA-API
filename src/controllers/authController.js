const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { dbGet, dbRun } = require('../config/db');

const SALT_ROUNDS = 10;

/**
 * POST /auth/register
 * Body: { email, password }
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

        // Check if user already exists
        const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
        if (existing) {
            return res.status(400).json({ success: false, error: 'Email already registered' });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const result = await dbRun('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, passwordHash]);

        return res.status(201).json({
            success: true,
            userId: result.lastID,
            message: 'User registered successfully',
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

        const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        return res.json({
            success: true,
            token,
            user: { id: user.id, email: user.email, apiKey: user.api_key || null },
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * POST /auth/api-key
 * Requires JWT. Generates or regenerates a 32-byte (64-char hex) API key.
 */
async function generateApiKey(req, res) {
    try {
        const userId = req.user.id;
        const apiKey = crypto.randomBytes(32).toString('hex');

        await dbRun('UPDATE users SET api_key = ? WHERE id = ?', [apiKey, userId]);

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
