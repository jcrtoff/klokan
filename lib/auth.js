const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRATION_DAYS = 30;
const OTP_EXPIRATION_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
const OTP_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

// In-memory OTP attempt throttling (email -> { count, firstAttempt })
const otpAttempts = new Map();

// ── OTP Generation ──────────────────────────────────────────────────────────

async function createOtpCode(email) {
  const code = String(crypto.randomInt(100000, 999999));
  const hash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000);

  await prisma.otpCode.create({
    data: { email: email.toLowerCase(), code: hash, expiresAt }
  });

  return code;
}

// ── OTP Verification ────────────────────────────────────────────────────────

function checkThrottle(email) {
  const key = email.toLowerCase();
  const entry = otpAttempts.get(key);
  if (!entry) return true;
  if (Date.now() - entry.firstAttempt > OTP_ATTEMPT_WINDOW_MS) {
    otpAttempts.delete(key);
    return true;
  }
  return entry.count < MAX_OTP_ATTEMPTS;
}

function recordFailedAttempt(email) {
  const key = email.toLowerCase();
  const entry = otpAttempts.get(key);
  if (!entry || Date.now() - entry.firstAttempt > OTP_ATTEMPT_WINDOW_MS) {
    otpAttempts.set(key, { count: 1, firstAttempt: Date.now() });
  } else {
    entry.count++;
  }
}

function clearAttempts(email) {
  otpAttempts.delete(email.toLowerCase());
}

async function verifyOtpCode(email, code) {
  const emailLower = email.toLowerCase();

  if (!checkThrottle(emailLower)) {
    return { error: 'Trop de tentatives. Réessayez dans quelques minutes.', status: 429 };
  }

  const otps = await prisma.otpCode.findMany({
    where: {
      email: emailLower,
      used: false,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: 'desc' }
  });

  for (const otp of otps) {
    const valid = await bcrypt.compare(code, otp.code);
    if (valid) {
      await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });
      clearAttempts(emailLower);
      return { valid: true };
    }
  }

  recordFailedAttempt(emailLower);
  return { error: 'Code invalide ou expiré.', status: 401 };
}

// ── Broker Lookup ────────────────────────────────────────────────────────────

async function isAuthorizedBroker(email) {
  const broker = await prisma.broker.findUnique({
    where: { email: email.toLowerCase() },
    select: { authorized: true }
  });
  return broker?.authorized === true;
}

async function getBroker(email) {
  const emailLower = email.toLowerCase();
  const broker = await prisma.broker.findUnique({ where: { email: emailLower } });
  if (!broker || !broker.authorized) return null;
  await prisma.broker.update({ where: { id: broker.id }, data: { lastLogin: new Date() } });
  return broker;
}

// ── Auth Middleware ──────────────────────────────────────────────────────────

function requireRole(...roles) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Non authentifié.' });
    }
    const broker = await getBrokerFromToken(authHeader.slice(7));
    if (!broker || !broker.authorized) {
      return res.status(401).json({ error: 'Non authentifié.' });
    }
    if (!roles.includes(broker.role)) {
      return res.status(403).json({ error: 'Accès non autorisé.' });
    }
    req.broker = broker;
    next();
  };
}

// ── Admin Seeding ────────────────────────────────────────────────────────────

async function ensureAdminsExist() {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return;
  const emails = raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  for (const email of emails) {
    await prisma.broker.upsert({
      where: { email },
      update: { authorized: true, role: 'admin' },
      create: { email, name: email.split('@')[0], role: 'admin', authorized: true }
    });
  }
}

// ── JWT ─────────────────────────────────────────────────────────────────────

function createAccessToken(broker) {
  return jwt.sign(
    { sub: broker.id, name: broker.name, role: broker.role },
    JWT_SECRET,
    { expiresIn: `${JWT_EXPIRATION_DAYS}d` }
  );
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

async function getBrokerFromToken(token) {
  const payload = verifyAccessToken(token);
  if (!payload) return null;
  return prisma.broker.findUnique({ where: { id: payload.sub } });
}

// ── Brevo Email ─────────────────────────────────────────────────────────────

async function sendOtpEmail(email, code) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.log(`[DEV] OTP for ${email}: ${code}`);
    return;
  }

  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: {
          name: process.env.BREVO_SENDER_NAME || 'RodCast',
          email: process.env.BREVO_SENDER_EMAIL || 'noreply@rodcast.ca'
        },
        to: [{ email }],
        subject: 'Votre code de connexion RodCast',
        htmlContent: `<p>Votre code de vérification: <strong>${code}</strong></p><p>Ce code expire dans ${OTP_EXPIRATION_MINUTES} minutes.</p>`
      })
    });

    if (!resp.ok) {
      console.warn(`Brevo API error ${resp.status} for ${email}:`, await resp.text());
    }
  } catch (err) {
    console.warn(`Brevo request failed for ${email}:`, err.message);
  }
}

module.exports = {
  createOtpCode,
  verifyOtpCode,
  isAuthorizedBroker,
  getBroker,
  requireRole,
  ensureAdminsExist,
  createAccessToken,
  verifyAccessToken,
  getBrokerFromToken,
  sendOtpEmail
};
