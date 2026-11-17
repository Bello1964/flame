import { z } from 'zod';
import { ROLES, type Role } from '@flame/shared';
import type { EmailTemplate } from '../../generated/prisma/client.js';

/**
 * Plain, accessible invitation emails (HTML and text). Content comes from the outbox
 * payload; every value is escaped. The accept link is erased from the payload after
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

/** Expiry in UTC, written out so it reads the same in every mail client. */
function formatExpiry(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)} UTC`;
}

function layout(title: string, paragraphs: string[], link: string | undefined): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${p}</p>`).join('\n');
  const action = link
    ? `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#1f2937;color:#ffffff;text-decoration:underline;border-radius:6px">Open the invitation</a></p>
<p style="margin:0 0 16px">If the button does not work, copy this address into your browser:<br>${escapeHtml(link)}</p>`
    : `<p style="margin:0 0 16px">${escapeHtml(LINK_ERASED)}</p>`;
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px;background:#ffffff;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">
<main style="max-width:560px;margin:0 auto">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
${body}
${action}
<p style="margin:24px 0 0;color:#4b5563;font-size:14px">If you were not expecting this invitation, you can ignore this email or decline the invitation from the link.</p>
</main>
</body>
</html>`;
}

function textLink(link: string | undefined): string {
  return link ? `Open the invitation:\n${link}` : LINK_ERASED;
}

function organisationInvitation(p: OrganisationInvitationPayload): RenderedEmail {
  const roles = p.roles.map((r) => ROLE_LABELS[r]).join(', ');
  const expires = formatExpiry(p.expiresAt);
  const subject = `${p.inviterName} invited you to ${p.organisationName} on Flame`;
  const html = layout(
    `Join ${p.organisationName} on Flame`,
    [
      `${escapeHtml(p.inviterName)} has invited you to join <strong>${escapeHtml(p.organisationName)}</strong> on Flame, the carbon-management platform.`,
      `Your role${p.roles.length === 1 ? '' : 's'}: ${escapeHtml(roles)}.`,
      `The invitation expires on ${escapeHtml(expires)}.`,
    ],
    p.link,
  );
  const text = [
    `${p.inviterName} has invited you to join ${p.organisationName} on Flame, the carbon-management platform.`,
    `Your role${p.roles.length === 1 ? '' : 's'}: ${roles}.`,
    `The invitation expires on ${expires}.`,
    textLink(p.link),
    'If you were not expecting this invitation, you can ignore this email or decline the invitation from the link.',
  ].join('\n\n');
  return { subject, html, text };
}

function platformAdminInvitation(p: PlatformAdminInvitationPayload): RenderedEmail {
  const expires = formatExpiry(p.expiresAt);
  const subject = `${p.inviterName} invited you to be a Flame Platform Administrator`;
  const intro = `${p.inviterName} has invited you to become a Platform Administrator of Flame. Platform Administrators manage platform-level settings and organisations; the role gives no access to any organisation's data.`;
  const html = layout(
    'Become a Flame Platform Administrator',
    [escapeHtml(intro), `The invitation expires on ${escapeHtml(expires)}.`],
    p.link,
  );
  const text = [
    intro,
    `The invitation expires on ${expires}.`,
    textLink(p.link),
    'If you were not expecting this invitation, you can ignore this email or decline the invitation from the link.',
  ].join('\n\n');
  return { subject, html, text };
}

/** Renders an outbox row. Throws if the stored payload doesn't match its template. */
export function renderEmail(template: EmailTemplate, payload: unknown): RenderedEmail {
  switch (template) {
    case 'ORGANISATION_INVITATION':
      return organisationInvitation(organisationInvitationPayloadSchema.parse(payload));
    case 'PLATFORM_ADMIN_INVITATION':
      return platformAdminInvitation(platformAdminInvitationPayloadSchema.parse(payload));
  }
}
