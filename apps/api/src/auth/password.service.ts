import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";

/**
 * Argon2id password hashing with an environment-held pepper concatenated before hashing
 * (docs/security-design.md §2). The pepper is a deployment secret, never derived from user
 * data and never stored alongside the hash.
 */
@Injectable()
export class PasswordService implements OnModuleInit {
  // Fixed reference hash used to keep login timing constant when the account doesn't exist,
  // reducing (not eliminating) user-enumeration-by-timing.
  private dummyHashPromise: Promise<string> | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    // Matches JwtKeysService and LocalKmsProvider's own production guards — a missing pepper
    // previously defaulted to "" silently, meaning every password would hash unpeppered with
    // no warning, and setting the pepper later would invalidate every existing password
    // (docs/security-review.md).
    if (!this.config.get<string>("PASSWORD_PEPPER") && this.config.get<string>("NODE_ENV") === "production") {
      throw new Error("PASSWORD_PEPPER must be set in production (docs/security-design.md §2).");
    }
  }

  private pepper(): string {
    return this.config.get<string>("PASSWORD_PEPPER") ?? "";
  }

  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword + this.pepper(), { type: argon2.argon2id });
  }

  async verify(hash: string, plainPassword: string): Promise<boolean> {
    return argon2.verify(hash, plainPassword + this.pepper());
  }

  async verifyAgainstDummy(): Promise<void> {
    if (!this.dummyHashPromise) {
      this.dummyHashPromise = this.hash("dummy-password-for-constant-time-comparison");
    }
    const dummyHash = await this.dummyHashPromise;
    await argon2.verify(dummyHash, "irrelevant" + this.pepper()).catch(() => undefined);
  }
}
