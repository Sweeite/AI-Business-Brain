import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Connect your tools</h1>
        <p style={styles.sub}>
          The brain gets smarter when it can see your work. Connect the tools you
          use most — you can change this any time from My Connections.
        </p>

        <div style={styles.connectors}>
          <ConnectorCard
            name="Gmail"
            description="Index emails, extract client decisions, project notes, and action items."
            href="/connectors/gmail/connect"
            disabled
          />
          <ConnectorCard
            name="Google Drive"
            description="Index documents, proposals, and meeting notes stored in Drive."
            href="/connectors/drive/connect"
            disabled
          />
        </div>

        <p style={styles.note}>
          Connector setup is coming soon. Use Skip for now and connect later from My Connections.
        </p>

        <a href="/" style={styles.skip}>
          Skip for now →
        </a>
      </div>
    </main>
  )
}

function ConnectorCard({
  name,
  description,
  disabled,
}: {
  name: string
  description: string
  href: string
  disabled?: boolean
}) {
  return (
    <div style={{ ...styles.connector, opacity: disabled ? 0.5 : 1 }}>
      <div>
        <div style={styles.connectorName}>{name}</div>
        <div style={styles.connectorDesc}>{description}</div>
      </div>
      <button disabled={disabled} style={styles.connectBtn}>
        {disabled ? 'Coming soon' : 'Connect'}
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    fontFamily: 'system-ui, sans-serif',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '40px',
    width: '100%',
    maxWidth: '480px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  heading: {
    margin: '0 0 8px',
    fontSize: '22px',
    fontWeight: 700,
  },
  sub: {
    margin: '0 0 24px',
    color: '#555',
    fontSize: '14px',
    lineHeight: 1.5,
  },
  connectors: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '20px',
  },
  connector: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px',
    border: '1px solid #e0e0e0',
    borderRadius: '6px',
    gap: '16px',
  },
  connectorName: {
    fontWeight: 600,
    fontSize: '14px',
    marginBottom: '4px',
  },
  connectorDesc: {
    fontSize: '13px',
    color: '#666',
  },
  connectBtn: {
    flexShrink: 0,
    padding: '8px 16px',
    backgroundColor: '#1a73e8',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  note: {
    fontSize: '12px',
    color: '#888',
    marginBottom: '20px',
  },
  skip: {
    display: 'block',
    textAlign: 'center',
    fontSize: '14px',
    color: '#1a73e8',
    textDecoration: 'none',
  },
}
