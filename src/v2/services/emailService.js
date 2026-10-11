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

/**
 * Plantilla de correo para recuperación de contraseña con diseño institucional AguaVP.
 * Diseño limpio en HTML/CSS sin adjuntos de archivos.
 */
export async function sendPasswordRecoveryEmail({ to, name = 'usuario', resetToken }) {
  const resetUrl = `${publicAppUrl}/#/recuperarPassword?token=${encodeURIComponent(resetToken)}`;
  const subject = 'Recuperación de Contraseña — Agua VP';

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperación de Contraseña - Agua VP</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: #1e293b;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f1f5f9; padding: 20px 8px;">
    <tr>
      <td align="center">
        <!-- CONTENEDOR PRINCIPAL AMPLIO -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 680px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
          
          <!-- 1. ENCABEZADO INSTITUCIONAL OFICIAL (Estilo Reportes AguaVP) -->
          <tr>
            <td style="background: #1e40af; background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 60%, #1d4ed8 100%); padding: 24px 28px; color: #ffffff;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="vertical-align: middle;">
                    <div style="font-size: 16px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: #ffffff; line-height: 1.3;">
                      Comisión Municipal de Agua Potable y Alcantarillado
                    </div>
                    <div style="font-size: 11px; opacity: 0.9; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.12em; color: #bfdbfe; font-weight: 600;">
                      Villa Pesqueira, Sonora · Sistema AguaVP
                    </div>
                  </td>
                  <td align="right" style="vertical-align: middle; width: 105px;">
                    <div style="background: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.35); border-radius: 8px; padding: 6px 12px; text-align: center;">
                      <div style="font-size: 8px; text-transform: uppercase; letter-spacing: 0.12em; opacity: 0.9; color: #ffffff; font-weight: 700;">Seguridad</div>
                      <div style="font-weight: 800; font-size: 11px; margin-top: 1px; color: #ffffff;">ACCESO</div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 2. SUB-CABECERA DE ESTADO -->
          <tr>
            <td style="background-color: #f0f9ff; border-left: 4px solid #1e40af; border-bottom: 1px solid #bfdbfe; padding: 11px 28px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-size: 12px; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.05em;">
                    Solicitud de Restablecimiento de Contraseña
                  </td>
                  <td align="right" style="font-size: 10px; font-weight: 700; color: #1e40af; background-color: #dbeafe; padding: 3px 8px; border-radius: 999px; text-align: center;">
                    Expira en 15 min
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 3. CUERPO DEL CORREO -->
          <tr>
            <td style="padding: 30px 28px 24px 28px;">
              <p style="margin: 0 0 14px; font-size: 16px; font-weight: 700; color: #0f172a;">
                Hola, <span style="color: #1e40af;">${name}</span>
              </p>
              
              <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #475569;">
                Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en el sistema <strong>AguaVP</strong>. Para continuar con el proceso de recuperación, presiona el siguiente botón:
              </p>

              <!-- BOTÓN CTA PRINCIPAL -->
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 26px auto;">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="background-color: #1d4ed8; border-radius: 10px; box-shadow: 0 4px 10px rgba(29, 78, 216, 0.25);">
                          <a href="${resetUrl}" target="_blank" style="display: inline-block; padding: 14px 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 800; color: #ffffff; text-decoration: none; border-radius: 10px; letter-spacing: 0.04em; text-transform: uppercase;">
                            Restablecer Contraseña &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- FICHA / TOKEN MANUAL PARA LA APP -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 22px; margin: 22px 0;">
                <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">
                  Token de Seguridad (Para captura manual en la aplicación)
                </div>
                <div style="background-color: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px 16px; font-family: 'Consolas', 'Courier New', monospace; font-size: 15px; font-weight: 800; color: #0f172a; text-align: center; word-break: break-all; letter-spacing: 0.05em; user-select: all;">
                  ${resetToken}
                </div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 8px; text-align: center;">
                  Si estás en la aplicación de escritorio, copia y pega este código en la ventana de recuperación.
                </div>
              </div>

              <!-- ALERTA DE SEGURIDAD -->
              <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 0 8px 8px 0; padding: 14px 18px; margin: 22px 0;">
                <table cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="vertical-align: top; width: 22px; font-size: 16px;">
                      ⚠️
                    </td>
                    <td style="vertical-align: top; padding-left: 8px; font-size: 12px; color: #92400e; line-height: 1.5;">
                      <strong>Aviso de Seguridad:</strong> Este enlace y token expiran en <strong>15 minutos</strong> y solo pueden utilizarse una única vez. Si no solicitaste este cambio, puedes ignorar este mensaje con total tranquilidad; tu cuenta y contraseña actual seguirán protegidas.
                    </td>
                  </tr>
                </table>
              </div>

            </td>
          </tr>

          <!-- 4. PIE DE PÁGINA INSTITUCIONAL -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 28px; text-align: center;">
              <div style="font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 4px;">
                AguaVP · Sistema de Gestión de Agua Potable
              </div>
              <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">
                Comisión Municipal de Agua Potable y Alcantarillado — Villa Pesqueira, Sonora
              </div>
              <div style="font-size: 10px; color: #94a3b8; line-height: 1.4;">
                Este es un correo automático de seguridad generado por el servidor de autenticación. Por favor no respondas a esta dirección.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const text = `Comisión Municipal de Agua Potable y Alcantarillado - Villa Pesqueira, Sonora\n\nHola ${name},\n\nHemos recibido una solicitud para restablecer tu contraseña en AguaVP.\n\nPuedes restablecerla ingresando al siguiente enlace:\n${resetUrl}\n\nO ingresando este Token directamente en la app:\n${resetToken}\n\nEste código expira en 15 minutos. Si no realizaste esta solicitud, ignora este correo.\n\nAguaVP - Sistema de Gestión de Agua Potable`;

  return await sendEmail({ to, subject, html, text });
}

/**
 * Plantilla de correo para confirmación de cambio de contraseña exitoso.
 */
export async function sendPasswordChangedEmail({ to, name = 'usuario', context = 'cambio de contraseña' }) {
  const subject = 'Contraseña Actualizada Correctamente — Agua VP';

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contraseña Actualizada - Agua VP</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: #1e293b;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f1f5f9; padding: 20px 8px;">
    <tr>
      <td align="center">
        <!-- CONTENEDOR PRINCIPAL AMPLIO -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 680px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
          
          <!-- 1. ENCABEZADO INSTITUCIONAL -->
          <tr>
            <td style="background: #1e40af; background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 60%, #1d4ed8 100%); padding: 24px 28px; color: #ffffff;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="vertical-align: middle;">
                    <div style="font-size: 16px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: #ffffff; line-height: 1.3;">
                      Comisión Municipal de Agua Potable y Alcantarillado
                    </div>
                    <div style="font-size: 11px; opacity: 0.9; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.12em; color: #bfdbfe; font-weight: 600;">
                      Villa Pesqueira, Sonora · Sistema AguaVP
                    </div>
                  </td>
                  <td align="right" style="vertical-align: middle; width: 105px;">
                    <div style="background: rgba(16, 185, 129, 0.25); border: 1px solid rgba(16, 185, 129, 0.5); border-radius: 8px; padding: 6px 12px; text-align: center;">
                      <div style="font-size: 8px; text-transform: uppercase; letter-spacing: 0.12em; color: #a7f3d0; font-weight: 800;">Estado</div>
                      <div style="font-weight: 800; font-size: 11px; margin-top: 1px; color: #ffffff;">EXITOSO</div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 2. SUB-CABECERA -->
          <tr>
            <td style="background-color: #ecfdf5; border-left: 4px solid #10b981; border-bottom: 1px solid #a7f3d0; padding: 11px 28px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-size: 12px; font-weight: 800; color: #065f46; text-transform: uppercase; letter-spacing: 0.05em;">
                    Confirmación de Actualización de Seguridad
                  </td>
                  <td align="right" style="font-size: 10px; font-weight: 700; color: #047857; background-color: #d1fae5; padding: 3px 8px; border-radius: 999px; text-align: center;">
                    ✓ Actualizado
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 3. CUERPO DEL CORREO -->
          <tr>
            <td style="padding: 30px 28px 24px 28px;">
              <p style="margin: 0 0 14px; font-size: 16px; font-weight: 700; color: #0f172a;">
                Hola, <span style="color: #1e40af;">${name}</span>
              </p>
              
              <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #475569;">
                Te confirmamos que la contraseña de tu cuenta de acceso a <strong>AguaVP</strong> ha sido actualizada exitosamente mediante <strong>${context}</strong>.
              </p>

              <!-- CAJA DE ÉXITO -->
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px 20px; margin: 20px 0;">
                <table cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="vertical-align: middle; width: 24px; font-size: 18px; color: #16a34a;">
                      ✓
                    </td>
                    <td style="vertical-align: middle; padding-left: 8px; font-size: 13px; font-weight: 700; color: #15803d;">
                      Tu nueva contraseña ya se encuentra activa para iniciar sesión.
                    </td>
                  </tr>
                </table>
              </div>

              <!-- ALERTA SI NO RECONOCE LA ACCIÓN -->
              <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 0 8px 8px 0; padding: 14px 18px; margin: 22px 0;">
                <table cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="vertical-align: top; width: 22px; font-size: 16px;">
                      🛡️
                    </td>
                    <td style="vertical-align: top; padding-left: 8px; font-size: 12px; color: #991b1b; line-height: 1.5;">
                      <strong>¿No fuiste tú?</strong> Si tú no realizaste esta actualización ni la autorizaste, por favor ponte en contacto de inmediato con el Administrador del Sistema para suspender y asegurar tu cuenta de usuario.
                    </td>
                  </tr>
                </table>
              </div>

            </td>
          </tr>

          <!-- 4. PIE DE PÁGINA -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 28px; text-align: center;">
              <div style="font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 4px;">
                AguaVP · Sistema de Gestión de Agua Potable
              </div>
              <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">
                Comisión Municipal de Agua Potable y Alcantarillado — Villa Pesqueira, Sonora
              </div>
              <div style="font-size: 10px; color: #94a3b8; line-height: 1.4;">
                Este es un correo automático de seguridad generado por el servidor de autenticación. Por favor no respondas a esta dirección.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const text = `Comisión Municipal de Agua Potable y Alcantarillado - Villa Pesqueira, Sonora\n\nHola ${name},\n\nTu contraseña de acceso a AguaVP fue actualizada exitosamente mediante ${context}.\n\nSi tú no realizaste esta acción, contacta al Administrador del Sistema de inmediato.\n\nAguaVP - Sistema de Gestión de Agua Potable`;

  return await sendEmail({ to, subject, html, text });
}

export default {
  sendPasswordRecoveryEmail,
  sendPasswordChangedEmail
};