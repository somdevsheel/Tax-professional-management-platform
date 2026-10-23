-- Compliance calendar generation + deadline notifications.

-- Filing period for calendar-generated items; the unique index makes generation idempotent.
-- Hand-added items keep period NULL, and Postgres treats NULLs as distinct, so they never conflict.
ALTER TABLE "compliance_items" ADD COLUMN "period" TEXT;
CREATE UNIQUE INDEX "compliance_items_organization_id_client_id_compliance_type__key"
  ON "compliance_items"("organization_id", "client_id", "compliance_type_id", "financial_year", "period");

-- Idempotency key for reminders sent by the deadline sweep.
ALTER TABLE "notifications" ADD COLUMN "dedupe_key" TEXT;
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");
