import { RbacService } from "./rbac.service";
import type { PrismaService } from "../infra/prisma/prisma.service";

describe("RbacService", () => {
  function buildService(findUniqueResult: unknown) {
    const prisma = {
      organizationMember: { findUnique: jest.fn().mockResolvedValue(findUniqueResult) },
    } as unknown as PrismaService;
    return new RbacService(prisma);
  }

  it("resolves permissions from the caller's role", async () => {
    const service = buildService({
      status: "ACTIVE",
      role: {
        permissions: [
          { permission: { code: "clients.view" } },
          { permission: { code: "clients.create" } },
        ],
      },
    });

    const permissions = await service.getPermissionsForMember("user-1", "org-1");
    expect(permissions.has("clients.view")).toBe(true);
    expect(permissions.has("clients.create")).toBe(true);
    expect(permissions.has("credentials.delete")).toBe(false);
  });

  it("returns no permissions for a member with no membership row", async () => {
    const service = buildService(null);
    const permissions = await service.getPermissionsForMember("user-1", "org-1");
    expect(permissions.size).toBe(0);
  });

  it("returns no permissions for a disabled membership", async () => {
    const service = buildService({ status: "DISABLED", role: { permissions: [] } });
    const permissions = await service.getPermissionsForMember("user-1", "org-1");
    expect(permissions.size).toBe(0);
  });

  it("hasPermission reflects the resolved set", async () => {
    const service = buildService({
      status: "ACTIVE",
      role: { permissions: [{ permission: { code: "tasks.view" } }] },
    });
    await expect(service.hasPermission("user-1", "org-1", "tasks.view")).resolves.toBe(true);
    await expect(service.hasPermission("user-1", "org-1", "tasks.create")).resolves.toBe(false);
  });
});
