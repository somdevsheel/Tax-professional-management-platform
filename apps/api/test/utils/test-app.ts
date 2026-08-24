import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/configure-app";

/**
 * Boots the real AppModule (guards, DI wiring, everything) against the local dev/test
 * Postgres+Redis started by `docker compose -f infrastructure/docker-compose.yml up -d`
 * (docs/development-roadmap.md — Testing Strategy: Integration). These are integration
 * tests, not unit tests: they exercise the actual request pipeline end to end.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.test`;
}
