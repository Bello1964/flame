/**
 * Only same-app paths are allowed as post-sign-in destinations, so a crafted
 * `?next=` link cannot send a user to another site (open redirect).
 */
export function safeRedirectPath(next: string | null): string {
  if (!next?.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  return next;
}
