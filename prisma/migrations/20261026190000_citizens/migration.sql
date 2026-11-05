-- Картотека граждан и ссылки из розыска, штрафов и конфиската.

CREATE TABLE "Citizen" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "alias" TEXT NOT NULL DEFAULT '',
    "occupation" TEXT NOT NULL DEFAULT '',
    "residence" TEXT NOT NULL DEFAULT '',
    "marks" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "photoData" TEXT NOT NULL DEFAULT '',
    "archivedAt" TIMESTAMP(3),
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Citizen_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Citizen_lastName_firstName_idx" ON "Citizen"("lastName", "firstName");
CREATE INDEX "Citizen_archivedAt_idx" ON "Citizen"("archivedAt");

ALTER TABLE "WantedNotice" ADD COLUMN "citizenId" TEXT;
ALTER TABLE "Fine" ADD COLUMN "citizenId" TEXT;
ALTER TABLE "Seizure" ADD COLUMN "citizenId" TEXT;

CREATE INDEX "WantedNotice_citizenId_idx" ON "WantedNotice"("citizenId");
CREATE INDEX "Fine_citizenId_idx" ON "Fine"("citizenId");
CREATE INDEX "Seizure_citizenId_idx" ON "Seizure"("citizenId");

ALTER TABLE "WantedNotice" ADD CONSTRAINT "WantedNotice_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Seizure" ADD CONSTRAINT "Seizure_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
