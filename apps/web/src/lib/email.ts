import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.EMAIL_FROM ?? "noreply@voicecraft.dev"
const APP_URL = process.env.APP_URL ?? "http://localhost:3000"

export async function sendVerificationEmail(
  to: string,
  rawToken: string
): Promise<void> {
  const url = `${APP_URL}/verify-email/confirm?token=${rawToken}`
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Verify your VoiceCraft email",
    html: `
      <p>Thanks for signing up for VoiceCraft.</p>
      <p><a href="${url}" style="background:#6D46DC;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Verify email</a></p>
      <p style="color:#888;font-size:13px">This link expires in 24 hours.</p>
    `,
  })
}

export async function sendPasswordResetEmail(
  to: string,
  rawToken: string
): Promise<void> {
  const url = `${APP_URL}/reset-password?token=${rawToken}`
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Reset your VoiceCraft password",
    html: `
      <p>We received a request to reset your VoiceCraft password.</p>
      <p><a href="${url}" style="background:#6D46DC;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Reset password</a></p>
      <p style="color:#888;font-size:13px">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    `,
  })
}
