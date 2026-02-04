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
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'noreply@drivecore.co.uk';
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
app.post('/api/send-transfer-notification', async (req, res) => {
  try {
    const { email, transferId, trackerDetails, fromUserName, subscriptionEndDate } = req.body;

    if (!email || !transferId || !trackerDetails) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email, transferId, and trackerDetails are required' 
      });
    }

    const acceptUrl = `${FRONTEND_URL}/transfer/accept?id=${transferId}`;
    const formattedEndDate = subscriptionEndDate 
      ? new Date(subscriptionEndDate).toLocaleDateString('en-GB', { 
          day: 'numeric', 
          month: 'long', 
          year: 'numeric' 
        })
      : 'N/A';

    // Email template for tracker transfer
    const msg = {
      to: email,
      from: SENDER_EMAIL,
      subject: `🚗 Vehicle Tracker Transfer Request - ${trackerDetails.vehicleName || 'GPS Tracker'}`,
      text: `Hello!\n\nYou have received a vehicle tracker transfer request.\n\nVehicle: ${trackerDetails.vehicleName}\nRegistration: ${trackerDetails.registrationNumber || 'N/A'}\nTracker IMEI: ${trackerDetails.imei}\n${fromUserName ? `From: ${fromUserName}\n` : ''}\nThe current subscription is active until: ${formattedEndDate}\n\nAfter this date, you will need to set up your own subscription to continue using the tracking service.\n\nClick here to accept the transfer: ${acceptUrl}\n\nIf you did not expect this transfer, please ignore this email.`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" max-width="560px" cellpadding="0" cellspacing="0" style="background: linear-gradient(145deg, #1e3a5f 0%, #1e40af 100%); border-radius: 20px; overflow: hidden; box-shadow: 0 25px 80px rgba(0,0,0,0.5); border: 1px solid rgba(59, 130, 246, 0.3);">
                  
                  <!-- Header -->
                  <tr>
                    <td style="padding: 45px 40px 35px; text-align: center; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);">
                      <div style="width: 80px; height: 80px; background: rgba(255,255,255,0.15); border-radius: 50%; margin: 0 auto 20px; line-height: 80px;">
                        <span style="font-size: 40px;">🚗</span>
                      </div>
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                        Vehicle Tracker Transfer
                      </h1>
                      <p style="margin: 10px 0 0; color: rgba(255,255,255,0.8); font-size: 16px;">
                        You've received a transfer request
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px;">
                      ${fromUserName ? `
                      <p style="margin: 0 0 25px; color: #94a3b8; font-size: 16px; line-height: 1.6;">
                        <strong style="color: #e2e8f0;">${fromUserName}</strong> wants to transfer a vehicle tracker to you.
                      </p>
                      ` : `
                      <p style="margin: 0 0 25px; color: #94a3b8; font-size: 16px; line-height: 1.6;">
                        Someone wants to transfer a vehicle tracker to you.
                      </p>
                      `}
                      
                      <!-- Vehicle Details Card -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background: rgba(15, 23, 42, 0.6); border-radius: 16px; border: 1px solid rgba(59, 130, 246, 0.2); margin-bottom: 30px;">
                        <tr>
                          <td style="padding: 25px;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                              <tr>
                                <td style="padding-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                                  <span style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Vehicle Name</span>
                                  <p style="margin: 5px 0 0; color: #ffffff; font-size: 20px; font-weight: 600;">${trackerDetails.vehicleName || 'GPS Tracker'}</p>
                                </td>
                              </tr>
                              ${trackerDetails.registrationNumber ? `
                              <tr>
                                <td style="padding: 15px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                                  <span style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Registration</span>
                                  <p style="margin: 5px 0 0; color: #f1f5f9; font-size: 18px; font-weight: 500;">${trackerDetails.registrationNumber}</p>
                                </td>
                              </tr>
                              ` : ''}
                              <tr>
                                <td style="padding-top: 15px;">
                                  <span style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Tracker IMEI</span>
                                  <p style="margin: 5px 0 0; color: #94a3b8; font-size: 14px; font-family: monospace;">${trackerDetails.imei}</p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- Subscription Info -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(234, 179, 8, 0.1) 100%); border-left: 4px solid #f59e0b; border-radius: 0 12px 12px 0; margin-bottom: 30px;">
                        <tr>
                          <td style="padding: 20px;">
                            <p style="margin: 0 0 8px; color: #fbbf24; font-size: 14px; font-weight: 600;">
                              ⚠️ Important - Subscription Information
                            </p>
                            <p style="margin: 0; color: #fcd34d; font-size: 14px; line-height: 1.6;">
                              The current subscription is active until <strong>${formattedEndDate}</strong>.<br>
                              After this date, you will need to set up your own subscription to continue using the tracking service.
                            </p>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- CTA Button -->
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center" style="padding: 10px 0 35px;">
                            <a href="${acceptUrl}" style="display: inline-block; padding: 18px 50px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; font-size: 17px; font-weight: 700; border-radius: 50px; box-shadow: 0 10px 30px rgba(16, 185, 129, 0.4);">
                              Accept Transfer →
                            </a>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 0 0 20px; color: #64748b; font-size: 14px; line-height: 1.6;">
                        Or copy and paste this link into your browser:
                      </p>
                      <p style="margin: 0 0 25px; padding: 15px; background: rgba(0,0,0,0.3); border-radius: 10px; word-break: break-all;">
                        <a href="${acceptUrl}" style="color: #60a5fa; text-decoration: none; font-size: 13px;">${acceptUrl}</a>
                      </p>
                      
                      <!-- What Happens Next -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background: rgba(59, 130, 246, 0.1); border-radius: 12px; border: 1px solid rgba(59, 130, 246, 0.2);">
                        <tr>
                          <td style="padding: 20px;">
                            <p style="margin: 0 0 15px; color: #60a5fa; font-size: 14px; font-weight: 600;">
                              📋 What happens when you accept?
                            </p>
                            <ol style="margin: 0; padding-left: 20px; color: #94a3b8; font-size: 14px; line-height: 1.8;">
                              <li>The tracker will be added to your account</li>
                              <li>You'll have full access to tracking features</li>
                              <li>After ${formattedEndDate}, you'll be prompted to subscribe</li>
                              <li>Choose monthly (£7.99/mo) or yearly (£79.99/yr) plan</li>
                            </ol>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 25px 40px; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.05);">
                      <p style="margin: 0; color: #475569; font-size: 12px; text-align: center; line-height: 1.6;">
                        If you did not expect this transfer request, please ignore this email.<br>
                        No action will be taken and the request will expire in 7 days.
                      </p>
                      <p style="margin: 15px 0 0; color: #334155; font-size: 11px; text-align: center;">
                        © ${new Date().getFullYear()} DriveCore - Vehicle Tracking Solutions
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
      message: 'Transfer notification email sent successfully'
    });

  } catch (error) {
    console.error('Error sending transfer email:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send transfer notification email',
      details: error.message
    });
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
app.post('/api/send-welcome-purchase', async (req, res) => {
  try {
    const { email, userId, firstName, planName, planPrice, vehicleName, callbackUrl } = req.body;

    if (!email || !firstName) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and firstName are required' 
      });
    }

    // Generate unique token for email verification
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

    const displayPlanName = planName || 'GPS Tracker';
    const displayPrice = planPrice || '';
    const displayVehicle = vehicleName || 'your vehicle';

    // Email template - Welcome after purchase
    const msg = {
      to: email,
      from: SENDER_EMAIL,
      subject: '🎉 Welcome to DriveCore - Payment Successful!',
      text: `Hello ${firstName}!\n\nThank you for your purchase! Your payment was successful.\n\nPlan: ${displayPlanName}\n${displayPrice ? `Price: ${displayPrice}\n` : ''}\n\nBefore you can start tracking ${displayVehicle}, please verify your email address by clicking the link below:\n\n${verificationUrl}\n\nThis link expires in 24 hours.\n\nIf you have any questions, feel free to contact our support team.\n\nWelcome aboard!\nThe DriveCore Team`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" max-width="560px" cellpadding="0" cellspacing="0" style="background: linear-gradient(145deg, #064e3b 0%, #065f46 100%); border-radius: 20px; overflow: hidden; box-shadow: 0 25px 80px rgba(0,0,0,0.5); border: 1px solid rgba(16, 185, 129, 0.3);">
                  
                  <!-- Header -->
                  <tr>
                    <td style="padding: 45px 40px 35px; text-align: center; background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
                      <div style="width: 80px; height: 80px; background: rgba(255,255,255,0.2); border-radius: 50%; margin: 0 auto 20px; line-height: 80px;">
                        <span style="font-size: 40px;">🎉</span>
                      </div>
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                        Payment Successful!
                      </h1>
                      <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">
                        Welcome to DriveCore, ${firstName}!
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px;">
                      <p style="margin: 0 0 25px; color: #d1fae5; font-size: 18px; line-height: 1.6;">
                        Thank you for choosing DriveCore! 🚗
                      </p>
                      <p style="margin: 0 0 30px; color: #a7f3d0; font-size: 16px; line-height: 1.7;">
                        Your payment has been processed successfully and your account is almost ready. You're just one step away from tracking ${displayVehicle}!
                      </p>
                      
                      <!-- Plan Details Card -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background: rgba(6, 78, 59, 0.6); border-radius: 16px; border: 1px solid rgba(16, 185, 129, 0.3); margin-bottom: 30px;">
                        <tr>
                          <td style="padding: 25px;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                              <tr>
                                <td style="padding-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                                  <span style="color: #6ee7b7; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Your Plan</span>
                                  <p style="margin: 5px 0 0; color: #ffffff; font-size: 22px; font-weight: 700;">${displayPlanName}</p>
                                </td>
                              </tr>
                              ${displayPrice ? `
                              <tr>
                                <td style="padding-top: 15px;">
                                  <span style="color: #6ee7b7; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Price</span>
                                  <p style="margin: 5px 0 0; color: #34d399; font-size: 20px; font-weight: 600;">${displayPrice}</p>
                                </td>
                              </tr>
                              ` : ''}
                            </table>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- Verification Notice -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(37, 99, 235, 0.15) 100%); border-left: 4px solid #3b82f6; border-radius: 0 12px 12px 0; margin-bottom: 30px;">
                        <tr>
                          <td style="padding: 20px;">
                            <p style="margin: 0 0 8px; color: #60a5fa; font-size: 14px; font-weight: 600;">
                              📧 One more step!
                            </p>
                            <p style="margin: 0; color: #93c5fd; font-size: 14px; line-height: 1.6;">
                              Please verify your email address to activate your account and start tracking.
                            </p>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- CTA Button -->
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center" style="padding: 10px 0 35px;">
                            <a href="${verificationUrl}" style="display: inline-block; padding: 18px 50px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: #ffffff; text-decoration: none; font-size: 17px; font-weight: 700; border-radius: 50px; box-shadow: 0 10px 30px rgba(59, 130, 246, 0.4);">
                              Verify My Email →
                            </a>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 0 0 20px; color: #6ee7b7; font-size: 14px; line-height: 1.6;">
                        Or copy and paste this link into your browser:
                      </p>
                      <p style="margin: 0 0 25px; padding: 15px; background: rgba(0,0,0,0.3); border-radius: 10px; word-break: break-all;">
                        <a href="${verificationUrl}" style="color: #60a5fa; text-decoration: none; font-size: 13px;">${verificationUrl}</a>
                      </p>
                      
                      <!-- What's Next -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background: rgba(16, 185, 129, 0.1); border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.2);">
                        <tr>
                          <td style="padding: 20px;">
                            <p style="margin: 0 0 15px; color: #34d399; font-size: 14px; font-weight: 600;">
                              🚀 What's next?
                            </p>
                            <ol style="margin: 0; padding-left: 20px; color: #a7f3d0; font-size: 14px; line-height: 1.8;">
                              <li>Click the button above to verify your email</li>
                              <li>Log in to your DriveCore account</li>
                              <li>Your GPS tracker is ready to use!</li>
                              <li>Start tracking your vehicle in real-time</li>
                            </ol>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- Warning -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 25px; background: rgba(245, 158, 11, 0.1); border-left: 3px solid #f59e0b; border-radius: 0 8px 8px 0;">
                        <tr>
                          <td style="padding: 15px 20px;">
                            <p style="margin: 0; color: #fbbf24; font-size: 13px;">
                              ⏰ This verification link expires in <strong>24 hours</strong>
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 25px 40px; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.05);">
                      <p style="margin: 0 0 10px; color: #6ee7b7; font-size: 14px; text-align: center;">
                        Questions? Contact us at support@drivecore.co.uk
                      </p>
                      <p style="margin: 0; color: #065f46; font-size: 11px; text-align: center;">
                        © ${new Date().getFullYear()} DriveCore UK - Vehicle Tracking Solutions
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
      message: 'Welcome email sent successfully',
      token // Returns token for verification
    });

  } catch (error) {
    console.error('Error sending welcome email:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send welcome email',
      details: error.message
    });
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
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    tokensInMemory: verificationTokens.size
  });
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
  ║   POST /api/send-welcome-purchase   → Welcome + verify (NEW!)  ║
  ║   POST /api/send-transfer-notification → Tracker transfer email║
  ║   GET  /api/verify/:token           → Verify token             ║
  ║   POST /api/verify                  → Verify token (POST)      ║
  ║   GET  /api/check/:token            → Check token status       ║
  ║   GET  /health                      → Health check             ║
  ║                                                                ║
  ╚════════════════════════════════════════════════════════════════╝
  `);
});
