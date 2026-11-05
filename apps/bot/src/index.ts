import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'
import http from 'http'
import { PrismaClient } from '@prisma/client'
import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js'
import { hasPermission, PERMISSIONS } from '@mdt/shared'

loadEnv({ path: resolve(process.cwd(), '.env') })
loadEnv({ path: resolve(process.cwd(), '../../.env') })

const prisma = new PrismaClient()
const token = process.env.DISCORD_BOT_TOKEN?.trim() ?? ''
const clientId = process.env.DISCORD_CLIENT_ID?.trim() ?? ''
const guildId = process.env.DISCORD_GUILD_ID?.trim() ?? ''
const healthUrl = process.env.API_HEALTH_URL?.trim() || 'http://localhost:3000/health'
const port = Number(process.env.PORT) || 3002
const MAX_ATTEMPTS = 5

const commands = [
  new SlashCommandBuilder().setName('mdt-status').setDescription('Статус соединения с архивом MDT'),
  new SlashCommandBuilder().setName('mdt-help').setDescription('Какие команды есть у бота MDT'),
  new SlashCommandBuilder()
    .setName('mdt-notify')
    .setDescription('Отправить проверочное уведомление')
    .addUserOption((option) => option.setName('user').setDescription('Получатель').setRequired(false)),
].map((command) => command.toJSON())

function log(message: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ level: 'info', message, ...extra, time: new Date().toISOString() }))
}

function permanentDiscordError(error: unknown): boolean {
  const code = typeof error === 'object' && error && 'code' in error ? Number(error.code) : 0
  return code === 50007 || code === 10013 || code === 50001
}

function errorText(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? Number(error.code) : 0
  if (code === 50007) return 'Получатель закрыл личные сообщения.'
  if (code === 10013) return 'Такого пользователя Discord нет.'
  if (code === 50001) return 'Боту не хватает доступа, чтобы написать этому пользователю.'
  const message = error instanceof Error ? error.message : ''
  if (/[А-Яа-яЁё]/.test(message)) return message.slice(0, 300)
  return 'Не удалось отправить сообщение в Discord.'
}

function render(payload: unknown): string {
  const data = (payload ?? {}) as { title?: string; body?: string; fields?: Record<string, string | number> }
  const fields = Object.entries(data.fields ?? {})
    .map(([name, value]) => `**${name}:** ${value}`)
    .join('\n')
  const link = process.env.MDT_PUBLIC_URL?.trim()
    ? process.env.MDT_PUBLIC_URL.trim()
    : 'Откройте MDT, чтобы рассмотреть запись.'
  return [`**${data.title || 'Шерифский департамент'}**`, fields, data.body || '', link].filter(Boolean).join('\n')
}

async function sendDm(discordId: string, content: string): Promise<void> {
  const user = await client.users.fetch(discordId)
  await user.send({ content: content.slice(0, 1900) })
}

async function deliverOnce(): Promise<void> {
  const events = await prisma.outboxEvent.findMany({
    where: { status: 'pending', availableAt: { lte: new Date() } },
    include: { deliveries: true },
    orderBy: { createdAt: 'asc' },
    take: 8,
  })
  for (const event of events) {
    const claimed = await prisma.outboxEvent.updateMany({
      where: { id: event.id, status: 'pending' },
      data: { status: 'processing', attempts: { increment: 1 } },
    })
    if (claimed.count !== 1) continue
    let retry = false
    for (const delivery of event.deliveries) {
      if (delivery.status === 'sent' || delivery.status === 'failed') continue
      try {
        await sendDm(delivery.discordId, render(event.payload))
        await prisma.outboxDelivery.update({
          where: { id: delivery.id },
          data: { status: 'sent', sentAt: new Date(), lastError: '' },
        })
      } catch (error) {
        const text = errorText(error)
        log('discord dm failed', { discordId: delivery.discordId, message: text })
        if (permanentDiscordError(error) || delivery.attempts + 1 >= MAX_ATTEMPTS) {
          await prisma.outboxDelivery.update({
            where: { id: delivery.id },
            data: { status: 'failed', attempts: { increment: 1 }, lastError: text },
          })
          await prisma.systemError.create({
            data: { source: 'bot', message: text, details: `event ${event.id} discord ${delivery.discordId}`, path: event.kind },
          })
        } else {
          retry = true
          await prisma.outboxDelivery.update({
            where: { id: delivery.id },
            data: { attempts: { increment: 1 }, lastError: text },
          })
        }
      }
    }
    const attempts = event.attempts + 1
    if (retry && attempts < MAX_ATTEMPTS) {
      const delay = Math.min(60_000 * 2 ** attempts, 15 * 60_000)
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'pending', availableAt: new Date(Date.now() + delay), lastError: 'повторная отправка' },
      })
    } else {
      const deliveries = await prisma.outboxDelivery.findMany({ where: { eventId: event.id } })
      const sent = deliveries.some((item) => item.status === 'sent')
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: retry ? 'failed' : sent || deliveries.length === 0 ? 'sent' : 'failed',
          processedAt: new Date(),
          lastError: retry ? 'исчерпаны попытки' : '',
        },
      })
    }
  }
}

const bootstrap = (process.env.BOOTSTRAP_DISCORD_IDS ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

async function isOperator(discordId: string): Promise<boolean> {
  if (bootstrap.includes(discordId)) return true
  const user = await prisma.user.findUnique({
    where: { discordId },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  })
  if (!user || !user.accessGranted || user.blocked) return false
  return hasPermission(
    user.roles.flatMap((link) => link.role.permissions.map((item) => item.permission.key)),
    PERMISSIONS.adminAccess,
  )
}

async function onCommand(interaction: ChatInputCommandInteraction) {
  if (!(await isOperator(interaction.user.id))) {
    await interaction.reply({ content: 'Эта команда доступна только администратору MDT.', ephemeral: true })
    return
  }
  if (interaction.commandName === 'mdt-help') {
    await interaction.reply({
      content: ['**Команды MDT**', '`/mdt-status` — связь с архивом и очередь уведомлений', '`/mdt-notify` — проверочное личное сообщение', '`/mdt-help` — этот список'].join('\n'),
      ephemeral: true,
    })
    return
  }
  if (interaction.commandName === 'mdt-status') {
    let api = 'не отвечает'
    try {
      const response = await fetch(healthUrl)
      api = response.ok ? 'архив доступен' : `ошибка ${response.status}`
    } catch {
      api = 'нет соединения'
    }
    const pending = await prisma.outboxEvent.count({ where: { status: 'pending' } })
    await interaction.reply({ content: `MDT: ${api}. Ожидают отправки: ${pending}.`, ephemeral: true })
    return
  }
  const target = interaction.options.getUser('user') ?? interaction.user
  try {
    await sendDm(target.id, '**ШЕРИФСКИЙ ДЕПАРТАМЕНТ**\nПроверочное уведомление MDT. Если вы читаете это письмо, личные сообщения от бота доходят.')
    await interaction.reply({ content: `Проверочное письмо отправлено: ${target.tag}.`, ephemeral: true })
  } catch (error) {
    await interaction.reply({ content: `Не удалось отправить письмо. ${errorText(error)}`, ephemeral: true })
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

async function registerCommands() {
  if (!clientId || !token) return
  const rest = new REST({ version: '10' }).setToken(token)
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands })
    log('guild commands registered', { guildId })
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: commands })
    log('global commands registered')
  }
}

client.once(Events.ClientReady, (ready) => {
  log('bot ready', { user: ready.user.tag })
})

client.on(Events.InteractionCreate, (interaction) => {
  if (!interaction.isChatInputCommand()) return
  onCommand(interaction).catch((error) => log('command failed', { message: errorText(error) }))
})

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, discord: client.isReady() }))
    return
  }
  res.writeHead(404)
  res.end()
})

async function main() {
  if (process.env.NODE_ENV === 'production' && !token) throw new Error('DISCORD_BOT_TOKEN is required in production')
  server.listen(port, '0.0.0.0', () => log('bot health listening', { port }))
  if (!token) {
    log('bot token is empty, discord gateway not started')
    return
  }
  await registerCommands()
  await client.login(token)
  setInterval(() => {
    deliverOnce().catch(async (error) => {
      const message = errorText(error)
      log('outbox failed', { message })
      await prisma.systemError.create({ data: { source: 'bot', message, path: 'outbox' } }).catch(() => undefined)
    })
  }, 4000)
}

main().catch((error) => {
  log('bot failed to start', { message: errorText(error) })
  process.exit(1)
})
