const nodemailer = require('nodemailer');

let transporter;

function getEmailConfig() {
  const port = Number(process.env.SMTP_PORT || '587');
  return {
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    appUrl: (process.env.APP_URL || '').trim(),
  };
}

function isEmailConfigured() {
  const { host, user, pass } = getEmailConfig();
  return Boolean(host && user && pass);
}

function getTransporter() {
  if (transporter) return transporter;
  if (!isEmailConfigured()) {
    throw new Error('Email transport is not configured.');
  }
  const { host, port, secure, user, pass } = getEmailConfig();
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  return transporter;
}

function buildResetUrl(to, token, appUrl) {
  const fallbackBase = `http://localhost:${process.env.PORT || 3000}`;
  const configuredBase = (appUrl || '').trim() || fallbackBase;
  const trimmed = configuredBase.endsWith('/') ? configuredBase.slice(0, -1) : configuredBase;

  let url;
  try {
    url = new URL('/reset-password', trimmed);
  } catch (_error) {
    url = new URL('/reset-password', fallbackBase);
  }

  url.searchParams.set('email', to);
  url.searchParams.set('token', token);
  return url.toString();
}

async function sendPasswordResetEmail({ to, token }) {
  const { from, appUrl } = getEmailConfig();
  const resetUrl = buildResetUrl(to, token, appUrl);

  const mailOptions = {
    from,
    to,
    subject: 'Reset your password',
    text: `We received a request to reset your password.\n\nUse this link to set a new password: ${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `
      <p>We received a request to reset your password.</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  };

  const transport = getTransporter();
  await transport.sendMail(mailOptions);
}

module.exports = {
  isEmailConfigured,
  sendPasswordResetEmail,
};
