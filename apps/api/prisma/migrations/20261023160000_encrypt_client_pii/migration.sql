-- Client PII encryption at rest (docs/security-design.md §5a).
--
-- Plaintext PII columns are RENAMED to legacy_* rather than dropped, so no deploy ordering can
-- lose data: on boot, ClientPiiBackfillService encrypts every row that still has legacy values
-- into pii_ciphertext and nulls the plaintext. A later migration drops the legacy_* columns once
-- every environment has been backfilled.

-- Per-organization data keys (wrapped by the KMS KEK; never stored in the clear).
CREATE TABLE "organization_data_keys" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "wrapped_key" BYTEA NOT NULL,
    "kek_version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_data_keys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organization_data_keys_organization_id_version_key" ON "organization_data_keys"("organization_id", "version");
ALTER TABLE "organization_data_keys" ADD CONSTRAINT "organization_data_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- clients: plaintext indexes on identifiers go; blind-index indexes replace them.
DROP INDEX "clients_organization_id_pan_idx";
DROP INDEX "clients_organization_id_gstin_idx";
DROP INDEX "clients_organization_id_tan_idx";
DROP INDEX "clients_organization_id_cin_idx";

ALTER TABLE "clients" RENAME COLUMN "pan" TO "legacy_pan";
ALTER TABLE "clients" RENAME COLUMN "gstin" TO "legacy_gstin";
ALTER TABLE "clients" RENAME COLUMN "tan" TO "legacy_tan";
ALTER TABLE "clients" RENAME COLUMN "cin" TO "legacy_cin";
ALTER TABLE "clients" RENAME COLUMN "address" TO "legacy_address";
ALTER TABLE "clients" RENAME COLUMN "email" TO "legacy_email";
ALTER TABLE "clients" RENAME COLUMN "phone" TO "legacy_phone";
ALTER TABLE "clients" RENAME COLUMN "contact_person" TO "legacy_contact_person";
ALTER TABLE "clients" RENAME COLUMN "notes" TO "legacy_notes";

ALTER TABLE "clients" ADD COLUMN "pii_ciphertext" BYTEA,
ADD COLUMN "pii_key_id" TEXT,
ADD COLUMN "pan_bidx" BYTEA,
ADD COLUMN "gstin_bidx" BYTEA,
ADD COLUMN "tan_bidx" BYTEA,
ADD COLUMN "cin_bidx" BYTEA;

CREATE INDEX "clients_organization_id_pan_bidx_idx" ON "clients"("organization_id", "pan_bidx");
CREATE INDEX "clients_organization_id_gstin_bidx_idx" ON "clients"("organization_id", "gstin_bidx");
CREATE INDEX "clients_organization_id_tan_bidx_idx" ON "clients"("organization_id", "tan_bidx");
CREATE INDEX "clients_organization_id_cin_bidx_idx" ON "clients"("organization_id", "cin_bidx");

-- client_contacts
ALTER TABLE "client_contacts" RENAME COLUMN "name" TO "legacy_name";
ALTER TABLE "client_contacts" ALTER COLUMN "legacy_name" DROP NOT NULL;
ALTER TABLE "client_contacts" RENAME COLUMN "role" TO "legacy_role";
ALTER TABLE "client_contacts" RENAME COLUMN "email" TO "legacy_email";
ALTER TABLE "client_contacts" RENAME COLUMN "phone" TO "legacy_phone";
ALTER TABLE "client_contacts" ADD COLUMN "pii_ciphertext" BYTEA,
ADD COLUMN "pii_key_id" TEXT;
