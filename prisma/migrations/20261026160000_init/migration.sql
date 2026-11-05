-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('active', 'suspended', 'dismissed', 'on_leave');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('issued', 'returned', 'lost', 'written_off');

-- CreateEnum
CREATE TYPE "LossStatus" AS ENUM ('open', 'investigating', 'found', 'returned', 'stored', 'written_off', 'closed');

-- CreateEnum
CREATE TYPE "SeizurePropertyStatus" AS ENUM ('held', 'returned', 'stored', 'written_off');

-- CreateEnum
CREATE TYPE "LawStatus" AS ENUM ('active', 'amended', 'repealed');

-- CreateEnum
CREATE TYPE "WantedStatus" AS ENUM ('active', 'detained', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('unpaid', 'partial', 'paid', 'cancelled');

-- CreateEnum
CREATE TYPE "SentenceStatus" AS ENUM ('pending', 'served', 'cancelled', 'not_applicable');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'issued', 'closed');

-- CreateEnum
CREATE TYPE "FinanceDirection" AS ENUM ('in', 'out');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('pending', 'processing', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('success', 'failure');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "globalName" TEXT,
    "avatar" TEXT,
    "accessGranted" BOOLEAN NOT NULL DEFAULT false,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "employeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "system" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OauthAttempt" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sessionToken" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OauthAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rank" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Rank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "badgeNumber" TEXT NOT NULL,
    "rankId" TEXT NOT NULL,
    "position" TEXT,
    "discordId" TEXT,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'active',
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "contact" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "serviceComments" TEXT NOT NULL DEFAULT '',
    "archivedAt" TIMESTAMP(3),
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeHistory" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromValue" TEXT NOT NULL DEFAULT '',
    "toValue" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT,
    "actorName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "serialNumber" TEXT,
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "unitCostCents" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refType" TEXT NOT NULL DEFAULT '',
    "refId" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT,
    "actorName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentIssue" (
    "id" TEXT NOT NULL,
    "itemId" TEXT,
    "itemName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "serialNumber" TEXT,
    "employeeId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "employeeBadge" TEXT NOT NULL,
    "issuedById" TEXT,
    "issuerName" TEXT NOT NULL DEFAULT '',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "status" "IssueStatus" NOT NULL DEFAULT 'issued',
    "notes" TEXT NOT NULL DEFAULT '',
    "requestId" TEXT,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentMovement" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "fromStatus" TEXT NOT NULL DEFAULT '',
    "toStatus" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT,
    "actorName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LossRecord" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "serialNumber" TEXT,
    "responsibleEmployeeId" TEXT,
    "responsibleName" TEXT NOT NULL DEFAULT '',
    "responsibleBadge" TEXT NOT NULL DEFAULT '',
    "discoveredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "LossStatus" NOT NULL DEFAULT 'open',
    "reviewerId" TEXT,
    "reviewerName" TEXT NOT NULL DEFAULT '',
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT NOT NULL DEFAULT '',
    "equipmentIssueId" TEXT,
    "inventoryItemId" TEXT,
    "stockAdjusted" BOOLEAN NOT NULL DEFAULT false,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LossRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LossAction" (
    "id" TEXT NOT NULL,
    "lossId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL DEFAULT '',
    "toStatus" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT,
    "actorName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LossAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seizure" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "suspectFirstName" TEXT NOT NULL,
    "suspectLastName" TEXT NOT NULL,
    "seizedAt" TIMESTAMP(3) NOT NULL,
    "grounds" TEXT NOT NULL,
    "officerId" TEXT,
    "officerName" TEXT NOT NULL DEFAULT '',
    "officerBadge" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "relatedCaseRef" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "propertyStatus" "SeizurePropertyStatus" NOT NULL DEFAULT 'held',
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Seizure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeizureItem" (
    "id" TEXT NOT NULL,
    "seizureId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "SeizureItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeizureEvent" (
    "id" TEXT NOT NULL,
    "seizureId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromValue" TEXT NOT NULL DEFAULT '',
    "toValue" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT,
    "actorName" TEXT NOT NULL DEFAULT '',
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeizureEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Law" (
    "id" TEXT NOT NULL,
    "articleNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "conditions" TEXT NOT NULL DEFAULT '',
    "fineCents" INTEGER NOT NULL DEFAULT 0,
    "jailDays" INTEGER NOT NULL DEFAULT 0,
    "additionalPenalties" TEXT NOT NULL DEFAULT '',
    "status" "LawStatus" NOT NULL DEFAULT 'active',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Law_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LawRevision" (
    "id" TEXT NOT NULL,
    "lawId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT,
    "actorName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LawRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WantedNotice" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL DEFAULT '',
    "photoData" TEXT NOT NULL DEFAULT '',
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grounds" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "wantedLevel" INTEGER NOT NULL,
    "fineCents" INTEGER NOT NULL DEFAULT 0,
    "jailDays" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdByBadge" TEXT NOT NULL DEFAULT '',
    "evidence" TEXT NOT NULL DEFAULT '',
    "status" "WantedStatus" NOT NULL DEFAULT 'active',
    "closeReason" TEXT NOT NULL DEFAULT '',
    "closedAt" TIMESTAMP(3),
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WantedNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WantedCharge" (
    "id" TEXT NOT NULL,
    "wantedId" TEXT NOT NULL,
    "lawId" TEXT,
    "articleNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "WantedCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WantedEvent" (
    "id" TEXT NOT NULL,
    "wantedId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromValue" TEXT NOT NULL DEFAULT '',
    "toValue" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT,
    "actorName" TEXT NOT NULL DEFAULT '',
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WantedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fine" (
    "id" TEXT NOT NULL,
    "fineNumber" TEXT NOT NULL,
    "offenderFirstName" TEXT NOT NULL,
    "offenderLastName" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,
    "issuerName" TEXT NOT NULL DEFAULT '',
    "issuerBadge" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "calculatedCents" INTEGER NOT NULL DEFAULT 0,
    "amountCents" INTEGER NOT NULL,
    "adjusted" BOOLEAN NOT NULL DEFAULT false,
    "adjustmentReason" TEXT NOT NULL DEFAULT '',
    "jailDays" INTEGER NOT NULL DEFAULT 0,
    "additionalPenalties" TEXT NOT NULL DEFAULT '',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'unpaid',
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "sentenceStatus" "SentenceStatus" NOT NULL DEFAULT 'pending',
    "wantedId" TEXT,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FineCharge" (
    "id" TEXT NOT NULL,
    "fineId" TEXT NOT NULL,
    "lawId" TEXT,
    "articleNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fineCents" INTEGER NOT NULL DEFAULT 0,
    "jailDays" INTEGER NOT NULL DEFAULT 0,
    "additionalPenalties" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "FineCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FineEvent" (
    "id" TEXT NOT NULL,
    "fineId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromValue" TEXT NOT NULL DEFAULT '',
    "toValue" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT,
    "actorName" TEXT NOT NULL DEFAULT '',
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentRequest" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "badgeNumber" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "status" "RequestStatus" NOT NULL DEFAULT 'pending',
    "reviewedById" TEXT,
    "reviewerName" TEXT NOT NULL DEFAULT '',
    "reviewComment" TEXT NOT NULL DEFAULT '',
    "reviewedAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL DEFAULT '',
    "toStatus" TEXT NOT NULL DEFAULT '',
    "comment" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT,
    "actorName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "direction" "FinanceDirection" NOT NULL,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceEntry" (
    "id" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "direction" "FinanceDirection" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL DEFAULT '',
    "employeeId" TEXT,
    "documentRef" TEXT NOT NULL DEFAULT '',
    "sourceKey" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT '',
    "sourceId" TEXT NOT NULL DEFAULT '',
    "reversesId" TEXT,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "module" TEXT NOT NULL DEFAULT '',
    "recordId" TEXT NOT NULL DEFAULT '',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL DEFAULT '',
    "discordId" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "recordId" TEXT NOT NULL DEFAULT '',
    "oldValues" JSONB,
    "newValues" JSONB,
    "reason" TEXT NOT NULL DEFAULT '',
    "result" "AuditResult" NOT NULL DEFAULT 'success',
    "ip" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT NOT NULL DEFAULT '',
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT NOT NULL DEFAULT '',
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "OutboxDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeEvent" (
    "id" SERIAL NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SystemError" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "path" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceCounter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SequenceCounter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE INDEX "User_accessGranted_blocked_idx" ON "User"("accessGranted", "blocked");

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "Permission_module_idx" ON "Permission"("module");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OauthAttempt_state_key" ON "OauthAttempt"("state");

-- CreateIndex
CREATE INDEX "OauthAttempt_expiresAt_status_idx" ON "OauthAttempt"("expiresAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Rank_name_key" ON "Rank"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_badgeNumber_key" ON "Employee"("badgeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_discordId_key" ON "Employee"("discordId");

-- CreateIndex
CREATE INDEX "Employee_lastName_firstName_idx" ON "Employee"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Employee_status_idx" ON "Employee"("status");

-- CreateIndex
CREATE INDEX "Employee_rankId_idx" ON "Employee"("rankId");

-- CreateIndex
CREATE INDEX "EmployeeHistory_employeeId_createdAt_idx" ON "EmployeeHistory"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryItem_name_idx" ON "InventoryItem"("name");

-- CreateIndex
CREATE INDEX "InventoryItem_category_idx" ON "InventoryItem"("category");

-- CreateIndex
CREATE INDEX "InventoryItem_serialNumber_idx" ON "InventoryItem"("serialNumber");

-- CreateIndex
CREATE INDEX "StockMovement_itemId_createdAt_idx" ON "StockMovement"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_refType_refId_idx" ON "StockMovement"("refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentIssue_requestId_key" ON "EquipmentIssue"("requestId");

-- CreateIndex
CREATE INDEX "EquipmentIssue_employeeId_status_idx" ON "EquipmentIssue"("employeeId", "status");

-- CreateIndex
CREATE INDEX "EquipmentIssue_status_idx" ON "EquipmentIssue"("status");

-- CreateIndex
CREATE INDEX "EquipmentIssue_serialNumber_idx" ON "EquipmentIssue"("serialNumber");

-- CreateIndex
CREATE INDEX "EquipmentIssue_itemName_idx" ON "EquipmentIssue"("itemName");

-- CreateIndex
CREATE INDEX "EquipmentMovement_issueId_createdAt_idx" ON "EquipmentMovement"("issueId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LossRecord_caseNumber_key" ON "LossRecord"("caseNumber");

-- CreateIndex
CREATE INDEX "LossRecord_status_idx" ON "LossRecord"("status");

-- CreateIndex
CREATE INDEX "LossRecord_responsibleEmployeeId_idx" ON "LossRecord"("responsibleEmployeeId");

-- CreateIndex
CREATE INDEX "LossRecord_itemName_idx" ON "LossRecord"("itemName");

-- CreateIndex
CREATE INDEX "LossAction_lossId_createdAt_idx" ON "LossAction"("lossId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Seizure_caseNumber_key" ON "Seizure"("caseNumber");

-- CreateIndex
CREATE INDEX "Seizure_suspectLastName_suspectFirstName_idx" ON "Seizure"("suspectLastName", "suspectFirstName");

-- CreateIndex
CREATE INDEX "Seizure_seizedAt_idx" ON "Seizure"("seizedAt");

-- CreateIndex
CREATE INDEX "Seizure_officerId_idx" ON "Seizure"("officerId");

-- CreateIndex
CREATE INDEX "Seizure_propertyStatus_idx" ON "Seizure"("propertyStatus");

-- CreateIndex
CREATE INDEX "SeizureItem_seizureId_idx" ON "SeizureItem"("seizureId");

-- CreateIndex
CREATE INDEX "SeizureEvent_seizureId_createdAt_idx" ON "SeizureEvent"("seizureId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Law_articleNumber_key" ON "Law"("articleNumber");

-- CreateIndex
CREATE INDEX "Law_title_idx" ON "Law"("title");

-- CreateIndex
CREATE INDEX "Law_category_status_idx" ON "Law"("category", "status");

-- CreateIndex
CREATE INDEX "LawRevision_lawId_createdAt_idx" ON "LawRevision"("lawId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WantedNotice_caseNumber_key" ON "WantedNotice"("caseNumber");

-- CreateIndex
CREATE INDEX "WantedNotice_lastName_firstName_idx" ON "WantedNotice"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "WantedNotice_status_wantedLevel_idx" ON "WantedNotice"("status", "wantedLevel");

-- CreateIndex
CREATE INDEX "WantedNotice_postedAt_idx" ON "WantedNotice"("postedAt");

-- CreateIndex
CREATE INDEX "WantedCharge_wantedId_idx" ON "WantedCharge"("wantedId");

-- CreateIndex
CREATE INDEX "WantedCharge_lawId_idx" ON "WantedCharge"("lawId");

-- CreateIndex
CREATE INDEX "WantedEvent_wantedId_createdAt_idx" ON "WantedEvent"("wantedId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Fine_fineNumber_key" ON "Fine"("fineNumber");

-- CreateIndex
CREATE INDEX "Fine_offenderLastName_offenderFirstName_idx" ON "Fine"("offenderLastName", "offenderFirstName");

-- CreateIndex
CREATE INDEX "Fine_issuedAt_idx" ON "Fine"("issuedAt");

-- CreateIndex
CREATE INDEX "Fine_issuedById_idx" ON "Fine"("issuedById");

-- CreateIndex
CREATE INDEX "Fine_paymentStatus_idx" ON "Fine"("paymentStatus");

-- CreateIndex
CREATE INDEX "Fine_wantedId_idx" ON "Fine"("wantedId");

-- CreateIndex
CREATE INDEX "FineCharge_fineId_idx" ON "FineCharge"("fineId");

-- CreateIndex
CREATE INDEX "FineCharge_lawId_idx" ON "FineCharge"("lawId");

-- CreateIndex
CREATE INDEX "FineEvent_fineId_createdAt_idx" ON "FineEvent"("fineId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentRequest_requestNumber_key" ON "EquipmentRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "EquipmentRequest_status_createdAt_idx" ON "EquipmentRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EquipmentRequest_employeeId_idx" ON "EquipmentRequest"("employeeId");

-- CreateIndex
CREATE INDEX "RequestEvent_requestId_createdAt_idx" ON "RequestEvent"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCategory_name_direction_key" ON "FinanceCategory"("name", "direction");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceEntry_entryNumber_key" ON "FinanceEntry"("entryNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceEntry_sourceKey_key" ON "FinanceEntry"("sourceKey");

-- CreateIndex
CREATE INDEX "FinanceEntry_occurredAt_idx" ON "FinanceEntry"("occurredAt");

-- CreateIndex
CREATE INDEX "FinanceEntry_categoryId_idx" ON "FinanceEntry"("categoryId");

-- CreateIndex
CREATE INDEX "FinanceEntry_direction_idx" ON "FinanceEntry"("direction");

-- CreateIndex
CREATE INDEX "FinanceEntry_sourceType_sourceId_idx" ON "FinanceEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_module_recordId_idx" ON "AuditLog"("module", "recordId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_dedupeKey_key" ON "OutboxEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "OutboxDelivery_status_idx" ON "OutboxDelivery"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxDelivery_eventId_discordId_key" ON "OutboxDelivery"("eventId", "discordId");

-- CreateIndex
CREATE INDEX "ChangeEvent_module_createdAt_idx" ON "ChangeEvent"("module", "createdAt");

-- CreateIndex
CREATE INDEX "SystemError_createdAt_idx" ON "SystemError"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_rankId_fkey" FOREIGN KEY ("rankId") REFERENCES "Rank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeHistory" ADD CONSTRAINT "EmployeeHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentIssue" ADD CONSTRAINT "EquipmentIssue_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentIssue" ADD CONSTRAINT "EquipmentIssue_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentIssue" ADD CONSTRAINT "EquipmentIssue_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentIssue" ADD CONSTRAINT "EquipmentIssue_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "EquipmentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentMovement" ADD CONSTRAINT "EquipmentMovement_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "EquipmentIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LossRecord" ADD CONSTRAINT "LossRecord_responsibleEmployeeId_fkey" FOREIGN KEY ("responsibleEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LossRecord" ADD CONSTRAINT "LossRecord_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LossRecord" ADD CONSTRAINT "LossRecord_equipmentIssueId_fkey" FOREIGN KEY ("equipmentIssueId") REFERENCES "EquipmentIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LossRecord" ADD CONSTRAINT "LossRecord_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LossAction" ADD CONSTRAINT "LossAction_lossId_fkey" FOREIGN KEY ("lossId") REFERENCES "LossRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seizure" ADD CONSTRAINT "Seizure_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeizureItem" ADD CONSTRAINT "SeizureItem_seizureId_fkey" FOREIGN KEY ("seizureId") REFERENCES "Seizure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeizureEvent" ADD CONSTRAINT "SeizureEvent_seizureId_fkey" FOREIGN KEY ("seizureId") REFERENCES "Seizure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawRevision" ADD CONSTRAINT "LawRevision_lawId_fkey" FOREIGN KEY ("lawId") REFERENCES "Law"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WantedNotice" ADD CONSTRAINT "WantedNotice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WantedCharge" ADD CONSTRAINT "WantedCharge_wantedId_fkey" FOREIGN KEY ("wantedId") REFERENCES "WantedNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WantedCharge" ADD CONSTRAINT "WantedCharge_lawId_fkey" FOREIGN KEY ("lawId") REFERENCES "Law"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WantedEvent" ADD CONSTRAINT "WantedEvent_wantedId_fkey" FOREIGN KEY ("wantedId") REFERENCES "WantedNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_wantedId_fkey" FOREIGN KEY ("wantedId") REFERENCES "WantedNotice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FineCharge" ADD CONSTRAINT "FineCharge_fineId_fkey" FOREIGN KEY ("fineId") REFERENCES "Fine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FineCharge" ADD CONSTRAINT "FineCharge_lawId_fkey" FOREIGN KEY ("lawId") REFERENCES "Law"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FineEvent" ADD CONSTRAINT "FineEvent_fineId_fkey" FOREIGN KEY ("fineId") REFERENCES "Fine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRequest" ADD CONSTRAINT "EquipmentRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRequest" ADD CONSTRAINT "EquipmentRequest_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "EquipmentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxDelivery" ADD CONSTRAINT "OutboxDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "OutboxEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
