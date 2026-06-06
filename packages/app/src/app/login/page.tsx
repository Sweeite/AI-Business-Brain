import { signInWithGoogle, signInWithEmail } from './actions'

interface Props {
  searchParams: Promise<{ error?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams
  const error = params.error

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.heading}>AI Business Brain</h1>
        <p style={styles.sub}>Sign in to continue</p>

        {error === 'oauth_failed' && (
          <p style={styles.error}>Google sign-in failed. Try again or use email/password.</p>
        )}
        {error === 'invalid_credentials' && (
          <p style={styles.error}>Invalid email or password.</p>
        )}

        {/* Primary: Google OAuth */}
        <form action={signInWithGoogle}>
          <button type="submit" style={styles.googleBtn}>
            Sign in with Google
          </button>
        </form>

        <div style={styles.divider}>
          <span>or</span>
        </div>

        {/* Fallback: email/password */}
        <form action={signInWithEmail} style={styles.form}>
          <label style={styles.label}>
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              style={styles.input}
            />
          </label>
          <label style={styles.label}>
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              style={styles.input}
            />
          </label>
          <button type="submit" style={styles.submitBtn}>
            Sign in
          </button>
        </form>
      </div>
    </main>
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
    maxWidth: '400px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  heading: {
    margin: '0 0 4px',
    fontSize: '22px',
    fontWeight: 700,
  },
  sub: {
    margin: '0 0 24px',
    color: '#666',
    fontSize: '14px',
  },
  error: {
    color: '#c00',
    fontSize: '13px',
    marginBottom: '16px',
    padding: '8px 12px',
    backgroundColor: '#fff0f0',
    borderRadius: '4px',
  },
  googleBtn: {
    width: '100%',
    padding: '10px',
    backgroundColor: '#fff',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    color: '#3c4043',
  },
  divider: {
    textAlign: 'center',
    margin: '20px 0',
    color: '#999',
    fontSize: '13px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#333',
  },
  input: {
    padding: '8px 10px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '14px',
  },
  submitBtn: {
    padding: '10px',
    backgroundColor: '#1a73e8',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    marginTop: '4px',
  },
}
