import { mkdir, writeFile } from "node:fs/promises";

// Supabase Go-template placeholders are deliberately preserved. The auth service
// builds the action URL, including the app's PKCE/deep-link redirect.
const assetOrigin = new URL(process.env.SMILE_EMAIL_ASSET_ORIGIN || "https://smile-by-dr-vik-staging.drvik.workers.dev");
if (assetOrigin.protocol !== "https:" || assetOrigin.username || assetOrigin.password || assetOrigin.search || assetOrigin.hash)
  throw new Error("SMILE_EMAIL_ASSET_ORIGIN must be a public HTTPS origin.");
const out = "supabase/templates";
const escape = value => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const templates = [
  {
    key: "confirmation", subject: "Confirm your SmileCompose account", label: "Welcome to SmileCompose",
    title: "One step to get started.",
    body: "Confirm your email address to finish setting up your SmileCompose account.",
    action: "Confirm email address", url: "{{ .ConfirmationURL }}",
    help: "Open this link on the device and in the browser where you created your account. If you signed up in the app, open it on that same device.",
    safety: "If you didn’t create a SmileCompose account, you can ignore this email.",
  },
  {
    key: "recovery", subject: "Reset your SmileCompose password", label: "Account access",
    title: "A fresh start for your password.",
    body: "We received a request to reset your SmileCompose password. Use the secure link below to choose a new one.",
    action: "Reset password", url: "{{ .ConfirmationURL }}",
    help: "Open this link on the device and in the browser where you requested it. If you requested it in the app, open it on that same device.",
    safety: "If this wasn’t you, ignore this email. Your password won’t change unless you complete the reset.",
  },
  {
    key: "email_change", subject: "Confirm your SmileCompose email change", label: "Account details",
    title: "Confirm your email change.",
    body: "A request was made to change the email address for your SmileCompose account. Confirm the request below. You may need to confirm it from both your current and new email addresses.",
    action: "Confirm email change", url: "{{ .ConfirmationURL }}",
    help: "Open this link on the device where you requested the change.",
    safety: "If you didn’t request this change, don’t confirm it. Open SmileCompose and review your account security.",
  },
  {
    key: "magic_link", subject: "Your SmileCompose sign-in link", label: "Account access",
    title: "Welcome back.",
    body: "Use your secure link below to sign in to SmileCompose.",
    action: "Sign in to SmileCompose", url: "{{ .ConfirmationURL }}",
    help: "Open this link on the device and in the browser where you requested it. If you requested it in the app, open it on that same device.",
    safety: "If you didn’t request this link, you can ignore this email.",
  },
  {
    key: "invite", subject: "Your invitation to SmileCompose", label: "Your invitation",
    title: "You’re invited.",
    body: "You’ve been invited to create a SmileCompose account. Accept your invitation using the secure link below.",
    action: "Accept invitation", url: "{{ .ConfirmationURL }}",
    help: "Use the device you’d like to set up with SmileCompose.",
    safety: "If you weren’t expecting this invitation, you can ignore this email.",
  },
  {
    key: "reauthentication", subject: "Your SmileCompose verification code", label: "Account security",
    title: "Confirm it’s you.",
    body: "Enter this code in SmileCompose to confirm the account action you requested.", code: "{{ .Token }}",
    help: "If the code has expired, request a new one in the app.",
    safety: "Never share this code. If you didn’t request it, don’t enter it or pass it on.",
  },
  {
    key: "password_changed_notification", subject: "Your SmileCompose password changed", label: "Account security",
    title: "Your password has changed.",
    body: "The password for your SmileCompose account was recently changed. If you made this change, there’s nothing else to do.",
    safety: "If this wasn’t you, open SmileCompose and reset your password immediately. Review your account and contact support through the app.",
  },
  {
    key: "email_changed_notification", subject: "Your SmileCompose email address changed", label: "Account security",
    title: "Your email address has changed.",
    body: "The email address for your SmileCompose account was recently changed. If you made this change, there’s nothing else to do.",
    safety: "If this wasn’t you, open SmileCompose and contact support through the app immediately.",
  },
];

function render(t) {
  const action = t.action ? `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:28px 0 24px;"><tr><td align="center" bgcolor="#D4B583" style="border-radius:12px;mso-padding-alt:18px 24px;">
                <a href="${t.url}" style="display:block;padding:18px 24px;color:#302A23;font:600 16px/22px Arial,Helvetica,sans-serif;text-decoration:none;border-radius:12px;">${escape(t.action)}</a>
              </td></tr></table>` : "";
  const code = t.code ? `<p style="margin:28px 0;padding:22px 12px;background:#F3F0EB;border:1px solid #E6DED4;border-radius:12px;color:#302A23;text-align:center;font:600 30px/40px 'Courier New',monospace;letter-spacing:6px;">${t.code}</p>` : "";
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escape(t.subject)}</title>
  <style>
    body { margin:0 !important; padding:0 !important; }
    table { border-collapse:collapse; }
    a { word-break:break-word; }
    @media only screen and (max-width:600px) {
      .outer { padding:24px 12px !important; }
      .content { padding:32px 24px !important; }
      .headline { font-size:32px !important; line-height:38px !important; }
      .wordmark { font-size:18px !important; letter-spacing:3px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#F3F0EB;color:#3C3C3C;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escape(t.body)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F3F0EB">
    <tr><td class="outer" align="center" style="padding:48px 20px;">
      <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;border-collapse:separate;border-spacing:0;">
        <tr><td align="center" style="padding:0 0 28px;">
          <p class="wordmark" style="margin:0;color:#3C3C3C;font:400 22px/32px Arial,Helvetica,sans-serif;letter-spacing:4px;">SMILECOMPOSE</p>
        </td></tr>
        <tr><td bgcolor="#FAF9F6" style="border:1px solid #E6DED4;border-radius:20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="content" style="padding:40px;">
              <p style="margin:0 0 20px;color:#776249;font:600 11px/18px Arial,Helvetica,sans-serif;letter-spacing:1.8px;text-transform:uppercase;">${escape(t.label)}</p>
              <h1 class="headline" style="margin:0 0 24px;color:#302A23;font:400 38px/44px Georgia,'Times New Roman',serif;">${escape(t.title)}</h1>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="44" height="2" bgcolor="#D4B583" style="font-size:0;line-height:0;">&nbsp;</td></tr></table>
              <p style="margin:24px 0 0;color:#55514B;font:400 16px/26px Arial,Helvetica,sans-serif;">${escape(t.body)}</p>
              ${action}${code}
              ${t.help ? `<p style="margin:20px 0 0;color:#676159;font:400 13px/21px Arial,Helvetica,sans-serif;">${escape(t.help)}</p>` : ""}
              ${t.url ? `<p style="margin:16px 0 0;color:#676159;font:400 13px/21px Arial,Helvetica,sans-serif;">This link can only be used once. If it no longer works, request a new link in SmileCompose.</p>` : ""}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;"><tr><td style="border-top:1px solid #E6DED4;padding-top:22px;">
                <p style="margin:0;color:#676159;font:400 13px/21px Arial,Helvetica,sans-serif;">${escape(t.safety)}</p>
              </td></tr></table>
              ${t.url ? `<p style="margin:22px 0 6px;color:#676159;font:400 12px/19px Arial,Helvetica,sans-serif;">Button not working? Copy and paste this link into your browser:</p>
              <p style="margin:0;font:400 11px/18px Arial,Helvetica,sans-serif;word-break:break-all;overflow-wrap:anywhere;"><a href="${t.url}" style="color:#776249;text-decoration:underline;word-break:break-all;">${t.url}</a></p>` : ""}
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:26px 16px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
            <td valign="middle" style="padding-right:10px;color:#776F65;font:400 12px/18px Arial,Helvetica,sans-serif;">Designed By</td>
            <td valign="middle"><img src="${escape(assetOrigin.origin)}/brand/dr-vik-logo-bronze.png" width="70" height="29" alt="Dr Vik" style="display:block;border:0;color:#776249;font:400 16px/29px Georgia,serif;"></td>
          </tr></table>
          <p style="margin:16px 0 0;color:#776F65;font:400 11px/18px Arial,Helvetica,sans-serif;">SmileCompose · Account notification</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>
`;
}

await mkdir(out, { recursive: true });
await mkdir("output/auth-emails/deploy/supabase/templates", { recursive: true });
const patch = { smtp_sender_name: "SmileCompose" };
const manifest = [];
const config = ['project_id = "smilecompose-email-branding"', '\n[auth.email.smtp]', 'sender_name = "SmileCompose"'];
for (const t of templates) {
  const html = render(t);
  await writeFile(`${out}/${t.key}.html`, html);
  await writeFile(`output/auth-emails/deploy/supabase/templates/${t.key}.html`, html);
  patch[`mailer_subjects_${t.key}`] = t.subject;
  patch[`mailer_templates_${t.key}_content`] = html;
  manifest.push({ key: t.key, subject: t.subject, file: `${t.key}.html` });
  const section = t.key.endsWith("_notification") ? `notification.${t.key.replace(/_notification$/, "")}` : `template.${t.key}`;
  config.push(`\n[auth.email.${section}]`, `subject = ${JSON.stringify(t.subject)}`, `content_path = "./supabase/templates/${t.key}.html"`);
}
await writeFile("output/auth-emails/deploy/supabase/config.toml", config.join("\n") + "\n");
await writeFile(`${out}/manifest.json`, JSON.stringify({ senderName: "SmileCompose", assetOrigin: assetOrigin.origin, templates: manifest }, null, 2) + "\n");
await mkdir("output/auth-emails", { recursive: true });
await writeFile("output/auth-emails/staging-patch.json", JSON.stringify(patch, null, 2) + "\n");
for (const t of templates) {
  const preview = render(t).replaceAll("{{ .ConfirmationURL }}", "https://example.invalid/preview-only").replaceAll("{{ .Token }}", "123456");
  await writeFile(`output/auth-emails/${t.key}.html`, preview);
}
await writeFile("output/auth-emails/index.html", `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SmileCompose email previews</title><body style="margin:40px;background:#F3F0EB;color:#302A23;font:16px/1.6 Arial,sans-serif"><h1 style="font:36px Georgia,serif">SmileCompose account emails</h1><p>Design previews only. No emails are sent and links do not authenticate.</p><ul>${templates.map(t => `<li><a style="color:#776249" href="${t.key}.html">${escape(t.subject)}</a></li>`).join("")}</ul></body></html>`);
console.log(`Built ${templates.length} branded auth templates and local previews. No emails sent; no remote settings changed.`);
