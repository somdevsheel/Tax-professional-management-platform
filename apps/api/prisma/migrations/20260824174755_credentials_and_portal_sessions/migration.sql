/*
  Warnings:

  - You are about to drop the column `password_ciphertext` on the `credentials` table. All the data in the column will be lost.
  - You are about to drop the column `username_ciphertext` on the `credentials` table. All the data in the column will be lost.
  - Added the required column `payload_ciphertext` to the `credentials` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PortalSessionStatus" AS ENUM ('PENDING', 'CREDENTIAL_ISSUED', 'AWAITING_USER_CHALLENGE', 'COMPLETED', 'FAILED', 'EXPIRED');

-- AlterTable
ALTER TABLE "credentials" DROP COLUMN "password_ciphertext",
DROP COLUMN "username_ciphertext",
ADD COLUMN     "payload_ciphertext" BYTEA NOT NULL;

-- CreateTable
CREATE TABLE "portal_sessions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "initiated_by" TEXT NOT NULL,
    "status" "PortalSessionStatus" NOT NULL DEFAULT 'PENDING',
    "one_time_token_hash" TEXT NOT NULL,
    "one_time_token_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_session_events" (
    "id" TEXT NOT NULL,
    "portal_session_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_session_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_sessions_one_time_token_hash_key" ON "portal_sessions"("one_time_token_hash");

-- CreateIndex
CREATE INDEX "portal_sessions_organization_id_client_id_idx" ON "portal_sessions"("organization_id", "client_id");

-- AddForeignKey
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_session_events" ADD CONSTRAINT "portal_session_events_portal_session_id_fkey" FOREIGN KEY ("portal_session_id") REFERENCES "portal_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
