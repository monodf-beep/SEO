-- AlterTable
ALTER TABLE "Objective" ADD COLUMN "surfaces" TEXT[] DEFAULT ARRAY[]::TEXT[];
