import { SETTING_KEYS } from '@mdt/shared'
import { prisma } from '../lib/prisma'

export async function purgeReleaseData() {
  return prisma.$transaction(
    async (tx) => {
      const [users, employees, citizens, demoLaws, fines, wanted, seizures] = await Promise.all([
        tx.user.count(),
        tx.employee.count(),
        tx.citizen.count(),
        tx.law.count({ where: { isDemo: true } }),
        tx.fine.count(),
        tx.wantedNotice.count(),
        tx.seizure.count(),
      ])
      await tx.outboxDelivery.deleteMany()
      await tx.outboxEvent.deleteMany()
      await tx.notification.deleteMany()
      await tx.session.deleteMany()
      await tx.oauthAttempt.deleteMany()
      await tx.idempotencyKey.deleteMany()
      await tx.fineEvent.deleteMany()
      await tx.fineCharge.deleteMany()
      await tx.fine.deleteMany()
      await tx.wantedEvent.deleteMany()
      await tx.wantedCharge.deleteMany()
      await tx.wantedNotice.deleteMany()
      await tx.law.deleteMany({ where: { isDemo: true } })
      await tx.seizureEvent.deleteMany()
      await tx.seizureItem.deleteMany()
      await tx.seizure.deleteMany()
      await tx.caseFile.deleteMany()
      await tx.citizen.deleteMany()
      await tx.lossAction.deleteMany()
      await tx.lossRecord.deleteMany()
      await tx.equipmentMovement.deleteMany()
      await tx.equipmentIssue.deleteMany()
      await tx.requestEvent.deleteMany()
      await tx.equipmentRequest.deleteMany()
      await tx.stockMovement.deleteMany()
      await tx.inventoryItem.deleteMany()
      await tx.financeEntry.deleteMany()
      await tx.employeeHistory.deleteMany()
      await tx.auditLog.deleteMany()
      await tx.changeEvent.deleteMany()
      await tx.systemError.deleteMany()
      await tx.userRole.deleteMany()
      await tx.user.deleteMany()
      await tx.employee.deleteMany()
      await tx.sequenceCounter.deleteMany()
      await tx.appSetting.upsert({
        where: { key: SETTING_KEYS.demoSeeded },
        create: { key: SETTING_KEYS.demoSeeded, value: false },
        update: { value: false },
      })
      const laws = await tx.law.count()
      return { users, employees, citizens, demoLaws, fines, wanted, seizures, lawsKept: laws }
    },
    { timeout: 120_000, maxWait: 10_000 },
  )
}
