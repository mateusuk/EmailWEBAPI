require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sgMail = require('@sendgrid/mail');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Middleware
app.use(cors());
app.use(express.json());

// Temporary token storage (in production, use a database)
const verificationTokens = new Map();

// Settings
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'noreply@yourdomain.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * POST /api/send-verification
 * Sends a verification email to the user
 * Body: { email: string, userId?: string, callbackUrl?: string }
 */
app.post('/api/send-verification', async (req, res) => {
  try {
    const { email, userId, callbackUrl } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email is required' 
      });
    }

    // Generate unique token
    const token = uuidv4();
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // Store token
    verificationTokens.set(token, {
      email,
      userId: userId || null,
      expiresAt,
      verified: false
    });

    // Verification URL
    const verificationUrl = callbackUrl 
      ? `${callbackUrl}?token=${token}`
      : `${FRONTEND_URL}/verify?token=${token}`;

    // Email template
    const msg = {
      to: email,
      from: SENDER_EMAIL,
      subject: '✉️ Verify your email address',
      text: `Hello!\n\nClick the link below to verify your email:\n${verificationUrl}\n\nThis link expires in 24 hours.\n\nIf you did not request this verification, please ignore this email.`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f0f0f;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f0f0f; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" max-width="520px" cellpadding="0" cellspacing="0" style="background: linear-gradient(145deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.5);">
                  
                  <!-- Header -->
                  <tr>
                    <td style="padding: 40px 40px 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                      <div style="width: 70px; height: 70px; background: rgba(255,255,255,0.2); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                        <span style="font-size: 32px;">✉️</span>
                      </div>
                      <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 600; letter-spacing: -0.5px;">
                        Verify Your Email
                      </h1>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px;">
                      <p style="margin: 0 0 25px; color: #a0a0a0; font-size: 16px; line-height: 1.6;">
                        Hello! 👋
                      </p>
                      <p style="margin: 0 0 30px; color: #e0e0e0; font-size: 16px; line-height: 1.7;">
                        We're almost there! Click the button below to confirm your email address and activate your account.
                      </p>
                      
                      <!-- Button -->
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center" style="padding: 10px 0 35px;">
                            <a href="${verificationUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 50px; box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4); transition: transform 0.2s;">
                              Verify Email →
                            </a>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 0 0 20px; color: #707070; font-size: 14px; line-height: 1.6;">
                        Or copy and paste this link into your browser:
                      </p>
                      <p style="margin: 0 0 30px; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px; word-break: break-all;">
                        <a href="${verificationUrl}" style="color: #667eea; text-decoration: none; font-size: 13px;">${verificationUrl}</a>
                      </p>
                      
                      <!-- Warning -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background: rgba(255, 193, 7, 0.1); border-left: 3px solid #ffc107; border-radius: 0 8px 8px 0;">
                        <tr>
                          <td style="padding: 15px 20px;">
                            <p style="margin: 0; color: #ffc107; font-size: 13px;">
                              ⏰ This link expires in <strong>24 hours</strong>
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 25px 40px; background: rgba(0,0,0,0.2); border-top: 1px solid rgba(255,255,255,0.05);">
                      <p style="margin: 0; color: #505050; font-size: 12px; text-align: center; line-height: 1.6;">
                        If you did not request this verification, please ignore this email.<br>
                        Your account will remain secure.
                      </p>
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
      message: 'Verification email sent successfully',
      token // Returns token for testing (remove in production)
    });

  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send verification email',
      details: error.message
    });
  }
});

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
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    tokensInMemory: verificationTokens.size
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   📧 Email Verification API                               ║
  ║   ─────────────────────────────────────────────────────   ║
  ║   Server running on: http://localhost:${PORT}              ║
  ║                                                           ║
  ║   Endpoints:                                              ║
  ║   POST /api/send-verification  → Send verification email  ║
  ║   GET  /api/verify/:token      → Verify token             ║
  ║   POST /api/verify             → Verify token (POST)      ║
  ║   GET  /api/check/:token       → Check token status       ║
  ║   GET  /health                 → Health check             ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
  `);
});
