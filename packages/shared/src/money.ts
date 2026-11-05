export function formatMoney(cents: number, symbol = '$'): string {
  const sign = cents < 0 ? '−' : ''
  const abs = Math.abs(Math.trunc(cents))
  const major = Math.floor(abs / 100)
  const minor = abs % 100
  const grouped = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${sign}${symbol}${grouped}.${minor.toString().padStart(2, '0')}`
}

export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, '').replace(',', '.')
  if (cleaned.startsWith('-')) return null
  const numeric = cleaned.replace(/[^\d.]/g, '')
  if (!/^\d+(\.\d+)?$/.test(numeric)) return null
  const cents = Math.round(Number(numeric) * 100)
  if (!Number.isSafeInteger(cents)) return null
  return cents
}

export interface ChargeSummaryInput {
  fineCents: number
  jailDays: number
  additionalPenalties?: string | null
}

export function summarizeCharges(charges: ChargeSummaryInput[]): {
  fineCents: number
  jailDays: number
  additionalPenalties: string
} {
  return {
    fineCents: charges.reduce((sum, charge) => sum + Math.max(0, Math.trunc(charge.fineCents)), 0),
    jailDays: charges.reduce((sum, charge) => sum + Math.max(0, Math.trunc(charge.jailDays)), 0),
    additionalPenalties: charges
      .map((charge) => charge.additionalPenalties?.trim())
      .filter((value): value is string => Boolean(value))
      .join('; '),
  }
}

export function resolveFineAmount(input: {
  calculatedCents: number
  adjustmentCents?: number | null
  adjustmentReason?: string | null
  canAdjust: boolean
}): { amountCents: number; adjusted: boolean; reason: string } {
  const calculated = Math.max(0, Math.trunc(input.calculatedCents))
  const hasAdjustment = input.adjustmentCents !== undefined && input.adjustmentCents !== null
  if (!hasAdjustment || input.adjustmentCents === calculated) {
    return { amountCents: calculated, adjusted: false, reason: '' }
  }
  if (!input.canAdjust) {
    throw new FineAmountError('NO_ADJUST', 'Корректировка суммы недоступна для вашей должности.')
  }
  const reason = input.adjustmentReason?.trim() ?? ''
  if (!reason) {
    throw new FineAmountError('REASON_REQUIRED', 'Укажите причину изменения суммы штрафа.')
  }
  const cents = Math.trunc(input.adjustmentCents as number)
  if (cents < 0 || !Number.isSafeInteger(cents)) {
    throw new FineAmountError('NEGATIVE', 'Сумма штрафа не может быть отрицательной.')
  }
  return { amountCents: cents, adjusted: true, reason }
}

export class FineAmountError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

/** Сколько ещё нужно провести в доход при изменении оплаченной суммы. */
export function paymentDelta(previousPaidCents: number, nextPaidCents: number): number {
  return Math.trunc(nextPaidCents) - Math.trunc(previousPaidCents)
}

export function paymentStatusFor(paidCents: number, amountCents: number, cancelled: boolean): 'unpaid' | 'partial' | 'paid' | 'cancelled' {
  if (cancelled) return 'cancelled'
  if (paidCents <= 0) return 'unpaid'
  if (paidCents >= amountCents) return 'paid'
  return 'partial'
}
