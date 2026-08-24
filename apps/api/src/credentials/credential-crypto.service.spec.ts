import { LocalKmsProvider } from "../infra/kms/local-kms.provider";
import { CredentialCryptoService } from "./credential-crypto.service";

function buildLocalKms(): LocalKmsProvider {
  const config = {
    get: (key: string) => {
      if (key === "NODE_ENV") return "test";
      if (key === "KEK_LOCAL_DEV_SECRET") return "unit-test-kek-secret";
      return undefined;
    },
  } as never;
  const kms = new LocalKmsProvider(config);
  kms.onModuleInit();
  return kms;
}

describe("CredentialCryptoService", () => {
  const crypto = new CredentialCryptoService(buildLocalKms());

  it("round-trips a credential payload through encrypt/decrypt", async () => {
    const plaintext = { username: "gst-user-01", password: "S3cret!Portal-Pass" };
    const encrypted = await crypto.encrypt(plaintext);

    expect(encrypted.payloadCiphertext).not.toEqual(Buffer.from(JSON.stringify(plaintext)));
    expect(Buffer.isBuffer(encrypted.payloadCiphertext)).toBe(true);
    expect(Buffer.isBuffer(encrypted.wrappedDataKey)).toBe(true);

    const decrypted = await crypto.decrypt(encrypted);
    expect(decrypted).toEqual(plaintext);
  });

  it("produces a different DEK (and ciphertext) for every credential, even with identical plaintext", async () => {
    const plaintext = { username: "same-user", password: "same-password" };
    const first = await crypto.encrypt(plaintext);
    const second = await crypto.encrypt(plaintext);

    expect(first.wrappedDataKey).not.toEqual(second.wrappedDataKey);
    expect(first.payloadCiphertext).not.toEqual(second.payloadCiphertext);
    expect(first.encryptionNonce).not.toEqual(second.encryptionNonce);
  });

  it("fails to decrypt if the ciphertext has been tampered with (GCM authentication)", async () => {
    const encrypted = await crypto.encrypt({ username: "u", password: "p" });
    const tampered = {
      ...encrypted,
      payloadCiphertext: Buffer.from(encrypted.payloadCiphertext).fill(0xff, 0, 1),
    };
    await expect(crypto.decrypt(tampered)).rejects.toThrow();
  });

  it("fails to decrypt with the wrong wrapped key", async () => {
    const a = await crypto.encrypt({ username: "u1", password: "p1" });
    const b = await crypto.encrypt({ username: "u2", password: "p2" });
    await expect(
      crypto.decrypt({ ...a, wrappedDataKey: b.wrappedDataKey }),
    ).rejects.toThrow();
  });
});
