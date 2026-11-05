export class StockError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export function nextQuantity(current: number, delta: number): number {
  if (!Number.isInteger(current) || !Number.isInteger(delta)) {
    throw new StockError('NOT_INTEGER', 'Количество должно быть целым числом.')
  }
  const next = current + delta
  if (next < 0) {
    throw new StockError('INSUFFICIENT', 'На складе недостаточно предмета для этой операции.')
  }
  return next
}

export function assertPositiveQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new StockError('QUANTITY', 'Количество должно быть больше нуля.')
  }
}

const REQUEST_TRANSITIONS: Record<string, string[]> = {
  pending: ['approved', 'rejected'],
  approved: ['issued', 'rejected', 'closed'],
  rejected: ['closed'],
  issued: ['closed'],
  closed: [],
}

const requestState: Record<string, string> = {
  pending: 'ожидает решения',
  approved: 'одобрен',
  rejected: 'отклонён',
  issued: 'выдан',
  closed: 'закрыт',
}

export function assertRequestTransition(from: string, to: string): void {
  const allowed = REQUEST_TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    throw new StockError(
      'BAD_TRANSITION',
      `Нельзя перевести запрос из состояния «${requestState[from] ?? 'неизвестно'}» в «${requestState[to] ?? 'неизвестно'}».`,
    )
  }
}

export function quantitiesMatchLedger(onHand: number, movementDeltas: number[]): boolean {
  const sum = movementDeltas.reduce((total, delta) => total + delta, 0)
  return sum === onHand
}
