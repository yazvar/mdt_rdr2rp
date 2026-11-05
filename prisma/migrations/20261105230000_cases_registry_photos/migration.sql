-- Дела, ссылка на фото гражданина, номер дела у конфиската и регистрация вооружения.

ALTER TABLE "Citizen" ADD COLUMN "photoUrl" TEXT NOT NULL DEFAULT '';

CREATE TYPE "CaseStatus" AS ENUM ('open', 'closed');

CREATE TABLE "CaseFile" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'open',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" TEXT NOT NULL DEFAULT '',
    "citizenId" TEXT,
    "suspectFirstName" TEXT NOT NULL DEFAULT '',
    "suspectLastName" TEXT NOT NULL DEFAULT '',
    "officerId" TEXT,
    "officerName" TEXT NOT NULL DEFAULT '',
    "officerBadge" TEXT NOT NULL DEFAULT '',
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT NOT NULL DEFAULT '',
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CaseFile_caseNumber_key" ON "CaseFile"("caseNumber");
CREATE INDEX "CaseFile_status_openedAt_idx" ON "CaseFile"("status", "openedAt");
CREATE INDEX "CaseFile_citizenId_idx" ON "CaseFile"("citizenId");
CREATE INDEX "CaseFile_officerId_idx" ON "CaseFile"("officerId");
CREATE INDEX "CaseFile_title_idx" ON "CaseFile"("title");

ALTER TABLE "CaseFile" ADD CONSTRAINT "CaseFile_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CaseFile" ADD CONSTRAINT "CaseFile_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Seizure" ADD COLUMN "caseId" TEXT;
CREATE INDEX "Seizure_caseId_idx" ON "Seizure"("caseId");
ALTER TABLE "Seizure" ADD CONSTRAINT "Seizure_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CaseFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EquipmentRequest" ADD COLUMN "serialNumber" TEXT;

ALTER TYPE "RequestStatus" ADD VALUE 'registered';
