import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, AlertCircle } from 'lucide-react';
import GemMark from '../components/GemMark.jsx';
import { Button, Field, Stagger } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const HEADLINE = ['Your work.', 'Your rewards.', 'Your progress.'];

const REASSURANCE = [
  'Rewards are decided and paid by the server',
  'Challenges are signed and single-use',
  'Correct answers never reach the browser'
];

function BrandStage() {
  return (
    <section className="auth__stage">
      <Stagger>
        <div className="brand">
          <GemMark size={34} tone="gold" />
          <span className="brand__text">
            <span className="brand__name">VELOOP</span>
            <span className="brand__sub">REWARDS</span>
          </span>
        </div>
      </Stagger>

      <Stagger index={1}>
        <div>
          <h1 className="auth__headline">
            {HEADLINE.map((line, i) => (
              <span key={line} className={i === 2 ? 'em' : undefined}>
                {line}
              </span>
            ))}
          </h1>
          <p className="auth__lede">Earn gems by completing meaningful work.</p>
        </div>
      </Stagger>

      <Stagger index={2}>
        <div className="auth__readout">
          <GemMark size={54} tone="gold" pulse />
          <div>
            <p className="label label--gold">Reward status</p>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>
              Terminal online
            </p>
            <p className="muted" style={{ fontSize: '0.8125rem' }}>
              Server adjudicates every challenge
            </p>
          </div>
        </div>
      </Stagger>
    </section>
  );
}

/**
 * Login / register.
 *
 * A split composition rather than a centred card: the brand stage carries the
 * editorial weight on desktop, and collapses above the form on mobile so
 * everything still fits in one viewport at 320px.
 */
export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleChange = event => {
    const { name, value } = event.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') {
        await login({ email: form.email, password: form.password });
      } else {
        await register(form);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <BrandStage />

      <section className="auth__panel">
        <div className="auth__mobile">
          <div className="brand">
            <GemMark size={30} tone="gold" />
            <span className="brand__text">
              <span className="brand__name">VELOOP</span>
              <span className="brand__sub">REWARDS</span>
            </span>
          </div>
          <GemMark size={72} tone="gold" pulse />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="label">Secure access</p>
          <h2 className="phead__title" style={{ marginTop: 8 }}>
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
        </motion.div>

        <div className="auth__switch" role="group" aria-label="Account mode">
          <button
            type="button"
            aria-pressed={mode === 'login'}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Login
          </button>
          <button
            type="button"
            aria-pressed={mode === 'register'}
            onClick={() => { setMode('register'); setError(''); }}
          >
            Register
          </button>
        </div>

        <form className="auth__form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <Field
              id="name" label="Name" name="name" autoComplete="name"
              placeholder="Jane Doe" value={form.name} onChange={handleChange} required
            />
          )}

          <Field
            id="email" label="Email" name="email" type="email" autoComplete="email"
            placeholder="you@example.com" value={form.email} onChange={handleChange} required
          />

          <Field
            id="password" label="Password" name="password" type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="........" value={form.password} onChange={handleChange}
            required minLength={6}
          />

          {error && (
            <p className="notice notice--error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{error}</span>
            </p>
          )}

          <Button type="submit" variant="primary" size="lg" block disabled={busy}>
            {busy ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create account'}
          </Button>
        </form>

        <ul className="stack" style={{ gap: 10, maxWidth: 420 }}>
          {REASSURANCE.map(line => (
            <li
              key={line}
              className="row"
              style={{ gap: 10, fontSize: '0.8125rem', color: 'var(--text-muted)' }}
            >
              <ShieldCheck size={14} style={{ color: 'var(--success)', flex: 'none' }} />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}