export interface NavItem {
  label: string
  href: string
}

// PRD §12.12 — Navigation and Default Views by Role.
// Each role sees exactly these items. Higher roles include lower-role items.
const MEMBER_NAV: NavItem[] = [
  { label: 'Query', href: '/' },
]

const MANAGER_NAV: NavItem[] = [
  ...MEMBER_NAV,
  { label: 'Memory Inspector', href: '/memory' },
  { label: 'Agent Activity', href: '/activity' },
]

const OPERATOR_NAV: NavItem[] = [
  ...MANAGER_NAV,
  { label: 'Ingestion & Queue', href: '/ingestion' },
  { label: 'Proactive Builder', href: '/proactive' },
  { label: 'Connector Management', href: '/connectors' },
]

const OWNER_NAV: NavItem[] = [
  ...OPERATOR_NAV,
  { label: 'Self-Improvement', href: '/improvement' },
  { label: 'Cost Monitor', href: '/cost' },
  { label: 'Quality Monitor', href: '/quality' },
  { label: 'System Health', href: '/health' },
  { label: 'Audit Log', href: '/audit' },
  { label: 'Mission Control', href: '/mission-control' },
]

export const ROLE_NAV_ITEMS: Record<string, NavItem[]> = {
  Member: MEMBER_NAV,
  Manager: MANAGER_NAV,
  Operator: OPERATOR_NAV,
  Owner: OWNER_NAV,
  Admin: OWNER_NAV,
}

export function getNavItems(roleName: string): NavItem[] {
  return ROLE_NAV_ITEMS[roleName] ?? MEMBER_NAV
}

export function hasRouteAccess(roleName: string, pathname: string): boolean {
  const items = getNavItems(roleName)
  if (pathname === '/') return true
  return items.some((item) => pathname.startsWith(item.href) && item.href !== '/')
}
