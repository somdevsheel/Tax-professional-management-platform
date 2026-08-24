import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { existsSync, readFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";

/**
 * Loads the RS256 keypair used to sign/verify access tokens (docs/security-design.md §2).
 *
 * Production MUST provide JWT_PRIVATE_KEY_PATH / JWT_PUBLIC_KEY_PATH pointing at a keypair
 * from a secrets store. If unset, an ephemeral in-memory keypair is generated for local
 * development/tests only — every restart invalidates all previously issued tokens, which is
 * intentional friction to prevent this fallback from ever being mistaken for a production
 * setup.
 */
@Injectable()
export class JwtKeysService implements OnModuleInit {
  private readonly logger = new Logger(JwtKeysService.name);
  private _privateKey!: string;
  private _publicKey!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const privatePath = this.config.get<string>("JWT_PRIVATE_KEY_PATH");
    const publicPath = this.config.get<string>("JWT_PUBLIC_KEY_PATH");

    if (privatePath && publicPath && existsSync(privatePath) && existsSync(publicPath)) {
      this._privateKey = readFileSync(privatePath, "utf8");
      this._publicKey = readFileSync(publicPath, "utf8");
      return;
    }

    if (this.config.get<string>("NODE_ENV") === "production") {
      throw new Error(
        "JWT_PRIVATE_KEY_PATH/JWT_PUBLIC_KEY_PATH must point to a real RS256 keypair in production.",
      );
    }

    this.logger.warn(
      "No JWT keypair configured — generating an ephemeral in-memory RS256 keypair for this " +
        "process only. All tokens are invalidated on restart. Never rely on this in production.",
    );
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
      publicKeyEncoding: { type: "pkcs1", format: "pem" },
    });
    this._privateKey = privateKey;
    this._publicKey = publicKey;
  }

  get privateKey(): string {
    return this._privateKey;
  }

  get publicKey(): string {
    return this._publicKey;
  }
}
