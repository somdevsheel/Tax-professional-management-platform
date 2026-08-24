/**
 * Seeds system roles/permissions and the initial portal catalog.
 * Must run before the first registration (AuthService.register fails loudly without a
 * seeded FIRM_ADMIN role — see docs/development-roadmap.md).
 *
 * The permission catalog and default role grants mirror @tax-platform/types (packages/types/src/rbac.ts)
 * — kept as literals here rather than imported, so this script has no build-order dependency
 * on the shared package. Keep the two in sync when the permission catalog changes.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PERMISSIONS: Array<{ code: string; category: string; description: string }> = [
  { code: "clients.view", category: "clients", description: "View client records" },
  { code: "clients.create", category: "clients", description: "Create client records" },
  { code: "clients.update", category: "clients", description: "Update client records" },
  { code: "clients.delete", category: "clients", description: "Delete client records" },
  { code: "credentials.view", category: "credentials", description: "View credential metadata" },
  { code: "credentials.create", category: "credentials", description: "Create portal credentials" },
  { code: "credentials.update", category: "credentials", description: "Rotate/update credentials" },
  { code: "credentials.delete", category: "credentials", description: "Delete credentials" },
  { code: "credentials.use", category: "credentials", description: "Use a credential to start a portal login" },
  { code: "credentials.reveal", category: "credentials", description: "Reveal plaintext credential (step-up auth required)" },
  { code: "documents.view", category: "documents", description: "View/download documents" },
  { code: "documents.upload", category: "documents", description: "Upload documents" },
  { code: "documents.delete", category: "documents", description: "Delete documents" },
  { code: "tasks.view", category: "tasks", description: "View tasks" },
  { code: "tasks.create", category: "tasks", description: "Create tasks" },
  { code: "tasks.assign", category: "tasks", description: "Assign tasks" },
  { code: "tasks.complete", category: "tasks", description: "Complete tasks" },
  { code: "compliance.view", category: "compliance", description: "View compliance items" },
  { code: "compliance.manage", category: "compliance", description: "Manage compliance items" },
  { code: "employees.manage", category: "employees", description: "Manage firm members and roles" },
  { code: "reports.view", category: "reports", description: "View reports" },
  { code: "audit_logs.view", category: "audit", description: "View audit logs" },
  { code: "settings.manage", category: "settings", description: "Manage firm settings" },
];

const ALL_CODES = PERMISSIONS.map((p) => p.code);

const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ALL_CODES,
  FIRM_ADMIN: ALL_CODES,
  CA: [
    "clients.view", "clients.create", "clients.update",
    "credentials.view", "credentials.create", "credentials.update", "credentials.use", "credentials.reveal",
    "documents.view", "documents.upload", "documents.delete",
    "tasks.view", "tasks.create", "tasks.assign", "tasks.complete",
    "compliance.view", "compliance.manage",
    "employees.manage", "reports.view", "audit_logs.view",
  ],
  MANAGER: [
    "clients.view", "clients.create", "clients.update",
    "credentials.view", "credentials.create", "credentials.update", "credentials.use",
    "documents.view", "documents.upload", "documents.delete",
    "tasks.view", "tasks.create", "tasks.assign", "tasks.complete",
    "compliance.view", "compliance.manage", "reports.view",
  ],
  ACCOUNTANT: [
    "clients.view", "clients.update",
    "credentials.view", "credentials.use",
    "documents.view", "documents.upload",
    "tasks.view", "tasks.create", "tasks.complete",
    "compliance.view", "compliance.manage",
  ],
  STAFF: [
    "clients.view",
    "credentials.view", "credentials.use",
    "documents.view", "documents.upload",
    "tasks.view", "tasks.complete",
    "compliance.view",
  ],
  READ_ONLY: ["clients.view", "documents.view", "tasks.view", "compliance.view", "reports.view"],
};

const PORTALS: Array<{ code: string; name: string; category: string; baseUrl: string; loginUrl: string }> = [
  { code: "GST", name: "GST Portal", category: "GST", baseUrl: "https://www.gst.gov.in", loginUrl: "https://services.gst.gov.in/services/login" },
  { code: "INCOME_TAX", name: "Income Tax e-Filing", category: "INCOME_TAX", baseUrl: "https://www.incometax.gov.in", loginUrl: "https://eportal.incometax.gov.in/iec/foservices/#/login" },
  { code: "TRACES", name: "TRACES", category: "TDS", baseUrl: "https://www.tdscpc.gov.in", loginUrl: "https://www.tdscpc.gov.in/app/login.xhtml" },
  { code: "MCA", name: "MCA21", category: "MCA", baseUrl: "https://www.mca.gov.in", loginUrl: "https://www.mca.gov.in/mcafoportal/login.do" },
  { code: "EPFO", name: "EPFO Employer Portal", category: "OTHER", baseUrl: "https://www.epfindia.gov.in", loginUrl: "https://unifiedportal-emp.epfindia.gov.in/epfo/" },
  { code: "ESIC", name: "ESIC Portal", category: "OTHER", baseUrl: "https://www.esic.gov.in", loginUrl: "https://www.esic.gov.in/employerlogin" },
  { code: "DGFT", name: "DGFT", category: "OTHER", baseUrl: "https://www.dgft.gov.in", loginUrl: "https://www.dgft.gov.in/CP/" },
];

async function main() {
  console.log("Seeding permissions...");
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { description: p.description, category: p.category },
      create: p,
    });
  }

  console.log("Seeding system roles...");
  for (const [roleName, permissionCodes] of Object.entries(ROLE_PERMISSIONS)) {
    let role = await prisma.role.findFirst({
      where: { organizationId: null, name: roleName, isSystem: true },
    });
    if (!role) {
      role = await prisma.role.create({
        data: { organizationId: null, name: roleName, isSystem: true },
      });
    }

    const permissions = await prisma.permission.findMany({ where: { code: { in: permissionCodes } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role!.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  console.log("Seeding portal catalog...");
  for (const portal of PORTALS) {
    await prisma.portal.upsert({
      where: { code: portal.code },
      update: { name: portal.name, category: portal.category, baseUrl: portal.baseUrl, loginUrl: portal.loginUrl },
      create: { ...portal, isActive: true, configSchema: {} },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
