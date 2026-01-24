export function magicLinkEmail(
  url: string,
  host: string,
): { subject: string; text: string; html: string } {
  return {
    subject: `Sign in to ${host}`,
    text: `Sign in to ${host}\n\nClick the link below to sign in:\n\n${url}\n\nIf you didn't request this email, you can safely ignore it.`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin: 20px 0;">
            <h1 style="color: #1a1a1a; margin-top: 0;">Sign in to ${host}</h1>
            <p style="font-size: 16px; margin-bottom: 30px;">
              Click the button below to sign in to your account:
            </p>
            <a href="${url}" style="display: inline-block; background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">
              Sign in to ${host}
            </a>
            <p style="font-size: 14px; color: #666; margin-top: 30px;">
              Or copy and paste this URL into your browser:
            </p>
            <p style="font-size: 14px; color: #0070f3; word-break: break-all;">
              ${url}
            </p>
            <p style="font-size: 14px; color: #666; margin-top: 30px;">
              If you didn't request this email, you can safely ignore it.
            </p>
          </div>
        </body>
      </html>
    `,
  }
}
