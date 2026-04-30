import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const resendFrom = process.env.RESEND_FROM_EMAIL;
const publicAppUrl = (process.env.APP_PUBLIC_URL || process.env.PUBLIC_APP_URL || process.env.VITE_APP_URL || 'http://localhost:5173').replace(/\/$/, '');

const resendClient = resendApiKey ? new Resend(resendApiKey) : null;

function isEmailServiceConfigured() {
  return Boolean(resendClient && resendFrom);
}

async function sendEmail({ to, subject, html, text }) {
  if (!isEmailServiceConfigured()) {
    console.warn('[Email] Resend no configurado. Saltando envío.', { to, subject });
    return { success: false, skipped: true, message: 'Resend no configurado' };
  }

  const payload = {
    from: resendFrom,
    to,
    subject,
    html,
    text
  };

  const result = await resendClient.emails.send(payload);
  return { success: true, result };
}

export async function sendPasswordRecoveryEmail({ to, name = 'usuario', resetToken }) {
  const resetUrl = `${publicAppUrl}/#/recuperarPassword?token=${encodeURIComponent(resetToken)}`;
  const subject = 'Recuperación de contraseña - Agua VP';
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <h2 style="margin:0 0 16px">Recuperación de contraseña</h2>
      <p>Hola ${name},</p>
      <p>Recibimos una solicitud para restablecer tu contraseña. Si fuiste tú, abre el enlace siguiente o pega el token en la pantalla de recuperación de la app.</p>
      <p style="margin:24px 0">
        <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Restablecer contraseña</a>
      </p>
      <p style="word-break:break-all"><strong>Token:</strong> ${resetToken}</p>
      <p>Este enlace expira en 15 minutos y solo puede usarse una vez.</p>
      <p style="color:#64748b;font-size:12px">Si no solicitaste este cambio, ignora este correo.</p>
    </div>
  `;
  const text = `Hola ${name}. Recupera tu contraseña en: ${resetUrl}\nToken: ${resetToken}\nEste enlace expira en 15 minutos.`;

  return await sendEmail({ to, subject, html, text });
}

export async function sendPasswordChangedEmail({ to, name = 'usuario', context = 'cambio de contraseña' }) {
  const subject = 'Tu contraseña fue actualizada - Agua VP';
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <h2 style="margin:0 0 16px">Contraseña actualizada</h2>
      <p>Hola ${name},</p>
      <p>Tu contraseña fue actualizada correctamente mediante ${context}. Si no reconoces esta acción, contacta al soporte administrativo de inmediato.</p>
      <p style="color:#64748b;font-size:12px">Agua VP</p>
    </div>
  `;
  const text = `Hola ${name}. Tu contraseña fue actualizada correctamente mediante ${context}. Si no reconoces esta acción, contacta al soporte administrativo de inmediato.`;

  return await sendEmail({ to, subject, html, text });
}

export default {
  sendPasswordRecoveryEmail,
  sendPasswordChangedEmail
};