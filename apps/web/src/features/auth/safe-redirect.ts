/**
 * Only same-app paths are allowed as post-sign-in destinations, so a crafted
 * `?next=` link cannot send a user to another site (open redirect). Without a valid
 * destination, people land in their organisation (/app), not on the landing page.
 */
export function safeRedirectPath(next: string | null): string {
  if (!next?.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/app';
  return next;
}
