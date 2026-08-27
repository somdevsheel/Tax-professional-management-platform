/**
 * Outbound transactional email, abstracted the same way KMS and the antivirus scanner are
 * (infra/kms/kms-provider.interface.ts, infra/antivirus/antivirus-scanner.interface.ts) so a
 * real provider (SMTP against SES/SendGrid/Postmark/your own mail server) can be wired in per
 * environment without touching the callers. Deliberately just one `send` method — callers own
 * composing the subject/body, this only owns delivery.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailService {
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_SERVICE = Symbol("EMAIL_SERVICE");
