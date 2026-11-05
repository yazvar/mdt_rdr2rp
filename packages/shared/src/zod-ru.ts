import { ZodIssueCode, z, type ZodErrorMap } from 'zod'

const fields: Record<string, string> = {
  firstName: 'имя',
  lastName: 'фамилия',
  badgeNumber: 'табельный номер',
  rankId: 'звание',
  position: 'должность',
  discordId: 'Discord ID',
  joinedAt: 'дата вступления',
  contact: 'контакт',
  notes: 'примечания',
  serviceComments: 'служебные комментарии',
  reason: 'причина',
  roleKeys: 'должности',
  name: 'название',
  category: 'категория',
  serialNumber: 'серийный номер',
  quantity: 'количество',
  unitCostCents: 'цена',
  itemId: 'предмет',
  employeeId: 'сотрудник',
  itemName: 'предмет',
  discoveredAt: 'дата',
  description: 'описание',
  inventoryItemId: 'карточка склада',
  equipmentIssueId: 'выдача',
  version: 'версия',
  action: 'действие',
  amountCents: 'сумма',
  adjustmentCents: 'сумма',
  adjustmentReason: 'причина изменения суммы',
  direction: 'тип операции',
  categoryId: 'категория',
  occurredAt: 'дата',
  grounds: 'основание',
  citizenId: 'гражданин',
  alias: 'прозвище',
  occupation: 'занятие',
  residence: 'где живёт',
  marks: 'приметы',
  photoData: 'фотография',
  photoUrl: 'ссылка на фото',
  fineNumber: 'номер штрафа',
  narrative: 'описание дела',
  caseId: 'дело',
  seizureId: 'конфискат',
  seizedAt: 'дата изъятия',
  suspectFirstName: 'имя',
  suspectLastName: 'фамилия',
  location: 'место',
  articleNumber: 'номер статьи',
  title: 'название',
  fineCents: 'штраф',
  fineMinCents: 'штраф',
  jailDays: 'срок',
  jailMin: 'срок',
  grade: 'категория',
  charges: 'статьи',
  lawIds: 'статьи',
  wantedId: 'розыск',
  comment: 'комментарий',
  decision: 'решение',
  offenderFirstName: 'имя нарушителя',
  offenderLastName: 'фамилия нарушителя',
  currencySymbol: 'знак валюты',
  currencyCode: 'код валюты',
  permissions: 'права',
  status: 'статус',
  closeReason: 'причина закрытия',
  documentRef: 'документ',
  key: 'ключ роли',
  username: 'имя',
  departmentName: 'название департамента',
  countyName: 'округ',
  motto: 'девиз',
  discordGuildId: 'сервер Discord',
  extraRecipientDiscordIds: 'дополнительные получатели',
  confirmation: 'фраза подтверждения',
  items: 'предметы',
  laws: 'статьи',
  csv: 'файл',
  wantedLevel: 'уровень розыска',
  responsibleEmployeeId: 'ответственный',
}

function fieldOf(path: PropertyKey[]): string {
  const key = [...path].reverse().find((part) => typeof part === 'string')
  if (typeof key !== 'string') return 'форма'
  return fields[key] ?? 'поле'
}

const russian: ZodErrorMap = (issue, _ctx) => {
  const field = fieldOf(issue.path)
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === 'undefined' || issue.received === 'null') return { message: `Заполните поле «${field}».` }
      if (issue.expected === 'number' || issue.expected === 'integer') return { message: `В поле «${field}» нужно число.` }
      return { message: `Поле «${field}» заполнено неверно.` }
    case ZodIssueCode.unrecognized_keys:
      return { message: 'Форма устарела. Обновите страницу и заполните её ещё раз.' }
    case ZodIssueCode.invalid_enum_value:
      return { message: `В поле «${field}» выбрано недопустимое значение.` }
    case ZodIssueCode.invalid_string:
      if (issue.validation === 'datetime') return { message: `Укажите дату в поле «${field}».` }
      if (issue.validation === 'url') return { message: `Ссылка в поле «${field}» указана неверно.` }
      return { message: `Поле «${field}» заполнено неверно.` }
    case ZodIssueCode.too_small:
      if (issue.type === 'string') {
        const minimum = Number(issue.minimum)
        if (minimum <= 1) return { message: `Заполните поле «${field}».` }
        return { message: `Поле «${field}» должно содержать не меньше ${minimum} символов.` }
      }
      if (issue.type === 'array') return { message: `Добавьте хотя бы одну запись в поле «${field}».` }
      if (issue.type === 'number') {
        const minimum = Number(issue.minimum)
        if (minimum <= 0) return { message: `Поле «${field}» не может быть отрицательным.` }
        return { message: `Поле «${field}» должно быть не меньше ${minimum}.` }
      }
      return { message: `Поле «${field}» заполнено неверно.` }
    case ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `Поле «${field}» слишком длинное.` }
      if (issue.type === 'number') return { message: `Поле «${field}» слишком большое.` }
      return { message: `В поле «${field}» слишком много значений.` }
    default:
      return { message: `Проверьте поле «${field}».` }
  }
}

z.setErrorMap(russian)
