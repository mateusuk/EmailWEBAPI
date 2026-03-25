require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sgMail = require('@sendgrid/mail');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Settings
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'support@drivecore.co.uk';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const EMAIL_API_KEY = process.env.EMAIL_API_KEY || '';

const ALLOWED_ORIGINS = [
  FRONTEND_URL,
  'https://drivecore.co.uk',
  'https://www.drivecore.co.uk',
  'https://drivecore-4ae46.web.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-API-Key'],
}));
app.use(express.json({ limit: '100kb' }));

// API key authentication middleware
function requireApiKey(req, res, next) {
  if (!EMAIL_API_KEY) {
    return next();
  }
  const key = req.headers['x-api-key'];
  if (key !== EMAIL_API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

// Rate limiting: 20 requests per minute per IP for email endpoints
const emailLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
});

// HTML escaping to prevent injection in email templates
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Validate that a URL belongs to trusted domains
const TRUSTED_DOMAINS = [
  'drivecore.co.uk',
  'www.drivecore.co.uk',
  'drivecore-4ae46.web.app',
  'drivecore-4ae46.firebaseapp.com',
  'localhost',
];

function isAllowedUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return TRUSTED_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

// Temporary token storage (in production, use a database)
const verificationTokens = new Map();

// Shared verification email sender (deduplicates send-verification and resend-verification)
async function sendVerificationEmailHandler(req, res) {
  try {
    const { email, userId, callbackUrl } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    let verificationUrl;

    if (callbackUrl && (callbackUrl.includes('oobCode=') || callbackUrl.includes('mode=verifyEmail'))) {
      verificationUrl = callbackUrl;
    } else if (callbackUrl && isAllowedUrl(callbackUrl)) {
      const token = uuidv4();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      verificationTokens.set(token, { email, userId: userId || null, expiresAt, verified: false });
      verificationUrl = `${callbackUrl}?token=${token}`;
    } else {
      const token = uuidv4();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      verificationTokens.set(token, { email, userId: userId || null, expiresAt, verified: false });
      verificationUrl = `${FRONTEND_URL}/verify?token=${token}`;
    }

    const msg = {
      to: email,
      from: { email: SENDER_EMAIL, name: 'DriveCore' },
      subject: 'Verify your email address',
      text: `Hello!\n\nClick the link below to verify your email:\n${verificationUrl}\n\nThis link expires in 24 hours.\n\nIf you did not request this verification, please ignore this email.`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email - DriveCore</title>
</head>
<body style="margin: 0; padding: 0; background: linear-gradient(135deg, #0C1220 0%, #1E3A8A 100%); min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #0C1220 0%, #1E3A8A 100%); padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background: #ffffff; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4); overflow: hidden;">
          <tr>
            <td bgcolor="#1E293B" style="background: linear-gradient(135deg, #0C1220 0%, #1E293B 50%, #1E3A8A 100%); background-color: #1E293B; padding: 40px 32px 32px; text-align: center;">
              <img src="https://drivecore-4ae46.web.app/email/icon.png" alt="DriveCore" width="80" height="80" style="display: block; margin: 0 auto; border-radius: 18px;" />
              <div style="height: 20px;"></div>
              <h1 style="margin: 0; font-size: 26px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">Verify Your Email</h1>
              <p style="margin: 8px 0 0; font-size: 15px; color: rgba(255,255,255,0.85);">DriveCore Vehicle Tracking</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 32px 40px;">
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #334155;">We're almost there! Click the button below to confirm your email address and activate your account.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" align="center">
                      <tr>
                        <td align="center" bgcolor="#2563EB" style="border-radius: 12px; padding: 16px 40px; background-color: #2563EB;">
                          <a href="${verificationUrl}" style="color: #ffffff !important; font-size: 16px; font-weight: 600; text-decoration: none;">Verify Email</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <div style="background: #F8FAFC; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 8px; font-size: 12px; color: #64748B; font-weight: 600;">Or copy this link:</p>
                <a href="${verificationUrl}" style="font-size: 13px; color: #1E40AF; word-break: break-all; text-decoration: underline;">${verificationUrl}</a>
              </div>
              <p style="margin: 0; font-size: 13px; color: #94A3B8;">This link expires in 24 hours.</p>
              <p style="margin: 8px 0 0; font-size: 13px; color: #94A3B8;">If you didn't request this, please ignore this email.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px; background: #F8FAFC; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: #64748B;">— DriveCore Team</p>
              <p style="margin: 4px 0 0; font-size: 12px; color: #94A3B8;">Smart vehicle tracking</p>
              <p style="margin: 8px 0 0; font-size: 11px; color: #94A3B8;">Company No. 16750234 · ICO Registered under UK GDPR - ZC093182 · VAT GB510012376</p>
              <p style="margin: 12px 0 0; font-size: 12px;">
                <a href="https://drivecore.co.uk/privacy-policy" style="color: #1E40AF; text-decoration: underline;">Privacy Policy</a>
                <span style="color: #94A3B8;"> · </span>
                <a href="https://drivecore.co.uk/terms" style="color: #1E40AF; text-decoration: underline;">Terms of Service</a>
              </p>
              <p style="margin: 8px 0 0; font-size: 11px; color: #94A3B8;">&copy; ${new Date().getFullYear()} DRIVECORE LTD. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `
    };

    await sgMail.send(msg);
    res.json({ success: true, message: 'Verification email sent successfully' });

  } catch (error) {
    console.error('Error sending verification email:', error.message);
    res.status(500).json({ success: false, error: 'Failed to send verification email' });
  }
}

app.post('/api/send-verification', requireApiKey, emailLimiter, sendVerificationEmailHandler);
app.post('/api/resend-verification', requireApiKey, emailLimiter, sendVerificationEmailHandler);

/**
 * GET /api/verify/:token
 * Verifies the token and confirms the email
 */
app.get('/api/verify/:token', (req, res) => {
  const { token } = req.params;

  const tokenData = verificationTokens.get(token);

  if (!tokenData) {
    return res.status(404).json({ 
      success: false, 
      error: 'Invalid or not found token' 
    });
  }

  if (Date.now() > tokenData.expiresAt) {
    verificationTokens.delete(token);
    return res.status(410).json({ 
      success: false, 
      error: 'Token has expired' 
    });
  }

  if (tokenData.verified) {
    return res.status(400).json({ 
      success: false, 
      error: 'Email has already been verified' 
    });
  }

  // Mark as verified
  tokenData.verified = true;
  verificationTokens.set(token, tokenData);

  res.json({ 
    success: true, 
    message: 'Email verified successfully!',
    email: tokenData.email,
    userId: tokenData.userId
  });
});

/**
 * POST /api/verify
 * Verifies the token via POST (alternative)
 * Body: { token: string }
 */
app.post('/api/verify', (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ 
      success: false, 
      error: 'Token is required' 
    });
  }

  const tokenData = verificationTokens.get(token);

  if (!tokenData) {
    return res.status(404).json({ 
      success: false, 
      error: 'Invalid or not found token' 
    });
  }

  if (Date.now() > tokenData.expiresAt) {
    verificationTokens.delete(token);
    return res.status(410).json({ 
      success: false, 
      error: 'Token has expired' 
    });
  }

  if (tokenData.verified) {
    return res.status(400).json({ 
      success: false, 
      error: 'Email has already been verified' 
    });
  }

  // Mark as verified
  tokenData.verified = true;
  verificationTokens.set(token, tokenData);

  res.json({ 
    success: true, 
    message: 'Email verified successfully!',
    email: tokenData.email,
    userId: tokenData.userId
  });
});

/**
 * GET /api/check/:token
 * Checks the status of a token without marking it as used
 */
app.get('/api/check/:token', (req, res) => {
  const { token } = req.params;

  const tokenData = verificationTokens.get(token);

  if (!tokenData) {
    return res.status(404).json({ 
      success: false, 
      error: 'Token not found' 
    });
  }

  const isExpired = Date.now() > tokenData.expiresAt;

  res.json({ 
    success: true,
    email: tokenData.email,
    verified: tokenData.verified,
    expired: isExpired,
    expiresAt: new Date(tokenData.expiresAt).toISOString()
  });
});

/**
 * POST /api/send-transfer-notification
 * Sends a tracker transfer notification email to the new owner
 * Body: { 
 *   email: string,
 *   transferId: string,
 *   trackerDetails: { imei: string, vehicleName: string, registrationNumber?: string },
 *   fromUserName?: string,
 *   subscriptionEndDate?: string
 * }
 */
app.post('/api/send-transfer-notification', requireApiKey, emailLimiter, async (req, res) => {
  try {
    const { email, transferId, trackerDetails, fromUserName } = req.body;

    if (!email || !transferId || !trackerDetails) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email, transferId, and trackerDetails are required' 
      });
    }

    const safeFromUserName = escapeHtml(fromUserName);
    const safeVehicleName = escapeHtml(trackerDetails.vehicleName || 'GPS Tracker');
    const safeRegNumber = escapeHtml(trackerDetails.registrationNumber || '');
    const safeImei = escapeHtml(trackerDetails.imei);

    const acceptUrl = `${FRONTEND_URL}/register?imei=${encodeURIComponent(trackerDetails.imei)}&transferId=${encodeURIComponent(transferId)}&email=${encodeURIComponent(email)}`;

    // Email template for tracker transfer
    const msg = {
      to: email,
      from: { email: SENDER_EMAIL, name: 'DriveCore' },
      subject: `Vehicle Tracker Transfer Request - ${safeVehicleName}`,
      text: `Hello!\n\nYou have received a vehicle tracker transfer request.\n\nVehicle: ${trackerDetails.vehicleName}\nRegistration: ${trackerDetails.registrationNumber || 'N/A'}\nTracker IMEI: ${trackerDetails.imei}\n${fromUserName ? `From: ${fromUserName}\n` : ''}\nTo get started, register your account and choose a subscription plan.\n\nClick here to get started: ${acceptUrl}\n\nIf you did not expect this transfer, please ignore this email.`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vehicle Tracker Transfer - DriveCore</title>
</head>
<body style="margin: 0; padding: 0; background: linear-gradient(135deg, #0C1220 0%, #1E3A8A 100%); min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #0C1220 0%, #1E3A8A 100%); padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background: #ffffff; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4); overflow: hidden;">
          <!-- Header with logo -->
          <tr>
            <td bgcolor="#1E293B" style="background: linear-gradient(135deg, #0C1220 0%, #1E293B 50%, #1E3A8A 100%); background-color: #1E293B; padding: 40px 32px 32px; text-align: center;">
              <img src="https://drivecore-4ae46.web.app/email/icon.png" alt="DriveCore" width="80" height="80" style="display: block; margin: 0 auto; border-radius: 18px;" />
              <div style="height: 20px;"></div>
              <h1 style="margin: 0; font-size: 26px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">Vehicle Tracker Transfer</h1>
              <p style="margin: 8px 0 0; font-size: 15px; color: rgba(255,255,255,0.85);">You've received a transfer request</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 36px 32px 40px;">
              ${safeFromUserName ? `
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #334155;"><strong>${safeFromUserName}</strong> wants to transfer a vehicle tracker to you.</p>
              ` : `
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #334155;">Someone wants to transfer a vehicle tracker to you.</p>
              `}
              <!-- Vehicle Details Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #F1F5F9; border-radius: 16px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 25px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding-bottom: 15px; border-bottom: 1px solid #E2E8F0;">
                          <span style="color: #64748B; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Vehicle Name</span>
                          <p style="margin: 5px 0 0; color: #0F172A; font-size: 20px; font-weight: 600;">${safeVehicleName}</p>
                        </td>
                      </tr>
                      ${safeRegNumber ? `
                      <tr>
                        <td style="padding: 15px 0; border-bottom: 1px solid #E2E8F0;">
                          <span style="color: #64748B; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Registration</span>
                          <p style="margin: 5px 0 0; color: #1E293B; font-size: 18px; font-weight: 500;">${safeRegNumber}</p>
                        </td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding-top: 15px;">
                          <span style="color: #64748B; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Tracker IMEI</span>
                          <p style="margin: 5px 0 0; color: #475569; font-size: 14px; font-family: monospace;">${safeImei}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <!-- Subscription Info -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #FFFBEB; border-left: 4px solid #F59E0B; border-radius: 0 12px 12px 0; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px; color: #92400E; font-size: 14px; font-weight: 600;">Subscription Information</p>
                    <p style="margin: 0; color: #78350F; font-size: 14px; line-height: 1.6;">To start using this tracker, you'll need to set up your own subscription. Simply register and choose your preferred plan.</p>
                  </td>
                </tr>
              </table>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" align="center">
                      <tr>
                        <td align="center" bgcolor="#2563EB" style="border-radius: 12px; padding: 16px 40px; background-color: #2563EB;">
                          <a href="${acceptUrl}" style="color: #ffffff !important; font-size: 16px; font-weight: 600; text-decoration: none;">Get Started</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <!-- Plain link -->
              <div style="background: #F8FAFC; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 8px; font-size: 12px; color: #64748B; font-weight: 600;">Or copy this link:</p>
                <a href="${acceptUrl}" style="font-size: 13px; color: #1E40AF; word-break: break-all; text-decoration: underline;">${acceptUrl}</a>
              </div>
              <p style="margin: 0; font-size: 13px; color: #94A3B8;">If you did not expect this transfer request, please ignore this email.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background: #F8FAFC; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: #64748B;">— DriveCore Team</p>
              <p style="margin: 4px 0 0; font-size: 12px; color: #94A3B8;">Smart vehicle tracking</p>
              <p style="margin: 8px 0 0; font-size: 11px; color: #94A3B8;">Company No. 16750234 · ICO Registered under UK GDPR - ZC093182 · VAT GB510012376</p>
              <p style="margin: 12px 0 0; font-size: 12px;">
                <a href="https://drivecore.co.uk/privacy-policy" style="color: #1E40AF; text-decoration: underline;">Privacy Policy</a>
                <span style="color: #94A3B8;"> · </span>
                <a href="https://drivecore.co.uk/terms" style="color: #1E40AF; text-decoration: underline;">Terms of Service</a>
              </p>
              <p style="margin: 8px 0 0; font-size: 11px; color: #94A3B8;">&copy; ${new Date().getFullYear()} DRIVECORE LTD. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `
    };

    await sgMail.send(msg);

    res.json({ 
      success: true, 
      message: 'Transfer notification email sent successfully'
    });

  } catch (error) {
    console.error('Error sending transfer email:', error.message);
    res.status(500).json({ success: false, error: 'Failed to send transfer notification email' });
  }
});

/**
 * POST /api/send-welcome-purchase
 * Sends a welcome email after successful purchase with verification link
 * Body: { 
 *   email: string,
 *   userId?: string,
 *   firstName: string,
 *   planName: string (e.g., "Monthly" or "Yearly"),
 *   planPrice: string (e.g., "£7.99/month"),
 *   vehicleName?: string,
 *   callbackUrl?: string
 * }
 */
app.post('/api/send-welcome-purchase', requireApiKey, emailLimiter, async (req, res) => {
  try {
    const { email, userId, firstName, planName, planPrice, vehicleName, callbackUrl } = req.body;

    if (!email || !firstName) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and firstName are required' 
      });
    }

    let verificationUrl;
    
    if (callbackUrl && (callbackUrl.includes('oobCode=') || callbackUrl.includes('firebaseapp.com') || callbackUrl.includes('mode=verifyEmail'))) {
      verificationUrl = callbackUrl;
    } else if (callbackUrl && isAllowedUrl(callbackUrl)) {
      const token = uuidv4();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      verificationTokens.set(token, { email, userId: userId || null, expiresAt, verified: false });
      verificationUrl = `${callbackUrl}?token=${token}`;
    } else {
      const token = uuidv4();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      verificationTokens.set(token, { email, userId: userId || null, expiresAt, verified: false });
      verificationUrl = `${FRONTEND_URL}/verify?token=${token}`;
    }

    const safeFirstName = escapeHtml(firstName);
    const displayPlanName = escapeHtml(planName || 'GPS Tracker');
    const displayPrice = escapeHtml(planPrice || '');
    const displayVehicle = escapeHtml(vehicleName || 'your vehicle');

    // Email template - Welcome after purchase
    const msg = {
      to: email,
      from: { email: SENDER_EMAIL, name: 'DriveCore' },
      subject: '🎉 Welcome to DriveCore - Payment Successful!',
      text: `Hello ${firstName}!\n\nThank you for your purchase! Your payment was successful.\n\nPlan: ${planName || 'GPS Tracker'}\n${planPrice ? `Price: ${planPrice}\n` : ''}\n\nBefore you can start tracking ${vehicleName || 'your vehicle'}, please verify your email address by clicking the link below:\n\n${verificationUrl}\n\nThis link expires in 24 hours.\n\nIf you have any questions, feel free to contact our support team.\n\nWelcome aboard!\nThe DriveCore Team`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to DriveCore</title>
</head>
<body style="margin: 0; padding: 0; background: linear-gradient(135deg, #0C1220 0%, #1E3A8A 100%); min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #0C1220 0%, #1E3A8A 100%); padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background: #ffffff; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4); overflow: hidden;">
          <!-- Header with logo -->
          <tr>
            <td bgcolor="#1E293B" style="background: linear-gradient(135deg, #0C1220 0%, #1E293B 50%, #1E3A8A 100%); background-color: #1E293B; padding: 40px 32px 32px; text-align: center;">
              <img src="https://drivecore-4ae46.web.app/email/icon.png" alt="DriveCore" width="80" height="80" style="display: block; margin: 0 auto; border-radius: 18px;" />
              <div style="height: 20px;"></div>
              <h1 style="margin: 0; font-size: 26px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">Payment Successful!</h1>
              <p style="margin: 8px 0 0; font-size: 15px; color: rgba(255,255,255,0.85);">Welcome to DriveCore, ${safeFirstName}!</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 32px 40px;">
              <p style="margin: 0 0 10px; font-size: 18px; line-height: 1.6; color: #0F172A; font-weight: 600;">Thank you for choosing DriveCore!</p>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #334155;">Your payment has been processed successfully and your account is almost ready. You're just one step away from tracking ${displayVehicle}!</p>
              <!-- Plan Details Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #F1F5F9; border-radius: 16px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 25px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding-bottom: 15px; border-bottom: 1px solid #E2E8F0;">
                          <span style="color: #64748B; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Your Plan</span>
                          <p style="margin: 5px 0 0; color: #0F172A; font-size: 22px; font-weight: 700;">${displayPlanName}</p>
                        </td>
                      </tr>
                      ${displayPrice ? `
                      <tr>
                        <td style="padding-top: 15px;">
                          <span style="color: #64748B; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Price</span>
                          <p style="margin: 5px 0 0; color: #2563EB; font-size: 20px; font-weight: 600;">${displayPrice}</p>
                        </td>
                      </tr>
                      ` : ''}
                    </table>
                  </td>
                </tr>
              </table>
              <!-- Verification Notice -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #EFF6FF; border-left: 4px solid #2563EB; border-radius: 0 12px 12px 0; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px; color: #1E40AF; font-size: 14px; font-weight: 600;">One more step!</p>
                    <p style="margin: 0; color: #1E3A8A; font-size: 14px; line-height: 1.6;">Please verify your email address to activate your account and start tracking.</p>
                  </td>
                </tr>
              </table>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" align="center">
                      <tr>
                        <td align="center" bgcolor="#2563EB" style="border-radius: 12px; padding: 16px 40px; background-color: #2563EB;">
                          <a href="${verificationUrl}" style="color: #ffffff !important; font-size: 16px; font-weight: 600; text-decoration: none;">Verify My Email</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <!-- Plain link -->
              <div style="background: #F8FAFC; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 8px; font-size: 12px; color: #64748B; font-weight: 600;">Or copy this link:</p>
                <a href="${verificationUrl}" style="font-size: 13px; color: #1E40AF; word-break: break-all; text-decoration: underline;">${verificationUrl}</a>
              </div>
              <!-- What's Next -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #F8FAFC; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 15px; color: #0F172A; font-size: 14px; font-weight: 600;">What's next?</p>
                    <ol style="margin: 0; padding-left: 20px; color: #475569; font-size: 14px; line-height: 1.8;">
                      <li>Click the button above to verify your email</li>
                      <li>Log in to your DriveCore account</li>
                      <li>Your GPS tracker is ready to use!</li>
                      <li>Start tracking your vehicle in real-time</li>
                    </ol>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 13px; color: #94A3B8;">This verification link expires in 24 hours.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background: #F8FAFC; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: #64748B;">— DriveCore Team</p>
              <p style="margin: 4px 0 0; font-size: 12px; color: #94A3B8;">Smart vehicle tracking</p>
              <p style="margin: 8px 0 0; font-size: 11px; color: #94A3B8;">Company No. 16750234 · ICO Registered under UK GDPR - ZC093182 · VAT GB510012376</p>
              <p style="margin: 12px 0 0; font-size: 12px;">
                <a href="https://drivecore.co.uk/privacy-policy" style="color: #1E40AF; text-decoration: underline;">Privacy Policy</a>
                <span style="color: #94A3B8;"> · </span>
                <a href="https://drivecore.co.uk/terms" style="color: #1E40AF; text-decoration: underline;">Terms of Service</a>
              </p>
              <p style="margin: 8px 0 0; font-size: 11px; color: #94A3B8;">&copy; ${new Date().getFullYear()} DRIVECORE LTD. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `
    };

    await sgMail.send(msg);

    res.json({ success: true, message: 'Welcome email sent successfully' });

  } catch (error) {
    console.error('Error sending welcome email:', error.message);
    res.status(500).json({ success: false, error: 'Failed to send welcome email' });
  }
});

/**
 * POST /api/send-purchase-confirmation
 * Stripe backend — after Enterprise Ops or hardware checkout (webhook).
 * Body: { kind: "enterprise_ops" | "hardware", email, firstName, planName, planPrice,
 *   productTitle?, heroImageUrl?, quantity?, ctaUrl, ctaLabel, orderRef?, orderNumber? }
 * orderNumber: only for hardware (e.g. DC-HW-XXXXXXXX); subscriptions do not use it.
 */
app.post('/api/send-purchase-confirmation', requireApiKey, emailLimiter, async (req, res) => {
  try {
    const {
      kind,
      email,
      firstName,
      planName,
      planPrice,
      productTitle,
      heroImageUrl,
      quantity,
      ctaUrl,
      ctaLabel,
      orderNumber,
    } = req.body;

    if (!email || !firstName || !kind || !ctaUrl || !ctaLabel) {
      return res.status(400).json({
        success: false,
        error: 'email, firstName, kind, ctaUrl, and ctaLabel are required',
      });
    }

    const safeFirstName2 = escapeHtml(firstName);
    const displayPlan = escapeHtml(planName || 'Enterprise Operations');
    const displayPrice = escapeHtml(planPrice || '');
    const displayProduct = escapeHtml(productTitle || planName || 'Enterprise Operations');
    const safeOrderNumber = escapeHtml(orderNumber || '');
    const qtyNum = quantity != null ? Number(quantity) : 1;

    const purchaseFooter = `
          <tr>
            <td style="padding: 24px 32px; background: #F8FAFC; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: #64748B;">— DriveCore Team</p>
              <p style="margin: 4px 0 0; font-size: 12px; color: #94A3B8;">Smart vehicle tracking</p>
              <p style="margin: 8px 0 0; font-size: 11px; color: #94A3B8;">Company No. 16750234 · ICO Registered under UK GDPR - ZC093182 · VAT GB510012376</p>
              <p style="margin: 12px 0 0; font-size: 12px;">
                <a href="https://drivecore.co.uk/privacy-policy" style="color: #1E40AF; text-decoration: underline;">Privacy Policy</a>
                <span style="color: #94A3B8;"> · </span>
                <a href="https://drivecore.co.uk/terms" style="color: #1E40AF; text-decoration: underline;">Terms of Service</a>
              </p>
              <p style="margin: 8px 0 0; font-size: 11px; color: #94A3B8;">&copy; ${new Date().getFullYear()} DRIVECORE LTD. All rights reserved.</p>
            </td>
          </tr>`;

    let innerHtml = '';
    let subject = '';
    let textBody = '';

    if (kind === 'enterprise_ops') {
      subject = '🎉 Payment Successful! — Enterprise Operations';
      textBody = `Hello ${firstName}!\n\nThank you for choosing DriveCore.\n\nYour Enterprise Operations subscription is active.\nPlan: ${displayPlan}\n${displayPrice ? `Price: ${displayPrice}\n` : ''}\n${ctaLabel}: ${ctaUrl}\n\n— DriveCore Team`;
      innerHtml = `
              <p style="margin: 0 0 10px; font-size: 18px; line-height: 1.6; color: #0F172A; font-weight: 600;">Thank you for choosing DriveCore!</p>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #334155;">Your payment has been processed successfully. Your account is already verified — no email verification step is needed. Your <strong>Enterprise Operations</strong> add-on is now active.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #F1F5F9; border-radius: 16px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 25px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding-bottom: 15px; border-bottom: 1px solid #E2E8F0;">
                          <span style="color: #64748B; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Your Plan</span>
                          <p style="margin: 5px 0 0; color: #0F172A; font-size: 22px; font-weight: 700;">${displayPlan}</p>
                        </td>
                      </tr>
                      ${
                        displayPrice
                          ? `<tr>
                        <td style="padding-top: 15px;">
                          <span style="color: #64748B; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Price</span>
                          <p style="margin: 5px 0 0; color: #2563EB; font-size: 20px; font-weight: 600;">${displayPrice}</p>
                        </td>
                      </tr>`
                          : ''
                      }
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #F8FAFC; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 15px; color: #0F172A; font-size: 14px; font-weight: 600;">What&apos;s next?</p>
                    <ol style="margin: 0; padding-left: 20px; color: #475569; font-size: 14px; line-height: 1.8;">
                      <li>Open your enterprise dashboard</li>
                      <li>Use fleet and operations tools included in your plan</li>
                      <li>Contact support if you need help with billing</li>
                    </ol>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 8px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" align="center">
                      <tr>
                        <td align="center" bgcolor="#2563EB" style="border-radius: 12px; padding: 16px 40px; background-color: #2563EB;">
                          <a href="${ctaUrl}" style="color: #ffffff !important; font-size: 16px; font-weight: 600; text-decoration: none;">${ctaLabel}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>`;
    } else if (kind === 'hardware') {
      subject = `🎉 Payment Successful! — Hardware order${orderNumber ? ` ${orderNumber}` : ''}`;
      textBody = `Hello ${firstName}!\n\nThank you for choosing DriveCore.\n${orderNumber ? `Order number: ${orderNumber}\n` : ''}Product: ${displayProduct}\n${qtyNum > 1 ? `Quantity: ${qtyNum}\n` : ''}${displayPrice ? `Total: ${displayPrice}\n` : ''}\n${ctaLabel}: ${ctaUrl}\n\n— DriveCore Team`;
      const heroBlock =
        (heroImageUrl && isAllowedUrl(heroImageUrl)) &&
        `<div style="text-align: center; margin: 0 0 24px;">
                <img src="${heroImageUrl}" alt="${displayProduct}" style="max-width: 100%; max-height: 240px; object-fit: contain; border-radius: 12px;" />
              </div>`;
      const orderRows =
        safeOrderNumber &&
        `<tr>
                        <td style="padding-bottom: 15px; border-bottom: 1px solid #E2E8F0;">
                          <span style="color: #64748B; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Order number</span>
                          <p style="margin: 5px 0 0; color: #065F46; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">${safeOrderNumber}</p>
                          <p style="margin: 6px 0 0; font-size: 13px; color: #64748B;">Quote this for support or shipping questions.</p>
                        </td>
                      </tr>`;
      const qtyRow =
        qtyNum > 1
          ? `<tr>
                        <td style="padding-top: 15px; padding-bottom: 15px; border-bottom: 1px solid #E2E8F0;">
                          <span style="color: #64748B; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Quantity</span>
                          <p style="margin: 5px 0 0; color: #0F172A; font-size: 18px; font-weight: 700;">${qtyNum}</p>
                        </td>
                      </tr>`
          : '';
      innerHtml = `
              <p style="margin: 0 0 10px; font-size: 18px; line-height: 1.6; color: #0F172A; font-weight: 600;">Thank you for choosing DriveCore!</p>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #334155;">Your payment has been processed successfully. We&apos;ll ship your hardware to the address you entered at checkout.</p>
              ${heroBlock || ''}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #F1F5F9; border-radius: 16px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 25px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      ${orderRows || ''}
                      <tr>
                        <td style="${orderRows ? 'padding-top: 15px; padding-bottom: 15px; border-bottom: 1px solid #E2E8F0;' : 'padding-bottom: 15px; border-bottom: 1px solid #E2E8F0;'}">
                          <span style="color: #64748B; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Product</span>
                          <p style="margin: 5px 0 0; color: #0F172A; font-size: 22px; font-weight: 700;">${displayProduct}</p>
                        </td>
                      </tr>
                      ${qtyRow}
                      ${
                        displayPrice
                          ? `<tr>
                        <td style="padding-top: 15px;">
                          <span style="color: #64748B; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Total paid</span>
                          <p style="margin: 5px 0 0; color: #2563EB; font-size: 20px; font-weight: 600;">${displayPrice}</p>
                        </td>
                      </tr>`
                          : ''
                      }
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #F8FAFC; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0; color: #475569; font-size: 14px; line-height: 1.6;">We&apos;ll prepare your device for dispatch. You may receive further updates by email. Reply to support if you need to change shipping details before dispatch.</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 8px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" align="center">
                      <tr>
                        <td align="center" bgcolor="#2563EB" style="border-radius: 12px; padding: 16px 40px; background-color: #2563EB;">
                          <a href="${ctaUrl}" style="color: #ffffff !important; font-size: 16px; font-weight: 600; text-decoration: none;">${ctaLabel}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>`;
    } else {
      return res.status(400).json({ success: false, error: 'kind must be enterprise_ops or hardware' });
    }

    const msg = {
      to: email,
      from: { email: SENDER_EMAIL, name: 'DriveCore' },
      subject,
      text: textBody,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DriveCore</title>
</head>
<body style="margin: 0; padding: 0; background: linear-gradient(135deg, #0C1220 0%, #1E3A8A 100%); min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #0C1220 0%, #1E3A8A 100%); padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background: #ffffff; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4); overflow: hidden;">
          <tr>
            <td bgcolor="#1E293B" style="background: linear-gradient(135deg, #0C1220 0%, #1E293B 50%, #1E3A8A 100%); background-color: #1E293B; padding: 40px 32px 32px; text-align: center;">
              <img src="https://drivecore-4ae46.web.app/email/icon.png" alt="DriveCore" width="80" height="80" style="display: block; margin: 0 auto; border-radius: 18px;" />
              <div style="height: 20px;"></div>
              <h1 style="margin: 0; font-size: 26px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">Payment Successful!</h1>
              <p style="margin: 8px 0 0; font-size: 15px; color: rgba(255,255,255,0.85);">Welcome to DriveCore, ${safeFirstName2}!</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 32px 40px;">
              ${innerHtml}
            </td>
          </tr>
          ${purchaseFooter}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    };

    await sgMail.send(msg);
    res.json({ success: true, message: 'Purchase confirmation email sent' });
  } catch (error) {
    console.error('Error sending purchase confirmation:', error.message);
    res.status(500).json({ success: false, error: 'Failed to send purchase confirmation email' });
  }
});

/**
 * POST /api/send-device-added
 * Sends an email when an existing user adds a new device
 * Body: { 
 *   email: string,
 *   userId?: string,
 *   firstName: string,
 *   vehicleName: string,
 *   planName: string,
 *   planPrice?: string
 * }
 */
app.post('/api/send-device-added', requireApiKey, emailLimiter, async (req, res) => {
  try {
    const { email, userId, firstName, vehicleName, planName, planPrice } = req.body;

    if (!email || !firstName || !vehicleName) {
      return res.status(400).json({ success: false, error: 'Email, firstName, and vehicleName are required' });
    }

    const safeFirstName = escapeHtml(firstName);
    const safeVehicleName = escapeHtml(vehicleName);
    const safePlanName = escapeHtml(planName);
    const displayPrice = escapeHtml(planPrice || '');

    // Email template for device added
    const msg = {
      to: email,
      from: {
        email: SENDER_EMAIL,
        name: 'DriveCore'
      },
      subject: `New Device Added - ${safeVehicleName}`,
      text: `Hello ${firstName}!\n\nGreat news! We've successfully added ${vehicleName} to your DriveCore account. Your new subscription is now active.\n\nPlan: ${planName}\n${planPrice ? `Price: ${planPrice}\n` : ''}\n\nLog in to start tracking: ${FRONTEND_URL}/gps/login\n\n— DriveCore Team`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Device Added - DriveCore</title>
</head>
<body style="margin: 0; padding: 0; background: linear-gradient(135deg, #0C1220 0%, #1E3A8A 100%); min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #0C1220 0%, #1E3A8A 100%); padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background: #ffffff; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4); overflow: hidden;">
          <!-- Header with logo -->
          <tr>
            <td bgcolor="#1E293B" style="background: linear-gradient(135deg, #0C1220 0%, #1E293B 50%, #1E3A8A 100%); background-color: #1E293B; padding: 40px 32px 32px; text-align: center;">
              <img src="https://drivecore-4ae46.web.app/email/icon.png" alt="DriveCore" width="80" height="80" style="display: block; margin: 0 auto; border-radius: 18px;" />
              <div style="height: 20px;"></div>
              <h1 style="margin: 0; font-size: 26px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">New Device Added!</h1>
              <p style="margin: 8px 0 0; font-size: 15px; color: rgba(255,255,255,0.85);">Your subscription has been activated</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 36px 32px 40px;">
              <p style="margin: 0 0 10px; font-size: 18px; line-height: 1.6; color: #0F172A; font-weight: 600;">Hello ${safeFirstName}!</p>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #334155;">Great news! We've successfully added <strong>${safeVehicleName}</strong> to your DriveCore account. Your new subscription is now active and ready to use.</p>
              <!-- Device Details Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #F1F5F9; border-radius: 16px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 25px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding-bottom: 15px; border-bottom: 1px solid #E2E8F0;">
                          <span style="color: #64748B; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Vehicle Name</span>
                          <p style="margin: 5px 0 0; color: #0F172A; font-size: 22px; font-weight: 700;">${safeVehicleName}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 15px 0; border-bottom: 1px solid #E2E8F0;">
                          <span style="color: #64748B; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Subscription Plan</span>
                          <p style="margin: 5px 0 0; color: #2563EB; font-size: 18px; font-weight: 600;">${safePlanName}</p>
                        </td>
                      </tr>
                      ${displayPrice ? `
                      <tr>
                        <td style="padding-top: 15px;">
                          <span style="color: #64748B; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Price</span>
                          <p style="margin: 5px 0 0; color: #2563EB; font-size: 18px; font-weight: 600;">${displayPrice}</p>
                        </td>
                      </tr>
                      ` : ''}
                    </table>
                  </td>
                </tr>
              </table>
              <!-- Features -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #F8FAFC; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 15px; color: #0F172A; font-size: 14px; font-weight: 600;">Active Features:</p>
                    <ul style="margin: 0; padding-left: 20px; color: #475569; font-size: 14px; line-height: 1.8;">
                      <li>Real-time GPS tracking</li>
                      <li>Location history &amp; playback</li>
                      <li>Speed alerts &amp; geofencing</li>
                      <li>24/7 monitoring</li>
                      <li>Mobile &amp; Web access</li>
                    </ul>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.7; color: #334155; text-align: center;">Your device is ready to track! Log in to your account to start monitoring ${safeVehicleName}.</p>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" align="center">
                      <tr>
                        <td align="center" bgcolor="#2563EB" style="border-radius: 12px; padding: 16px 40px; background-color: #2563EB;">
                          <a href="${FRONTEND_URL}/gps/login" style="color: #ffffff !important; font-size: 16px; font-weight: 600; text-decoration: none;">Open Dashboard</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background: #F8FAFC; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: #64748B;">— DriveCore Team</p>
              <p style="margin: 4px 0 0; font-size: 12px; color: #94A3B8;">Smart vehicle tracking</p>
              <p style="margin: 8px 0 0; font-size: 11px; color: #94A3B8;">Company No. 16750234 · ICO Registered under UK GDPR - ZC093182 · VAT GB510012376</p>
              <p style="margin: 12px 0 0; font-size: 12px;">
                <a href="https://drivecore.co.uk/privacy-policy" style="color: #1E40AF; text-decoration: underline;">Privacy Policy</a>
                <span style="color: #94A3B8;"> · </span>
                <a href="https://drivecore.co.uk/terms" style="color: #1E40AF; text-decoration: underline;">Terms of Service</a>
              </p>
              <p style="margin: 8px 0 0; font-size: 11px; color: #94A3B8;">&copy; ${new Date().getFullYear()} DRIVECORE LTD. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `
    };

    await sgMail.send(msg);

    res.json({ success: true, message: 'Device added email sent successfully' });

  } catch (error) {
    console.error('Error sending device added email:', error.message);
    res.status(500).json({ success: false, error: 'Failed to send device added email' });
  }
});

/**
 * POST /api/send-invoice
 * Sends an invoice/receipt email to the user
 * Body: { 
 *   email: string,
 *   invoiceId: string,
 *   amount: string (e.g., "£7.99"),
 *   invoiceUrl: string,
 *   invoicePdf?: string
 * }
 */
app.post('/api/send-invoice', requireApiKey, emailLimiter, async (req, res) => {
  try {
    const { email, invoiceId, amount, invoiceUrl, invoicePdf } = req.body;

    if (!email || !invoiceId || !amount || !invoiceUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email, invoiceId, amount, and invoiceUrl are required' 
      });
    }

    // Email template for invoice
    const msg = {
      to: email,
      from: {
        email: SENDER_EMAIL,
        name: 'DriveCore'
      },
      subject: `Your Payment Receipt - ${invoiceId}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt - DriveCore</title>
</head>
<body style="margin: 0; padding: 0; background: linear-gradient(135deg, #0C1220 0%, #1E3A8A 100%); min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #0C1220 0%, #1E3A8A 100%); padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background: #ffffff; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4); overflow: hidden;">
          <!-- Header with logo -->
          <tr>
            <td bgcolor="#1E293B" style="background: linear-gradient(135deg, #0C1220 0%, #1E293B 50%, #1E3A8A 100%); background-color: #1E293B; padding: 40px 32px 32px; text-align: center;">
              <img src="https://drivecore-4ae46.web.app/email/icon.png" alt="DriveCore" width="80" height="80" style="display: block; margin: 0 auto; border-radius: 18px;" />
              <div style="height: 20px;"></div>
              <h1 style="margin: 0; font-size: 26px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">Payment Receipt</h1>
              <p style="margin: 8px 0 0; font-size: 15px; color: rgba(255,255,255,0.85);">DriveCore Vehicle Tracking</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 36px 32px 40px;">
              <!-- Invoice Amount Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #F1F5F9; border-radius: 16px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 30px; text-align: center;">
                    <p style="margin: 0 0 8px; font-size: 16px; color: #64748B;">Payment Successful!</p>
                    <p style="margin: 0 0 12px; font-size: 42px; font-weight: 700; color: #0F172A;">${amount}</p>
                    <p style="margin: 0; font-size: 14px; color: #94A3B8;">Invoice: ${invoiceId}</p>
                  </td>
                </tr>
              </table>
              <!-- Action Buttons -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" align="center">
                      <tr>
                        <td align="center" bgcolor="#2563EB" style="border-radius: 12px; padding: 16px 40px; background-color: #2563EB;">
                          <a href="${invoiceUrl}" style="color: #ffffff !important; font-size: 16px; font-weight: 600; text-decoration: none;">View Invoice</a>
                        </td>
                        ${invoicePdf ? `
                        <td style="width: 12px;"></td>
                        <td align="center" bgcolor="#F1F5F9" style="border-radius: 12px; padding: 16px 32px; background-color: #F1F5F9;">
                          <a href="${invoicePdf}" style="color: #1E40AF !important; font-size: 16px; font-weight: 600; text-decoration: none;">Download PDF</a>
                        </td>
                        ` : ''}
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <!-- Features -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #F8FAFC; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 15px; color: #0F172A; font-size: 14px; font-weight: 600;">Your Subscription Includes:</p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr><td style="padding: 6px 0; font-size: 14px; color: #475569;"><span style="color: #2563EB; margin-right: 8px;">&#10003;</span> Real-time GPS tracking</td></tr>
                      <tr><td style="padding: 6px 0; font-size: 14px; color: #475569;"><span style="color: #2563EB; margin-right: 8px;">&#10003;</span> Location history</td></tr>
                      <tr><td style="padding: 6px 0; font-size: 14px; color: #475569;"><span style="color: #2563EB; margin-right: 8px;">&#10003;</span> Speed alerts &amp; geofencing</td></tr>
                      <tr><td style="padding: 6px 0; font-size: 14px; color: #475569;"><span style="color: #2563EB; margin-right: 8px;">&#10003;</span> Mobile &amp; Web access</td></tr>
                      <tr><td style="padding: 6px 0; font-size: 14px; color: #475569;"><span style="color: #2563EB; margin-right: 8px;">&#10003;</span> 24/7 monitoring</td></tr>
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 8px; font-size: 14px; color: #334155; text-align: center;">Your subscription will automatically renew at the end of each billing period.</p>
              <p style="margin: 0; font-size: 14px; color: #64748B; text-align: center;">You can manage your subscription anytime from your account settings.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background: #F8FAFC; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: #64748B;">— DriveCore Team</p>
              <p style="margin: 4px 0 0; font-size: 12px; color: #94A3B8;">Smart vehicle tracking</p>
              <p style="margin: 8px 0 0; font-size: 11px; color: #94A3B8;">Company No. 16750234 · ICO Registered under UK GDPR - ZC093182 · VAT GB510012376</p>
              <p style="margin: 12px 0 0; font-size: 12px;">
                <a href="https://drivecore.co.uk/privacy-policy" style="color: #1E40AF; text-decoration: underline;">Privacy Policy</a>
                <span style="color: #94A3B8;"> · </span>
                <a href="https://drivecore.co.uk/terms" style="color: #1E40AF; text-decoration: underline;">Terms of Service</a>
              </p>
              <p style="margin: 8px 0 0; font-size: 11px; color: #94A3B8;">&copy; ${new Date().getFullYear()} DRIVECORE LTD. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `
    };

    await sgMail.send(msg);

    res.json({ success: true, message: 'Invoice email sent successfully' });

  } catch (error) {
    console.error('Error sending invoice email:', error.message);
    res.status(500).json({ success: false, error: 'Failed to send invoice email' });
  }
});

/**
 * DELETE /api/token/:token
 * Removes a token (for cleanup or cancellation)
 */
app.delete('/api/token/:token', (req, res) => {
  const { token } = req.params;

  if (verificationTokens.has(token)) {
    verificationTokens.delete(token);
    res.json({ success: true, message: 'Token removed' });
  } else {
    res.status(404).json({ success: false, error: 'Token not found' });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════════════════════════════╗
  ║                                                                ║
  ║   📧 Email API - DriveCore                                     ║
  ║   ──────────────────────────────────────────────────────────   ║
  ║   Server running on: http://localhost:${PORT}                   ║
  ║                                                                ║
  ║   Endpoints:                                                   ║
  ║   POST /api/send-verification       → Send verification email  ║
  ║   POST /api/send-welcome-purchase   → Welcome + verify email   ║
  ║   POST /api/send-purchase-confirmation → Ops / hardware paid   ║
  ║   POST /api/send-device-added       → Device added email       ║
  ║   POST /api/send-invoice            → Send payment receipt     ║
  ║   POST /api/send-transfer-notification → Tracker transfer email║
  ║   GET  /api/verify/:token           → Verify token             ║
  ║   POST /api/verify                  → Verify token (POST)      ║
  ║   GET  /api/check/:token            → Check token status       ║
  ║   GET  /health                      → Health check             ║
  ║                                                                ║
  ╚════════════════════════════════════════════════════════════════╝
  `);
});
