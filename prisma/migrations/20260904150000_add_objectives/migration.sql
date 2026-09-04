-- CreateEnum
CREATE TYPE "ObjectiveStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DONE');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('CONTENT_NEW', 'CONTENT_UPDATE', 'TERMINOLOGY', 'INTERNAL_LINK', 'BACKLINK', 'WIKIPEDIA', 'TECHNICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'DISMISSED');

-- CreateTable
CREATE TABLE "Objective" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "siteIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "focusTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rivalTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetShare" DOUBLE PRECISION,
    "deadline" TIMESTAMP(3),
    "status" "ObjectiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Objective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectiveAction" (
    "id" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "siteId" TEXT,
    "type" "ActionType" NOT NULL,
    "status" "ActionStatus" NOT NULL DEFAULT 'TODO',
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "query" TEXT,
    "url" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "fingerprint" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "ObjectiveAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Objective_userId_idx" ON "Objective"("userId");

-- CreateIndex
CREATE INDEX "Objective_parentId_idx" ON "Objective"("parentId");

-- CreateIndex
CREATE INDEX "ObjectiveAction_objectiveId_status_idx" ON "ObjectiveAction"("objectiveId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ObjectiveAction_objectiveId_fingerprint_key" ON "ObjectiveAction"("objectiveId", "fingerprint");

-- AddForeignKey
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectiveAction" ADD CONSTRAINT "ObjectiveAction_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectiveAction" ADD CONSTRAINT "ObjectiveAction_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

