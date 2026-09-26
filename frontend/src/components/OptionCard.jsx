import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

/**
 * A single, fully clickable option tile.
 *
 * Deliberately NOT a radio input: the whole card is the hit target, which
 * matches the reference design and is far better on touch. Keyboard users get
 * real `<button>` semantics for free.
 *
 * `scanning` drives the ~0.5s sweep that plays while the answer is submitted.
 */
export default function OptionCard({
  option,
  index,
  selected,
  scanning,
  revealed,
  outcome,
  disabled,
  onSelect
}) {
  const isSelected = selected === option;

  const stateClass = [
    'option-card',
    isSelected ? 'selected' : '',
    scanning && isSelected ? 'scanning' : '',
    revealed && isSelected && outcome === 'CORRECT' ? 'correct' : '',
    revealed && isSelected && outcome === 'WRONG' ? 'wrong' : '',
    revealed && !isSelected ? 'muted' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <motion.button
      type="button"
      className={stateClass}
      onClick={() => onSelect(option)}
      disabled={disabled}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.28, ease: 'easeOut' }}
      whileHover={disabled ? undefined : { y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
    >
      {scanning && isSelected && <span className="option-scan" aria-hidden="true" />}

      <span className="option-text">{option}</span>

      {isSelected && (
        <span className="option-check" aria-hidden="true">
          <Check size={14} strokeWidth={3} />
        </span>
      )}
    </motion.button>
  );
}

