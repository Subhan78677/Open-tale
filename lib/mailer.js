const nodemailer = require('nodemailer');

// Set these environment variables to send real emails (see README):
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
// If SMTP_HOST is not set, codes are printed in the terminal instead (good for testing).
let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendVerificationCode(email, code) {
  if (!transporter) {
    console.log(`\n[Open Tale] Verification code for ${email}: ${code}   (email not configured, printed here)\n`);
    return;
  }
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || 'Open Tale <no-reply@opentale.com>',
      to: email,
      subject: 'Your Open Tale verification code',
      text: `Your verification code is ${code}. It expires in 10 minutes.`,
      html: `<p>Your Open Tale verification code is <strong style="font-size:20px">${code}</strong>.</p>
             <p>It expires in 10 minutes. If you did not sign up, you can ignore this email.</p>`,
    });
  } catch (err) {
    console.error('Email sending failed:', err.message);
    const e = new Error('We could not send the verification email. Please try again later.');
    e.status = 502;
    throw e;
  }
}

module.exports = { sendVerificationCode };
