
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  IconSun,
  IconMoon,
  IconEye,
  IconEyeOff,
} from '../components/Icons';
import Logo from '../assets/Logo';
import './pageCss/Login.css';

const WORKFLOW = [
  {
    number: '01',
    title: 'Requirements',
    description: 'Open positions and client needs',
    role: 'SALES',
  },
  {
    number: '02',
    title: 'Talent pipeline',
    description: 'Sourcing and evaluation',
    role: 'TALENT',
  },
  {
    number: '03',
    title: 'Offers',
    description: 'Release and confirmation',
    role: 'HR',
  },
  {
    number: '04',
    title: 'Onboarding',
    description: 'Documentation and joining',
    role: 'OPERATIONS',
  },
];

export default function Login() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError('Invalid credentials. Please check your email and password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className={`authx-page authx-${theme}`}>
      <div className="authx-layout">

        {/* LEFT: PRODUCT INTRODUCTION */}
        <section className="authx-showcase">
          <header className="authx-showcase-header">
            <div className="authx-logo">
              <Logo size={36} />
            </div>

            <span className="authx-platform-label">
              RECRUITMENT OPERATIONS
            </span>
          </header>

          <div className="authx-showcase-content">
            <div className="authx-overline">
              <span />
              YOUR HIRING WORKSPACE
            </div>

            <h1>
              One workspace.
              <br />
              <span>Every stage.</span>
            </h1>

            <p className="authx-showcase-description">
              Manage your complete hiring journey through one connected
              workspace — from initial requirements to successful onboarding.
            </p>

            <div className="authx-workflow">
              <div className="authx-workflow-heading">
                <span>HOW IT WORKS</span>
                <span>01 — 04</span>
              </div>

              <div className="authx-workflow-grid">
                {WORKFLOW.map((step) => (
                  <div className="authx-workflow-card" key={step.number}>
                    <div className="authx-workflow-card-top">
                      <span className="authx-workflow-number">
                        {step.number}
                      </span>
                      <span className="authx-workflow-role">
                        {step.role}
                      </span>
                    </div>

                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <footer className="authx-showcase-footer">
            <span className="authx-footer-dot" />
            A CONNECTED WORKSPACE FOR YOUR HIRING TEAMS
          </footer>
        </section>

        {/* RIGHT: LOGIN */}
        <section className="authx-auth-area">
          <header className="authx-topbar">
            <span className="authx-topbar-label">
              ACCOUNT ACCESS
            </span>

            <button
              type="button"
              className="authx-theme-toggle"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? <IconSun /> : <IconMoon />}
              <span>{theme === 'dark' ? 'Light' : 'Dark'} mode</span>
            </button>
          </header>

          <div className="authx-auth-content">
            <div className="authx-mobile-brand">
              <Logo size={36} />
            </div>

            <div className="authx-form-heading">
              <span className="authx-form-eyebrow">
                WELCOME BACK
              </span>

              <h2>Sign in to your workspace</h2>

              <p>
                Enter your credentials to access your recruitment dashboard.
              </p>
            </div>

            <form className="authx-form" onSubmit={handleSubmit}>
              <label className="authx-field">
                <span className="authx-label">Work email</span>

                <input
                  type="email"
                  className="authx-input"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="username"
                />
              </label>

              <label className="authx-field">
                <span className="authx-label">Password</span>

                <div className="authx-password-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="authx-input"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />

                  <button
                    type="button"
                    className="authx-password-toggle"
                    onClick={() => setShowPassword((value) => !value)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>
              </label>

              {error && (
                <div className="authx-error" role="alert" aria-live="assertive">
                  <span className="authx-error-indicator">!</span>
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                className="authx-submit"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span className="authx-submit-spinner" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign in</span>
                    <span className="authx-submit-arrow">→</span>
                  </>
                )}
              </button>
            </form>

            <div className="authx-access-note">
              <span className="authx-access-icon">
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M5 8.5V6.2a5 5 0 0 1 10 0v2.3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <rect
                    x="3.5"
                    y="8"
                    width="13"
                    height="9"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <circle cx="10" cy="12.5" r="1" fill="currentColor" />
                </svg>
              </span>

              <p>
                Your access and workspace permissions are based on your
                assigned role.
              </p>
            </div>
          </div>

          <footer className="authx-auth-footer">
            <span>© {new Date().getFullYear()} Recruitment Workspace</span>
            <span>Secure workspace access</span>
          </footer>
        </section>
      </div>
    </main>
  );
}
