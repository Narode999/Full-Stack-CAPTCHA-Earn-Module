import { motion, useReducedMotion } from 'framer-motion';

/**
 * Layered, slowly drifting ambient backdrop.
 *
 * Everything animates via `transform` only, so the whole thing stays on the
 * compositor and never triggers layout or paint on the main thread.
 * Colour slowly cycles with the current stage for a subtle emotional cue:
 * violet while verifying, green on success, red on failure.
 */
const MOODS = {
  challenge: { a: '#4c8dff', b: '#7b5cff', c: '#2a1b5e', glow: 'rgba(76,141,255,0.16)' },
  verifying: { a: '#7b5cff', b: '#a78bfa', c: '#3a1f7a', glow: 'rgba(123,92,255,0.28)' },
  result: { a: '#22c55e', b: '#4ade80', c: '#0d5c2b', glow: 'rgba(34,197,94,0.20)' }
};

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.42'/%3E%3C/svg%3E\")";

export default function CinematicBackdrop({ mood = 'challenge' }) {
  const reduce = useReducedMotion();
  const palette = MOODS[mood] || MOODS.challenge;

  return (
    <div className="backdrop" aria-hidden="true">
      {/* Drifting colour orbs */}
      <motion.div
        className="orb orb-a"
        style={{ background: palette.a }}
        animate={reduce ? {} : { x: [0, 90, -40, 0], y: [0, -60, 40, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="orb orb-b"
        style={{ background: palette.b }}
        animate={reduce ? {} : { x: [0, -80, 50, 0], y: [0, 70, -30, 0] }}
        transition={{ duration: 32, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="orb orb-c"
        style={{ background: palette.c }}
        animate={reduce ? {} : { x: [0, 40, -70, 0], y: [0, 40, 60, 0] }}
        transition={{ duration: 38, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Mood glow behind the card */}
      <motion.div
        className="backdrop-glow"
        animate={{ background: palette.glow }}
        transition={{ duration: 0.8, ease: 'easeInOut' }}
      />

      {/* Faint technical grid, drifting very slowly for depth */}
      <motion.div
        className="backdrop-grid"
        animate={reduce ? {} : { y: [0, -60, 0] }}
        transition={{ duration: 48, repeat: Infinity, ease: 'linear' }}
      />

      <div className="backdrop-grain" style={{ backgroundImage: GRAIN }} />
      <div className="backdrop-vignette" />
    </div>
  );
}
