import argon2 from 'argon2';

/** argon2id with the library's defaults (OWASP-aligned memory and time cost). */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // Malformed hash: treat as a failed verification rather than an internal error.
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns roughly the same time as a real verification so that "unknown email"
 * and "wrong password" cannot be told apart by response time.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('timing-equaliser-not-a-real-password');
  await verifyPassword(await dummyHash, password);
}
