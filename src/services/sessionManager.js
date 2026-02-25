/**
 * In-memory session manager for Baileys WhatsApp sockets.
 * Sessions keyed by deviceId.
 */

const sessions = new Map();
const qrCodes = new Map();

function getSession(deviceId) {
    return sessions.get(deviceId) || null;
}

function setSession(deviceId, socket) {
    sessions.set(deviceId, socket);
}

function removeSession(deviceId) {
    sessions.delete(deviceId);
    qrCodes.delete(deviceId);
}

function hasSession(deviceId) {
    return sessions.has(deviceId);
}

function getAllSessionIds() {
    return Array.from(sessions.keys());
}

function setQR(deviceId, qr) {
    qrCodes.set(deviceId, qr);
}

function getQR(deviceId) {
    return qrCodes.get(deviceId) || null;
}

function clearQR(deviceId) {
    qrCodes.delete(deviceId);
}

module.exports = {
    getSession,
    setSession,
    removeSession,
    hasSession,
    getAllSessionIds,
    setQR,
    getQR,
    clearQR
};
