-- Пределы наказания по статье: категория, минимум штрафа и срока, порядок в своде.

ALTER TABLE "Law" ADD COLUMN "grade" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Law" ADD COLUMN "fineMinCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Law" ADD COLUMN "jailMin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Law" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Law_grade_idx" ON "Law"("grade");
CREATE INDEX "Law_sortOrder_idx" ON "Law"("sortOrder");
