-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'AI_VISIBILITY';

-- AlterTable
ALTER TABLE "AuditPage" ADD COLUMN "intro" TEXT;

-- CreateTable
CREATE TABLE "AiCitationRun" (
    "id" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "batch" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "citedOwn" BOOLEAN NOT NULL DEFAULT false,
    "citedWikipedia" BOOLEAN NOT NULL DEFAULT false,
    "citations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCitationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiCitationRun_objectiveId_createdAt_idx" ON "AiCitationRun"("objectiveId", "createdAt");
CREATE INDEX "AiCitationRun_objectiveId_batch_idx" ON "AiCitationRun"("objectiveId", "batch");

-- AddForeignKey
ALTER TABLE "AiCitationRun" ADD CONSTRAINT "AiCitationRun_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;
