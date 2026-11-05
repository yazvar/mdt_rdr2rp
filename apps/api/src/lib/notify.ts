import { hasPermission } from '@mdt/shared'
import { prisma, type Effects, type Tx } from './prisma'
import { getSettings } from './settings'

export async function audience(permission: string): Promise<{ userIds: string[]; discordIds: string[] }> {
  const [users, settings] = await Promise.all([
    prisma.user.findMany({
      where: { accessGranted: true, blocked: false },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    }),
    getSettings(),
  ])
  const matched = users.filter((user) =>
    hasPermission(
      user.roles.flatMap((link) => link.role.permissions.map((item) => item.permission.key)),
      permission,
    ),
  )
  return {
    userIds: matched.map((user) => user.id),
    discordIds: [...new Set([...matched.map((user) => user.discordId), ...settings.extraRecipientDiscordIds])],
  }
}

export async function enqueueNotice(
  tx: Tx,
  effects: Effects,
  input: {
    dedupeKey: string
    kind: string
    title: string
    body: string
    module: string
    recordId: string
    userIds: string[]
    discordIds: string[]
    fields: Record<string, string | number>
    discordTitle?: string
    discordBody?: string
  },
): Promise<void> {
  const settings = await getSettings()
  const userIds = [...new Set(input.userIds.filter(Boolean))]
  if (userIds.length) {
    await tx.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        title: input.title,
        body: input.body,
        module: input.module,
        recordId: input.recordId,
      })),
    })
    for (const userId of userIds) effects.notify(userId)
  }
  if (settings.notifyEvents[input.kind] === false) return
  const discordIds = [...new Set(input.discordIds.filter(Boolean))]
  if (!discordIds.length) return
  await tx.outboxEvent.create({
    data: {
      dedupeKey: input.dedupeKey,
      kind: input.kind,
      payload: {
        title: input.discordTitle ?? input.title,
        body: input.discordBody ?? input.body,
        fields: input.fields,
        module: input.module,
        recordId: input.recordId,
      },
      deliveries: { create: discordIds.map((discordId) => ({ discordId })) },
    },
  }).catch((error: unknown) => {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code === 'P2002') return
    throw error
  })
}
