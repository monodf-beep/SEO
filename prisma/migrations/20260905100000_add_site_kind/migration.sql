-- CreateEnum
CREATE TYPE "SiteKind" AS ENUM ('WEBSITE', 'PROFILE');

-- AlterTable
ALTER TABLE "Site" ADD COLUMN "kind" "SiteKind" NOT NULL DEFAULT 'WEBSITE';
