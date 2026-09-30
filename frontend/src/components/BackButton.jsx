import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/**
 * Back control.
 *
 * Every screen in the reference design carries one, so it lives here rather
 * than being re-marked up per page. `to` gives a deterministic target (used
 * when there is no history to pop, e.g. a hard refresh); otherwise it walks
 * the history stack.
 */
export default function BackButton({ to, label = 'Back' }) {
  const navigate = useNavigate();

  const go = () => {
    // A fresh tab has no history to pop, so fall back to the explicit target.
    if (typeof window !== 'undefined' && window.history.length > 1 && !to) {
      navigate(-1);
    } else {
      navigate(to || '/dashboard');
    }
  };

  return (
    <div className="backbar">
      <button type="button" className="backbtn" onClick={go} aria-label={label}>
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
