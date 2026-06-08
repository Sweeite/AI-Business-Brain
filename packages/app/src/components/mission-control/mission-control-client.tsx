'use client'

import { useState } from 'react'
import { UsersTab } from './users-tab'
import { RolesTab } from './roles-tab'
import { CronsTab } from './crons-tab'
import { SettingsTab } from './settings-tab'

export interface UserRow {
  id: string
  email: string
  full_name: string | null
  role_id: string | null
  is_active: boolean
  created_at: string
  last_seen_at: string | null
  roles: { id: string; name: string; clearance_level: string } | null
}

export interface RoleRow {
  id: string
  name: string
  clearance_level: string
  permissions: Record<string, boolean>
  created_at: string
}

export interface ConfigRow {
  id: string
  key: string
  value: unknown
  updated_by: string | null
  updated_at: string
}

export interface JobRunRow {
  id: string
  job_type: string
  status: string
  started_at: string
  completed_at: string | null
  error: string | null
}

type Tab = 'users' | 'roles' | 'crons' | 'settings'

interface Props {
  initialUsers: UserRow[]
  initialRoles: RoleRow[]
  initialConfigs: ConfigRow[]
  lastRunByType: Record<string, JobRunRow>
}

export function MissionControlClient({ initialUsers, initialRoles, initialConfigs, lastRunByType }: Props) {
  const [tab, setTab] = useState<Tab>('users')

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Mission Control</h1>

      <div style={styles.tabs}>
        {(['users', 'roles', 'crons', 'settings'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
          >
            {t === 'users' ? 'Users' : t === 'roles' ? 'Roles' : t === 'crons' ? 'Cron Jobs' : 'Settings'}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {tab === 'users' && <UsersTab initialUsers={initialUsers} roles={initialRoles} />}
        {tab === 'roles' && <RolesTab initialRoles={initialRoles} />}
        {tab === 'crons' && <CronsTab initialConfigs={initialConfigs} lastRunByType={lastRunByType} />}
        {tab === 'settings' && <SettingsTab initialConfigs={initialConfigs} />}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '1100px',
  },
  heading: {
    fontSize: '22px',
    fontWeight: 700,
    margin: '0 0 24px',
    color: '#111',
  },
  tabs: {
    display: 'flex',
    gap: '4px',
    borderBottom: '1px solid #e0e0e0',
    marginBottom: '24px',
  },
  tab: {
    padding: '8px 18px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#666',
    borderBottom: '2px solid transparent',
    marginBottom: '-1px',
  },
  tabActive: {
    color: '#111',
    fontWeight: 600,
    borderBottomColor: '#111',
  },
  content: {
    minHeight: '400px',
  },
}
