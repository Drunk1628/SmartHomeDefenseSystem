import { useState, type FormEvent } from 'react';
import { ShieldCheck, Eye, EyeOff, LoaderCircle } from 'lucide-react';

type AuthScreenProps = {
  onAuthenticated: () => void;
};

type AuthMode = 'login' | 'register';

export default function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (mode === 'register' && password !== confirmPassword) {
      setError('Your passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const endpoint =
        mode === 'login' ? '/api/auth/login' : '/api/auth/register';

      const body =
        mode === 'login'
          ? { email: email.trim(), password }
          : {
              email: email.trim(),
              password,
              displayName: displayName.trim(),
            };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error ?? 'Something went wrong.');
      }

      if (mode === 'register') {
        setMessage('Account created! You can now log in.');
        setMode('login');
        setPassword('');
        setConfirmPassword('');
      } else {
        onAuthenticated();
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to connect to the server.',
      );
    } finally {
      setLoading(false);
    }
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError('');
    setMessage('');
    setPassword('');
    setConfirmPassword('');
  }

  return (
    <main style={styles.page}>
      <div style={styles.backgroundGlow} />

      <section style={styles.card}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>
            <ShieldCheck size={25} />
          </div>
          <div>
            <div style={styles.brandName}>Hearthguard</div>
            <div style={styles.brandCaption}>HOME SECURITY</div>
          </div>
        </div>

        <div style={styles.eyebrow}>
          <span style={styles.dot} />
          YOUR HOME, BETTER PROTECTED
        </div>

        <h1 style={styles.heading}>
          {mode === 'login' ? (
            <>Welcome <em>back.</em></>
          ) : (
            <>Create your <em>account.</em></>
          )}
        </h1>

        <p style={styles.description}>
          {mode === 'login'
            ? 'Sign in to access your home security dashboard.'
            : 'Set up your account to start managing your connected home.'}
        </p>

        {error && (
          <div role="alert" style={styles.error}>
            {error}
          </div>
        )}

        {message && (
          <div role="status" style={styles.success}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          {mode === 'register' && (
            <label style={styles.label}>
              Display name
              <input
                style={styles.input}
                type="text"
                autoComplete="name"
                placeholder="Your name"
                value={displayName}
                onChange={event => setDisplayName(event.target.value)}
                minLength={2}
                maxLength={100}
                required
              />
            </label>
          )}

          <label style={styles.label}>
            Email address
            <input
              style={styles.input}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={event => setEmail(event.target.value)}
              required
            />
          </label>

          <label style={styles.label}>
            Password
            <div style={styles.passwordWrapper}>
              <input
                style={{ ...styles.input, paddingRight: 45 }}
                type={showPassword ? 'text' : 'password'}
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
                placeholder={
                  mode === 'register'
                    ? 'At least 12 characters'
                    : 'Enter your password'
                }
                value={password}
                onChange={event => setPassword(event.target.value)}
                minLength={mode === 'register' ? 12 : undefined}
                required
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(value => !value)}
                style={styles.eyeButton}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          {mode === 'register' && (
            <label style={styles.label}>
              Confirm password
              <input
                style={styles.input}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Enter your password again"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                required
              />
            </label>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.submitButton,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? (
              <>
                <LoaderCircle size={17} />
                Please wait...
              </>
            ) : mode === 'login' ? (
              'Sign in'
            ) : (
              'Create account'
            )}
          </button>
        </form>

        <div style={styles.switchText}>
          {mode === 'login'
            ? "Don't have an account?"
            : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() =>
              switchMode(mode === 'login' ? 'register' : 'login')
            }
            style={styles.switchButton}
          >
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </div>

        <div style={styles.footer}>
          <ShieldCheck size={14} />
          <span>Secure account access · Hearthguard demo</span>
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '32px 18px',
    boxSizing: 'border-box',
    background: '#f5f7f6',
    color: '#20342e',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    position: 'relative',
    overflow: 'hidden',
  },
  backgroundGlow: {
    position: 'absolute',
    width: 460,
    height: 460,
    borderRadius: '50%',
    background: 'rgba(101, 159, 129, 0.12)',
    filter: 'blur(80px)',
    top: '-180px',
    right: '-130px',
    pointerEvents: 'none',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    boxSizing: 'border-box',
    background: '#ffffff',
    border: '1px solid #e4eae6',
    borderRadius: 22,
    padding: '36px 32px 24px',
    boxShadow: '0 22px 70px rgba(35, 65, 50, 0.08)',
    position: 'relative',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 42,
  },
  logoIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    background: '#214d3d',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontSize: 19,
    fontWeight: 750,
    letterSpacing: '-0.6px',
  },
  brandCaption: {
    fontSize: 9,
    letterSpacing: '2px',
    marginTop: 4,
    color: '#84938b',
    fontWeight: 700,
  },
  eyebrow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#658675',
    fontSize: 10,
    fontWeight: 750,
    letterSpacing: '1.4px',
    marginBottom: 13,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#64a17e',
  },
  heading: {
    fontSize: 34,
    lineHeight: 1.2,
    letterSpacing: '-1.4px',
    margin: '0 0 12px',
    fontWeight: 750,
  },
  description: {
    fontSize: 13,
    lineHeight: 1.7,
    color: '#7b8982',
    margin: '0 0 26px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 19,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    fontSize: 12,
    fontWeight: 650,
    color: '#344a40',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '13px 14px',
    border: '1px solid #dce5df',
    borderRadius: 10,
    background: '#fbfcfb',
    color: '#20342e',
    fontSize: 13,
    outlineColor: '#548b6c',
  },
  passwordWrapper: {
    position: 'relative',
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: 'translateY(-50%)',
    border: 'none',
    background: 'transparent',
    color: '#84938b',
    cursor: 'pointer',
    display: 'flex',
    padding: 4,
  },
  submitButton: {
    marginTop: 5,
    width: '100%',
    minHeight: 46,
    border: 'none',
    borderRadius: 10,
    background: '#214d3d',
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  switchText: {
    marginTop: 24,
    textAlign: 'center',
    color: '#7b8982',
    fontSize: 12,
  },
  switchButton: {
    border: 'none',
    background: 'transparent',
    color: '#27694b',
    fontSize: 12,
    fontWeight: 750,
    cursor: 'pointer',
    padding: 0,
  },
  error: {
    background: '#fff0ef',
    border: '1px solid #f4d2cf',
    color: '#a33d35',
    borderRadius: 9,
    padding: '11px 12px',
    fontSize: 12,
    lineHeight: 1.5,
    marginBottom: 18,
  },
  success: {
    background: '#edf8f0',
    border: '1px solid #d2e9d8',
    color: '#286644',
    borderRadius: 9,
    padding: '11px 12px',
    fontSize: 12,
    lineHeight: 1.5,
    marginBottom: 18,
  },
  footer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
    borderTop: '1px solid #edf0ee',
    marginTop: 30,
    paddingTop: 19,
    color: '#94a099',
    fontSize: 10,
  },
};
