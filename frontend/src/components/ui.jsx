import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import GemMark from './GemMark.jsx';

/* -------------------------------------------------------------------------
   Button — thin wrapper so every call site keeps identical focus, disabled
   and press behaviour instead of re-implementing them.
   ------------------------------------------------------------------------- */

export function Button({ variant = 'default', size, block, as: As = 'button', className = '', children, ...rest }) {
  const classes = [
    'btn',
    variant !== 'default' ? `btn--${variant}` : '',
    size === 'lg' ? 'btn--lg' : '',
    block ? 'btn--block' : '',
    className
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <As className={classes} {...rest}>
      {children}
    </As>
  );
}

/* -------------------------------------------------------------------------
   Field — label + control, wired for screen readers.
   ------------------------------------------------------------------------- */

export function Field({ id, label, ...rest }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input id={id} name={rest.name || id} className="field__input" {...rest} />
    </div>
  );
}

/* -------------------------------------------------------------------------
   CountUp — the balance animates to its new value rather than snapping.
   Honours prefers-reduced-motion by rendering the final number immediately.
   ------------------------------------------------------------------------- */

export function CountUp({ value, decimals = 2, duration = 620, className = '' }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef(null);

  useEffect(() => {
    const to = Number(value);
    if (!Number.isFinite(to)) return undefined;

    if (reduce) {
      setDisplay(to);
      fromRef.current = to;
      return undefined;
    }

    const from = fromRef.current;
    if (from === to) return undefined;

    const start = performance.now();

    const step = now => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic — fast start, gentle settle.
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (to - from) * eased;
      setDisplay(next);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      fromRef.current = to;
    };
  }, [value, duration, reduce]);

  return <span className={className}>{display.toFixed(decimals)}</span>;
}


/* -------------------------------------------------------------------------
   Metric — a label/value tile.
   ------------------------------------------------------------------------- */

export function Metric({ value, foot, tone = 'default', sub }) {
  return (
    <div className="metric">
      <span className={`metric__value${tone !== 'default' ? ` metric__value--${tone}` : ''}`}>
        {value}
      </span>
      <span className="metric__foot">{foot}</span>
      {sub ? <span className="metric__foot">{sub}</span> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
   SectionHead — uppercase label on the left, action slot on the right.
   ------------------------------------------------------------------------- */

export function SectionHead({ label, title, action }) {
  return (
    <div className="shead">
      <div>
        {label ? <p className="label">{label}</p> : null}
        {title ? <h2 className="shead__title">{title}</h2> : null}
      </div>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------
   PageHead — the editorial page header.
   ------------------------------------------------------------------------- */

export function PageHead({ label, title, sub, aside }) {
  return (
    <header className="phead">
      <div>
        {label ? <p className="label">{label}</p> : null}
        <h1 className="phead__title">{title}</h1>
        {sub ? <p className="phead__sub">{sub}</p> : null}
      </div>
      {aside}
    </header>
  );
}

/* -------------------------------------------------------------------------
   EmptyState — uses the gem so the brand motif carries the empty case too.
   ------------------------------------------------------------------------- */

export function EmptyState({ title, copy, children }) {
  return (
    <div className="state">
      <GemMark size={44} tone="purple" />
      <p className="state__title">{title}</p>
      {copy ? <p style={{ maxWidth: '44ch' }}>{copy}</p> : null}
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Loading — a quiet placeholder rather than a spinner in a white circle.
   ------------------------------------------------------------------------- */

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p className="label">{label}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Stagger — one place for the shared entrance transition so pages do not
   each invent their own timing.
   ------------------------------------------------------------------------- */

export function Stagger({ children, index = 0, className = '', ...rest }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
