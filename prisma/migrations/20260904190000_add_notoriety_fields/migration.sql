-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActionType" ADD VALUE 'PRESS';
ALTER TYPE "ActionType" ADD VALUE 'PROFILE';
ALTER TYPE "ActionType" ADD VALUE 'SOCIAL';

-- AlterTable
ALTER TABLE "Objective" ADD COLUMN     "directories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "entityName" TEXT,
ADD COLUMN     "guestSites" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mediaBlogs" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "rivalSites" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "socialProfiles" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "wikiArticles" TEXT[] DEFAULT ARRAY[]::TEXT[];

