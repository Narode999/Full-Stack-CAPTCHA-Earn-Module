import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import GemMark from './GemMark.jsx';

/**
 * Ambient cinematic backdrop.
 *
 * A handful of faceted gems drifting at different depths, plus one very soft
 * light source. Deliberately quiet: elements sit between 4% and 14% opacity,
 * drift cycles take 38-54 seconds, and nothing reacts to the pointer by more
 * than a few pixels. The intent is depth, not spectacle.
 *
 * Pointer parallax is throttled through requestAnimationFrame and the listener
 * is passive, so scrolling stays smooth on low-end devices.
 *
 * With prefers-reduced-motion the layer is simply not rendered.
 */

// depth drives both the size and how far a gem reacts to the pointer.
const FIELD = [
  { x: 8, y: 14, size: 190, depth: 0.10, dur: 46, delay: 0 },
  { x: 72, y: 8, size: 130, depth: 0.16, dur: 44, delay: -8 },
  { x: 86, y: 62, size: 240, depth: 0.07, dur: 54, delay: -16 },
  { x: 18, y: 74, size: 100, depth: 0.20, dur: 42, delay: -24 },
  { x: 52, y: 42, size: 78, depth: 0.26, dur: 38, delay: -12 },
  { x: 38, y: 88, size: 150, depth: 0.09, dur: 50, delay: -30 }
];

export default function CinematicBackdrop() {
  const reduce = useReducedMotion();
  const layerRef = useRef(null);
  const frame = useRef(null);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (reduce) return undefined;
    const layer = layerRef.current;
    if (!layer) return undefined;

    const onMove = event => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      target.current = {
        x: (event.clientX / w - 0.5) * 2,
        y: (event.clientY / h - 0.5) * 2
      };
    };

    const tick = () => {
      // Ease toward the pointer rather than following it exactly.
      current.current.x += (target.current.x - current.current.x) * 0.045;
      current.current.y += (target.current.y - current.current.y) * 0.045;

      FIELD.forEach((item, i) => {
        const node = layer.children[i];
        if (!node) return;
        const dx = (current.current.x * item.depth * 34).toFixed(2);
        const dy = (current.current.y * item.depth * 34).toFixed(2);
        node.style.setProperty('--px', dx + 'px');
        node.style.setProperty('--py', dy + 'px');
      });

      frame.current = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    frame.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('pointermove', onMove);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [reduce]);

  if (reduce) return null;

  return (
    <div className="cine" ref={layerRef} aria-hidden="true">
      <span className="cine__wash" />
      {FIELD.map((item, i) => (
        <span
          key={i}
          className="cine__gem"
          style={{
            left: item.x + '%',
            top: item.y + '%',
            opacity: item.depth * 0.62,
            animationDuration: item.dur + 's',
            animationDelay: item.delay + 's'
          }}
        >
          <GemMark size={item.size} tone="gold" />
        </span>
      ))}
      <span className="cine__vignette" />
    </div>
  );
}
