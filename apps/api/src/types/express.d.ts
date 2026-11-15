import type { Role } from '../generated/prisma/client.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by the authenticate middleware when a valid session cookie is present. */
      auth?: {
        userId: string;
        sessionId: string;
        csrfToken: string;
        isPlatformAdmin: boolean;
      };
      /** Set by requireOrganisation from the user's verified membership — never from client input alone. */
      organisation?: {
        id: string;
        membershipId: string;
        roles: Role[];
      };
    }
  }
}

export {};
