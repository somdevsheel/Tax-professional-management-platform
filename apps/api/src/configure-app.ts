import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

/**
 * Applies the same middleware/pipes/filters/prefix in both the real bootstrap (main.ts) and
 * the test harness (test/utils/test-app.ts), so integration tests exercise the exact
 * request pipeline production traffic goes through.
 */
export function configureApp(app: INestApplication): void {
  // Without this, every request behind the load balancer/CDN in docs/deployment.md's topology
  // arrives from the same proxy IP, so ThrottlerGuard's default IP-keyed rate limiting (and
  // Ip()-based audit logging) collapses every real client into one bucket instead of limiting
  // per-client (docs/security-review.md). Only trust the immediate hop, and only when the
  // deployment topology actually has one (opt-in via env, not assumed).
  if (process.env.TRUST_PROXY === "true") {
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
  }
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.WEB_APP_ORIGIN?.split(",") ?? ["http://localhost:3000"],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix("api/v1", { exclude: ["health", "health/ready"] });
}
