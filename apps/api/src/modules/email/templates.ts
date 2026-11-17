import { z } from 'zod';
import { ROLES, type Role } from '@flame/shared';
import type { EmailTemplate } from '../../generated/prisma/client.js';

/**
 * Plain, accessible transactional emails (HTML and text). Content comes from the outbox
 * payload; every value is escaped. Any link is erased from the payload after
 * delivery, so a re-rendered email (e.g. in the development mailbox) may lack it.
 */

const ROLE_LABELS: Record<Role, string> = {
  ORGANISATION_OWNER: 'Owner',
  ADMINISTRATOR: 'Administrator',
  APPROVER: 'Approver',
  REVIEWER: 'Reviewer',
  DATA_ENTRY_OFFICER: 'Data entry officer',
  VIEWER: 'Viewer',
};

export const organisationInvitationPayloadSchema = z.object({
  inviterName: z.string(),
  organisationName: z.string(),
  roles: z.array(z.enum(ROLES)),
  expiresAt: z.string(),
  link: z.string().optional(),
});
export type OrganisationInvitationPayload = z.infer<typeof organisationInvitationPayloadSchema>;

export const platformAdminInvitationPayloadSchema = z.object({
  inviterName: z.string(),
  expiresAt: z.string(),
  link: z.string().optional(),
});
export type PlatformAdminInvitationPayload = z.infer<typeof platformAdminInvitationPayloadSchema>;

export const passwordResetPayloadSchema = z.object({
  name: z.string(),
  expiresAt: z.string(),
  link: z.string().optional(),
});
export type PasswordResetPayload = z.infer<typeof passwordResetPayloadSchema>;

export const passwordChangedPayloadSchema = z.object({
  name: z.string(),
  changedAt: z.string(),
  /** How it was changed: a reset link, or the account page while signed in. */
  via: z.enum(['reset', 'account']),
});
export type PasswordChangedPayload = z.infer<typeof passwordChangedPayloadSchema>;

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const LINK_ERASED = '(The link was removed from our records after the email was sent.)';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** A time in UTC, written out so it reads the same in every mail client. */
function formatUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)} UTC`;
}

const INVITATION_FOOTER =
  'If you were not expecting this invitation, you can ignore this email or decline the invitation from the link.';

/** The call to action: a link (which may since have been erased) and its button label. */
interface EmailAction {
  link: string | undefined;
  label: string;
}

function layout(
  title: string,
  paragraphs: string[],
  action: EmailAction | null,
  footer: string,
): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${p}</p>`).join('\n');
  const actionHtml = !action
    ? ''
    : action.link
      ? `<p style="margin:24px 0"><a href="${escapeHtml(action.link)}" style="display:inline-block;padding:12px 20px;background:#1f2937;color:#ffffff;text-decoration:underline;border-radius:6px">${escapeHtml(action.label)}</a></p>
<p style="margin:0 0 16px">If the button does not work, copy this address into your browser:<br>${escapeHtml(action.link)}</p>`
      : `<p style="margin:0 0 16px">${escapeHtml(LINK_ERASED)}</p>`;
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px;background:#ffffff;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">
<main style="max-width:560px;margin:0 auto">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
${body}
${actionHtml}
<p style="margin:24px 0 0;color:#4b5563;font-size:14px">${escapeHtml(footer)}</p>
</main>
</body>
</html>`;
}

function textLink(action: EmailAction): string {
  return action.link ? `${action.label}:\n${action.link}` : LINK_ERASED;
}

function organisationInvitation(p: OrganisationInvitationPayload): RenderedEmail {
  const roles = p.roles.map((r) => ROLE_LABELS[r]).join(', ');
  const expires = formatUtc(p.expiresAt);
  const subject = `${p.inviterName} invited you to ${p.organisationName} on Flame`;
  const html = layout(
    `Join ${p.organisationName} on Flame`,
    [
      `${escapeHtml(p.inviterName)} has invited you to join <strong>${escapeHtml(p.organisationName)}</strong> on Flame, the carbon-management platform.`,
      `Your role${p.roles.length === 1 ? '' : 's'}: ${escapeHtml(roles)}.`,
      `The invitation expires on ${escapeHtml(expires)}.`,
    ],
    { link: p.link, label: 'Open the invitation' },
    INVITATION_FOOTER,
  );
  const text = [
    `${p.inviterName} has invited you to join ${p.organisationName} on Flame, the carbon-management platform.`,
    `Your role${p.roles.length === 1 ? '' : 's'}: ${roles}.`,
    `The invitation expires on ${expires}.`,
    textLink({ link: p.link, label: 'Open the invitation' }),
    INVITATION_FOOTER,
  ].join('\n\n');
  return { subject, html, text };
}

function platformAdminInvitation(p: PlatformAdminInvitationPayload): RenderedEmail {
  const expires = formatUtc(p.expiresAt);
  const subject = `${p.inviterName} invited you to be a Flame Platform Administrator`;
  const intro = `${p.inviterName} has invited you to become a Platform Administrator of Flame. Platform Administrators manage platform-level settings and organisations; the role gives no access to any organisation's data.`;
  const html = layout(
    'Become a Flame Platform Administrator',
    [escapeHtml(intro), `The invitation expires on ${escapeHtml(expires)}.`],
    { link: p.link, label: 'Open the invitation' },
    INVITATION_FOOTER,
  );
  const text = [
    intro,
    `The invitation expires on ${expires}.`,
    textLink({ link: p.link, label: 'Open the invitation' }),
    INVITATION_FOOTER,
  ].join('\n\n');
  return { subject, html, text };
}

function passwordReset(p: PasswordResetPayload): RenderedEmail {
  const expires = formatUtc(p.expiresAt);
  const action = { link: p.link, label: 'Choose a new password' };
  const subject = 'Reset your Flame password';
  const footer =
    'If you did not ask to reset your password, you can ignore this email: your password stays the same.';
  const lines = [
    `Hello ${p.name},`,
    'Someone (we hope you) asked to reset the password of your Flame account. Use the link below to choose a new one. It can be used once.',
    `The link expires on ${expires}. After you choose a new password, you will be signed out everywhere and can sign in with it.`,
  ];
  const html = layout('Reset your password', lines.map(escapeHtml), action, footer);
  const text = [...lines, textLink(action), footer].join('\n\n');
  return { subject, html, text };
}

function passwordChanged(p: PasswordChangedPayload): RenderedEmail {
  const when = formatUtc(p.changedAt);
  const how =
    p.via === 'reset' ? 'using a password reset link' : 'from the account page while signed in';
  const subject = 'Your Flame password was changed';
  const footer =
    'If you did not change it, reset your password now from the sign-in page and tell your organisation administrator.';
  const lines = [
    `Hello ${p.name},`,
    `The password of your Flame account was changed on ${when}, ${how}.`,
  ];
  const html = layout('Your password was changed', lines.map(escapeHtml), null, footer);
  const text = [...lines, footer].join('\n\n');
  return { subject, html, text };
}

/** Renders an outbox row. Throws if the stored payload doesn't match its template. */
export function renderEmail(template: EmailTemplate, payload: unknown): RenderedEmail {
  switch (template) {
    case 'ORGANISATION_INVITATION':
      return organisationInvitation(organisationInvitationPayloadSchema.parse(payload));
    case 'PLATFORM_ADMIN_INVITATION':
      return platformAdminInvitation(platformAdminInvitationPayloadSchema.parse(payload));
    case 'PASSWORD_RESET':
      return passwordReset(passwordResetPayloadSchema.parse(payload));
    case 'PASSWORD_CHANGED':
      return passwordChanged(passwordChangedPayloadSchema.parse(payload));
  }
}
