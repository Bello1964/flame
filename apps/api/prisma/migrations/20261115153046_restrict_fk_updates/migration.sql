-- Prisma does not run migrations in a transaction; wrap explicitly so this
-- migration applies completely or not at all (PostgreSQL DDL is transactional).
BEGIN;

-- DropForeignKey
ALTER TABLE "assets" DROP CONSTRAINT "assets_createdById_fkey";

-- DropForeignKey
ALTER TABLE "assets" DROP CONSTRAINT "assets_organisationId_facilityId_fkey";

-- DropForeignKey
ALTER TABLE "assets" DROP CONSTRAINT "assets_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actorUserId_fkey";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "facilities" DROP CONSTRAINT "facilities_createdById_fkey";

-- DropForeignKey
ALTER TABLE "facilities" DROP CONSTRAINT "facilities_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "flare_sources" DROP CONSTRAINT "flare_sources_createdById_fkey";

-- DropForeignKey
ALTER TABLE "flare_sources" DROP CONSTRAINT "flare_sources_organisationId_assetId_fkey";

-- DropForeignKey
ALTER TABLE "flare_sources" DROP CONSTRAINT "flare_sources_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_userId_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_userId_fkey";

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_organisationId_facilityId_fkey" FOREIGN KEY ("organisationId", "facilityId") REFERENCES "facilities"("organisationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "flare_sources" ADD CONSTRAINT "flare_sources_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "flare_sources" ADD CONSTRAINT "flare_sources_organisationId_assetId_fkey" FOREIGN KEY ("organisationId", "assetId") REFERENCES "assets"("organisationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "flare_sources" ADD CONSTRAINT "flare_sources_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
