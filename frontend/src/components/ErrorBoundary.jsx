import { Component } from 'react';
import GemMark from './GemMark.jsx';

/**
 * Top-level error boundary.
 *
 * A render crash in a single-page app otherwise produces a completely black
 * page with no explanation, which is the worst possible failure mode: the
 * developer cannot tell a CSS stacking problem from a thrown error without
 * opening devtools. This turns any crash into a visible, readable message.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // Keep it in the console too, so devtools still has the stack.
    console.error('VELoop render error:', error, info);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeContent: 'center',
          justifyItems: 'center',
          gap: 16,
          padding: 24,
          textAlign: 'center'
        }}
      >
        <GemMark size={48} tone="purple" />
        <h1 style={{ fontSize: '1.5rem' }}>Something broke while rendering</h1>
        <p className="muted" style={{ maxWidth: '52ch' }}>
          The app hit an unexpected error. The details below will say exactly what.
        </p>

        <pre
          style={{
            maxWidth: '90vw',
            overflow: 'auto',
            padding: 16,
            background: 'var(--danger-dim)',
            border: '1px solid rgba(255,107,122,0.35)',
            borderRadius: 4,
            color: '#ffb3ba',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            textAlign: 'left',
            whiteSpace: 'pre-wrap'
          }}
        >
          {String(error && (error.stack || error.message || error))}
          {info ? `\n\nComponent stack:${info.componentStack || ''}` : ''}
        </pre>

        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            localStorage.removeItem('veloop-auth');
            window.location.href = '/';
          }}
        >
          Clear session and reload
        </button>
      </div>
    );
  }
}
