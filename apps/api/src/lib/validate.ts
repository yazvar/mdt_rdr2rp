import type { ZodTypeAny } from 'zod'
import { HttpError } from './http'

export function parseBody<T>(schema: ZodTypeAny, body: unknown): T {
  const result = schema.safeParse(body ?? {})
  if (!result.success) {
    const first = result.error.issues[0]
    throw new HttpError(400, 'VALIDATION', shown(first?.message), result.error.flatten())
  }
  return result.data as T
}

export function parseQuery<T>(schema: ZodTypeAny, query: unknown): T {
  const result = schema.safeParse(query ?? {})
  if (!result.success) {
    throw new HttpError(400, 'VALIDATION', 'Некорректные параметры запроса.', result.error.flatten())
  }
  return result.data as T
}

function shown(message: string | undefined): string {
  if (message && /[А-Яа-яЁё]/.test(message)) return message
  return 'Проверьте заполнение формы.'
}

export function paging(query: { page: number; pageSize: number }): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize }
}

export function assertPhoto(data: string | undefined): void {
  if (!data) return
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=\r\n]+$/i.test(data)) {
    throw new HttpError(400, 'PHOTO', 'Фотография должна быть изображением PNG, JPEG или WebP.')
  }
  if (data.length > 550_000) throw new HttpError(400, 'PHOTO', 'Фотография слишком большая.')
}
