import { Resend } from 'resend';
import type { EmailConfig } from '../../config/env.js';
import type { EmailTransport } from '../../generated/prisma/client.js';
import type { RenderedEmail } from './templates.js';

export interface OutgoingEmail extends RenderedEmail {
  to: string;
  /** Stable per outbox row, so a retried send is not delivered twice. */
  idempotencyKey: string;
}

/** Thrown by a sender for a failed delivery; the message must never contain secrets. */
export class EmailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailSendError';
  }
}

export interface EmailSender {
  readonly transport: EmailTransport;
  /**
   * True when the outbox keeps the full content (with its link) after delivery: only the
   * development mailbox, where the outbox *is* the mailbox.
   */
  readonly retainsContent: boolean;
  send(email: OutgoingEmail): Promise<{ providerMessageId: string | null }>;
}

/** Delivers through Resend, with the outbox id as the idempotency key. */
export class ResendSender implements EmailSender {
  readonly transport = 'RESEND' as const;
  readonly retainsContent = false;
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async send(email: OutgoingEmail): Promise<{ providerMessageId: string | null }> {
    const { data, error } = await this.client.emails.send(
      { from: this.from, to: email.to, subject: email.subject, html: email.html, text: email.text },
      { idempotencyKey: email.idempotencyKey },
    );
    if (error) {
      // Provider error names and messages describe the failure, not the content.
      throw new EmailSendError(`Resend ${error.name}: ${error.message}`);
    }
    return { providerMessageId: data.id };
  }
}

/**
 * Development without RESEND_API_KEY: nothing leaves the machine. The email stays in the
 * outbox, link included, and is shown at GET /api/v1/dev/mailbox.
 */
export class DevMailboxSender implements EmailSender {
  readonly transport = 'DEV_MAILBOX' as const;
  readonly retainsContent = true;

  send(): Promise<{ providerMessageId: string | null }> {
    return Promise.resolve({ providerMessageId: null });
  }
}

/** Tests: records what would have been sent, and can be told to fail. */
export class InMemorySender implements EmailSender {
  readonly transport = 'MEMORY' as const;
  readonly retainsContent = false;
  readonly sent: OutgoingEmail[] = [];
  /** When set, every send fails with this message. */
  failWith: string | null = null;

  send(email: OutgoingEmail): Promise<{ providerMessageId: string | null }> {
    if (this.failWith !== null) return Promise.reject(new EmailSendError(this.failWith));
    this.sent.push(email);
    return Promise.resolve({ providerMessageId: `memory-${String(this.sent.length)}` });
  }
}

export function createEmailSender(config: EmailConfig): EmailSender {
  return config.mode === 'resend'
    ? new ResendSender(config.apiKey, config.from)
    : new DevMailboxSender();
}
