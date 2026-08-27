/**
 * Malware scanning for uploaded documents, abstracted the same way KMS is
 * (infra/kms/kms-provider.interface.ts) so a real engine (a ClamAV daemon, a cloud AV API) can
 * be wired in per-environment without touching the documents module. docs/security-design.md
 * §9 requires every upload to be "scanned by an antivirus worker before being marked available
 * for download" — this interface is that boundary: a document is only persisted (and so only
 * ever becomes downloadable) after `scan()` resolves `clean: true`.
 */
export interface AntivirusScanner {
  scan(buffer: Buffer): Promise<{ clean: boolean; reason?: string }>;
}

export const ANTIVIRUS_SCANNER = Symbol("ANTIVIRUS_SCANNER");
