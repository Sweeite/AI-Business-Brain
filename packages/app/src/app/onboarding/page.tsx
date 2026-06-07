import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: { connected?: string; error?: string }
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const connected = searchParams.connected
  const error = searchParams.error

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Connect your tools</h1>
        <p style={styles.sub}>
          The brain gets smarter when it can see your work. Connect the tools you
          use most — you can change this any time from My Connections.
        </p>

        {error && (
          <div style={styles.errorBanner}>
            Connection failed ({error.replace(/_/g, ' ')}). Please try again.
          </div>
        )}

        {connected && (
          <div style={styles.successBanner}>
            {connected === 'gmail'
              ? 'Gmail connected successfully. Your emails are being indexed in the background.'
              : connected === 'drive'
                ? 'Google Drive connected successfully. Your files are being indexed in the background.'
                : `${connected} connected successfully.`}
          </div>
        )}

        <div style={styles.connectors}>
          <ConnectorCard
            name="Gmail"
            description="Index emails, extract client decisions, project notes, and action items."
            href="/api/connectors/gmail/connect"
            connected={connected === 'gmail'}
          />
          <ConnectorCard
            name="Google Drive"
            description="Index documents, proposals, and meeting notes stored in Drive."
            href="/api/connectors/drive/connect"
            connected={connected === 'drive'}
          />
        </div>

        <a href="/" style={styles.skip}>
          {connected ? 'Continue →' : 'Skip for now →'}
        </a>
      </div>
    </main>
  )
}

function ConnectorCard({
  name,
  description,
  href,
  disabled,
  connected,
}: {
  name: string
  description: string
  href: string
  disabled?: boolean
  connected?: boolean
}) {
  return (
    <div style={{ ...styles.connector, opacity: disabled ? 0.5 : 1 }}>
      <div>
        <div style={styles.connectorName}>{name}</div>
        <div style={styles.connectorDesc}>{description}</div>
      </div>
      {connected ? (
        <span style={styles.connectedBadge}>✓ Connected</span>
      ) : disabled ? (
        <button disabled style={styles.connectBtn}>Coming soon</button>
      ) : (
        <a href={href} style={styles.connectBtn}>Connect</a>
      )}
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
    textDecoration: 'none',
    display: 'inline-block',
  },
  connectedBadge: {
    flexShrink: 0,
    padding: '6px 12px',
    backgroundColor: '#e6f4ea',
    color: '#1e7e34',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
  },
  successBanner: {
    backgroundColor: '#e6f4ea',
    color: '#1e7e34',
    border: '1px solid #c3e6cb',
    borderRadius: '4px',
    padding: '10px 14px',
    fontSize: '13px',
    marginBottom: '16px',
  },
  errorBanner: {
    backgroundColor: '#fdecea',
    color: '#c0392b',
    border: '1px solid #f5c6cb',
    borderRadius: '4px',
    padding: '10px 14px',
    fontSize: '13px',
    marginBottom: '16px',
  },
  skip: {
    display: 'block',
    textAlign: 'center',
    fontSize: '14px',
    color: '#1a73e8',
    textDecoration: 'none',
  },
}
