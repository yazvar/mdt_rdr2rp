export const PERMISSIONS = {
  personnelView: 'personnel.view',
  personnelManage: 'personnel.manage',
  armoryViewOwn: 'armory.view_own',
  armoryViewAll: 'armory.view_all',
  armoryManage: 'armory.manage',
  lossViewOwn: 'loss.view_own',
  lossViewAll: 'loss.view_all',
  lossManage: 'loss.manage',
  seizureView: 'seizure.view',
  seizureManage: 'seizure.manage',
  casesView: 'cases.view',
  casesManage: 'cases.manage',
  lawsView: 'laws.view',
  lawsEdit: 'laws.edit',
  lawsManage: 'laws.manage',
  citizensView: 'citizens.view',
  citizensManage: 'citizens.manage',
  wantedView: 'wanted.view',
  wantedCreate: 'wanted.create',
  wantedManage: 'wanted.manage',
  finesView: 'fines.view',
  finesIssue: 'fines.issue',
  finesAdjust: 'fines.adjust',
  finesManage: 'fines.manage',
  requestsCreate: 'requests.create',
  requestsReview: 'requests.review',
  requestsManage: 'requests.manage',
  accountingView: 'accounting.view',
  accountingManage: 'accounting.manage',
  auditView: 'audit.view',
  usersManage: 'users.manage',
  adminAccess: 'admin.access',
} as const

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS)

export const PERMISSION_CATALOG: { key: PermissionKey; module: string; description: string }[] = [
  { key: PERMISSIONS.personnelView, module: 'personnel', description: 'Просмотр реестра сотрудников' },
  { key: PERMISSIONS.personnelManage, module: 'personnel', description: 'Управление реестром сотрудников' },
  { key: PERMISSIONS.armoryViewOwn, module: 'armory', description: 'Просмотр собственного снаряжения' },
  { key: PERMISSIONS.armoryViewAll, module: 'armory', description: 'Просмотр всего склада' },
  { key: PERMISSIONS.armoryManage, module: 'armory', description: 'Выдача, возврат и учёт склада' },
  { key: PERMISSIONS.lossViewOwn, module: 'loss', description: 'Просмотр своих записей об утере' },
  { key: PERMISSIONS.lossViewAll, module: 'loss', description: 'Просмотр всех записей утери и склада' },
  { key: PERMISSIONS.lossManage, module: 'loss', description: 'Управление утерей и складом' },
  { key: PERMISSIONS.seizureView, module: 'seizure', description: 'Просмотр конфиската' },
  { key: PERMISSIONS.seizureManage, module: 'seizure', description: 'Создание и изменение конфиската' },
  { key: PERMISSIONS.casesView, module: 'cases', description: 'Просмотр дел' },
  { key: PERMISSIONS.casesManage, module: 'cases', description: 'Ведение дел' },
  { key: PERMISSIONS.lawsView, module: 'laws', description: 'Просмотр законов' },
  { key: PERMISSIONS.lawsEdit, module: 'laws', description: 'Редактирование статей закона' },
  { key: PERMISSIONS.lawsManage, module: 'laws', description: 'Управление законами, импорт и отмена' },
  { key: PERMISSIONS.citizensView, module: 'citizens', description: 'Просмотр картотеки граждан' },
  { key: PERMISSIONS.citizensManage, module: 'citizens', description: 'Ведение картотеки граждан' },
  { key: PERMISSIONS.wantedView, module: 'wanted', description: 'Просмотр розыска' },
  { key: PERMISSIONS.wantedCreate, module: 'wanted', description: 'Создание и обновление розыска' },
  { key: PERMISSIONS.wantedManage, module: 'wanted', description: 'Полное управление розыском' },
  { key: PERMISSIONS.finesView, module: 'fines', description: 'Просмотр штрафов' },
  { key: PERMISSIONS.finesIssue, module: 'fines', description: 'Оформление штрафов' },
  { key: PERMISSIONS.finesAdjust, module: 'fines', description: 'Корректировка суммы штрафа' },
  { key: PERMISSIONS.finesManage, module: 'fines', description: 'Полное управление штрафами и оплатой' },
  { key: PERMISSIONS.requestsCreate, module: 'requests', description: 'Регистрация вооружения' },
  { key: PERMISSIONS.requestsReview, module: 'requests', description: 'Просмотр всего реестра вооружения' },
  { key: PERMISSIONS.requestsManage, module: 'requests', description: 'Полное управление реестром вооружения' },
  { key: PERMISSIONS.accountingView, module: 'accounting', description: 'Просмотр бухгалтерии' },
  { key: PERMISSIONS.accountingManage, module: 'accounting', description: 'Проведение финансовых операций' },
  { key: PERMISSIONS.auditView, module: 'audit', description: 'Просмотр полного журнала действий' },
  { key: PERMISSIONS.usersManage, module: 'admin', description: 'Управление доступом и ролями' },
  { key: PERMISSIONS.adminAccess, module: 'admin', description: 'Административная панель' },
]

/** Более широкое право включает перечисленные. */
export const IMPLIES: Partial<Record<PermissionKey, PermissionKey[]>> = {
  [PERMISSIONS.personnelManage]: [PERMISSIONS.personnelView],
  [PERMISSIONS.armoryManage]: [PERMISSIONS.armoryViewAll, PERMISSIONS.armoryViewOwn],
  [PERMISSIONS.armoryViewAll]: [PERMISSIONS.armoryViewOwn],
  [PERMISSIONS.lossManage]: [PERMISSIONS.lossViewAll, PERMISSIONS.lossViewOwn],
  [PERMISSIONS.lossViewAll]: [PERMISSIONS.lossViewOwn],
  [PERMISSIONS.seizureManage]: [PERMISSIONS.seizureView],
  [PERMISSIONS.casesManage]: [PERMISSIONS.casesView],
  [PERMISSIONS.lawsManage]: [PERMISSIONS.lawsEdit, PERMISSIONS.lawsView],
  [PERMISSIONS.lawsEdit]: [PERMISSIONS.lawsView],
  [PERMISSIONS.citizensManage]: [PERMISSIONS.citizensView],
  [PERMISSIONS.wantedManage]: [PERMISSIONS.wantedCreate, PERMISSIONS.wantedView],
  [PERMISSIONS.wantedCreate]: [PERMISSIONS.wantedView],
  [PERMISSIONS.finesManage]: [PERMISSIONS.finesAdjust, PERMISSIONS.finesIssue, PERMISSIONS.finesView],
  [PERMISSIONS.finesAdjust]: [PERMISSIONS.finesView],
  [PERMISSIONS.finesIssue]: [PERMISSIONS.finesView],
  [PERMISSIONS.requestsManage]: [PERMISSIONS.requestsReview, PERMISSIONS.requestsCreate],
  [PERMISSIONS.requestsReview]: [PERMISSIONS.requestsCreate],
  [PERMISSIONS.accountingManage]: [PERMISSIONS.accountingView],
  [PERMISSIONS.adminAccess]: [...ALL_PERMISSION_KEYS],
}

export const ROLE_KEYS = {
  administrator: 'administrator',
  sheriff: 'sheriff',
  undersheriff: 'undersheriff',
  deputySheriff: 'deputy_sheriff',
  deputy: 'deputy',
  viewer: 'viewer',
} as const

export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS]

const viewBase: PermissionKey[] = [
  PERMISSIONS.personnelView,
  PERMISSIONS.armoryViewOwn,
  PERMISSIONS.lossViewOwn,
  PERMISSIONS.seizureView,
  PERMISSIONS.casesView,
  PERMISSIONS.lawsView,
  PERMISSIONS.citizensView,
  PERMISSIONS.wantedView,
  PERMISSIONS.finesView,
]

const sheriffPermissions: PermissionKey[] = [
  PERMISSIONS.personnelManage,
  PERMISSIONS.armoryManage,
  PERMISSIONS.lossManage,
  PERMISSIONS.seizureManage,
  PERMISSIONS.casesManage,
  PERMISSIONS.lawsManage,
  PERMISSIONS.citizensManage,
  PERMISSIONS.wantedManage,
  PERMISSIONS.finesManage,
  PERMISSIONS.requestsManage,
  PERMISSIONS.accountingManage,
  PERMISSIONS.auditView,
]

export const ROLE_PRESETS: {
  key: RoleKey
  name: string
  description: string
  permissions: PermissionKey[]
}[] = [
  {
    key: ROLE_KEYS.viewer,
    name: 'Наблюдатель',
    description: 'Только просмотр разрешённых записей.',
    permissions: [...viewBase],
  },
  {
    key: ROLE_KEYS.deputy,
    name: 'Заместитель',
    description: 'Обычный сотрудник департамента.',
    permissions: [...viewBase, PERMISSIONS.finesIssue, PERMISSIONS.citizensManage, PERMISSIONS.casesManage, PERMISSIONS.requestsCreate],
  },
  {
    key: ROLE_KEYS.deputySheriff,
    name: 'Помощник шерифа',
    description: 'Расширенное управление департаментом.',
    permissions: [
      PERMISSIONS.personnelManage,
      PERMISSIONS.armoryManage,
      PERMISSIONS.lossManage,
      PERMISSIONS.seizureManage,
      PERMISSIONS.casesManage,
      PERMISSIONS.lawsEdit,
      PERMISSIONS.citizensManage,
      PERMISSIONS.wantedCreate,
      PERMISSIONS.finesManage,
      PERMISSIONS.requestsReview,
      PERMISSIONS.accountingView,
    ],
  },
  {
    key: ROLE_KEYS.undersheriff,
    name: 'Старший помощник шерифа',
    description: 'Почти полные права управления департаментом.',
    permissions: [...sheriffPermissions],
  },
  {
    key: ROLE_KEYS.sheriff,
    name: 'Шериф',
    description: 'Полное управление департаментом без технической админ-панели.',
    permissions: [...sheriffPermissions],
  },
  {
    key: ROLE_KEYS.administrator,
    name: 'Администратор',
    description: 'Полный технический доступ к системе.',
    permissions: [...ALL_PERMISSION_KEYS],
  },
]

export function expandPermissions(granted: Iterable<string>): Set<string> {
  const out = new Set(granted)
  if (out.has(PERMISSIONS.adminAccess)) {
    for (const key of ALL_PERMISSION_KEYS) out.add(key)
    return out
  }
  let changed = true
  while (changed) {
    changed = false
    for (const key of [...out]) {
      const implied = IMPLIES[key as PermissionKey]
      if (!implied) continue
      for (const item of implied) {
        if (!out.has(item)) {
          out.add(item)
          changed = true
        }
      }
    }
  }
  return out
}

export function hasPermission(granted: Iterable<string>, needed: string): boolean {
  return expandPermissions(granted).has(needed)
}

export function presetPermissions(roleKey: string): string[] {
  return ROLE_PRESETS.find((role) => role.key === roleKey)?.permissions ?? []
}

/** Роли, которые может назначать сотрудник без технического админ-доступа. */
export const DEPARTMENT_ROLE_KEYS: RoleKey[] = [
  ROLE_KEYS.sheriff,
  ROLE_KEYS.undersheriff,
  ROLE_KEYS.deputySheriff,
  ROLE_KEYS.deputy,
  ROLE_KEYS.viewer,
]
