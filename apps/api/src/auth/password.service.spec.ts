import { ConfigService } from "@nestjs/config";
import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  const service = new PasswordService(new ConfigService({ PASSWORD_PEPPER: "test-pepper" }));

  it("hashes a password as Argon2id, never storing plaintext", async () => {
    const hash = await service.hash("correct-horse-battery-staple");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain("correct-horse-battery-staple");
  });

  it("verifies a correct password and rejects an incorrect one", async () => {
    const hash = await service.hash("correct-horse-battery-staple");
    await expect(service.verify(hash, "correct-horse-battery-staple")).resolves.toBe(true);
    await expect(service.verify(hash, "wrong-password")).resolves.toBe(false);
  });

  it("produces different ciphertext for the same password on repeated hashes (unique salt)", async () => {
    const first = await service.hash("same-password");
    const second = await service.hash("same-password");
    expect(first).not.toEqual(second);
  });
});
