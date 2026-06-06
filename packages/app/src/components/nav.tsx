import { getNavItems, type NavItem } from '@brain/core'
import { signOut } from '@/lib/auth-actions'

interface Props {
  roleName: string
  currentPath: string
  userEmail: string
}

export function Nav({ roleName, currentPath, userEmail }: Props) {
  const items = getNavItems(roleName)

  return (
    <nav style={styles.nav}>
      <div style={styles.brand}>Brain</div>

      <ul style={styles.list}>
        {items.map((item: NavItem) => {
          const active =
            item.href === '/'
              ? currentPath === '/'
              : currentPath.startsWith(item.href)

          return (
            <li key={item.href}>
              <a
                href={item.href}
                style={{
                  ...styles.link,
                  ...(active ? styles.linkActive : {}),
                }}
              >
                {item.label}
              </a>
            </li>
          )
        })}
      </ul>

      <div style={styles.footer}>
        <div style={styles.userEmail}>{userEmail}</div>
        <form action={signOut}>
          <button type="submit" style={styles.signout}>
            Sign out
          </button>
        </form>
      </div>
    </nav>
  )
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    width: '220px',
    backgroundColor: '#111',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 0',
    flexShrink: 0,
  },
  brand: {
    fontSize: '18px',
    fontWeight: 700,
    padding: '0 20px 24px',
    borderBottom: '1px solid #222',
    marginBottom: '12px',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    flex: 1,
  },
  link: {
    display: 'block',
    padding: '9px 20px',
    color: '#aaa',
    textDecoration: 'none',
    fontSize: '14px',
  },
  linkActive: {
    color: '#fff',
    backgroundColor: '#222',
  },
  footer: {
    padding: '16px 20px 0',
    borderTop: '1px solid #222',
  },
  userEmail: {
    fontSize: '12px',
    color: '#666',
    marginBottom: '8px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  signout: {
    background: 'none',
    border: 'none',
    color: '#aaa',
    fontSize: '13px',
    cursor: 'pointer',
    padding: 0,
  },
}
