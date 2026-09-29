/**
 * The VELoop gem.
 *
 * A drawn, faceted brilliant cut rather than an icon-font gem. Every part
 * that needs to feel like "the brand" — the logo, the balance visual, the
 * success burst, the empty state — reuses this one shape, so the motif stays
 * consistent across the whole product.
 *
 * `tone` maps the facets onto a colour pair. The default pair is gold because
 * gold is the value colour; passing `purple` or `green` lets the same mark
 * carry interaction and security meaning without redrawing it.
 */
export default function GemMark({
  size = 32,
  tone = 'gold',
  className = '',
  pulse = false,
  title
}) {
  const palettes = {
    gold: { top: '#FFE9A8', mid: '#F4C95D', low: '#C99B32', edge: '#8A6A1E' },
    purple: { top: '#CFC8FF', mid: '#9A8CFF', low: '#7C6CFF', edge: '#4B3FB0' },
    green: { top: '#B4F2D8', mid: '#65D6A1', low: '#34A97A', edge: '#1E6A50' }
  };

  const p = palettes[tone] || palettes.gold;
  const gid = `gem-${tone}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={`gem${pulse ? ' gem--pulse' : ''} ${className}`}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : 'true'}
      aria-label={title}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}

      <defs>
        <linearGradient id={`${gid}-a`} x1="32" y1="4" x2="32" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor={p.top} />
          <stop offset="0.55" stopColor={p.mid} />
          <stop offset="1" stopColor={p.low} />
        </linearGradient>
        <linearGradient id={`${gid}-b`} x1="32" y1="4" x2="14" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor={p.top} stopOpacity="0.95" />
          <stop offset="1" stopColor={p.mid} stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id={`${gid}-c`} x1="32" y1="4" x2="50" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor={p.low} />
          <stop offset="1" stopColor={p.edge} stopOpacity="0.8" />
        </linearGradient>
      </defs>

      {/* Crown */}
      <path d="M18 8h28l-6 12H24L18 8Z" fill={`url(#${gid}-b)`} />
      {/* Upper girdle facets */}
      <path d="M24 20h16l-4 8H28l-4-8Z" fill={`url(#${gid}-a)`} />
      {/* Pavilion — the long lower cut */}
      <path d="M28 28h8l-4 26-4-26Z" fill={`url(#${gid}-c)`} />
      {/* Outer left/right facets give the stone its width */}
      <path d="M18 8l6 12-2 8-8-20 4 0Z" fill={p.mid} fillOpacity="0.75" />
      <path d="M46 8l-6 12 2 8 8-20-4 0Z" fill={p.edge} fillOpacity="0.75" />

      {/* Specular edge — the one highlight that makes it read as a solid. */}
      <path
        d="M18 8h28"
        stroke={p.top}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}
