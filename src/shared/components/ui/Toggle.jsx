import { useState, useEffect } from 'react';
function Toggle({
  checked,
  onChange,
  disabled = false
}) {
  const [particles, setParticles] = useState([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);
  useEffect(() => {
    if (isAnimating) {
      const newParticles = Array.from({
        length: 8
      }, (_, i) => ({
        id: Date.now() + i,
        angle: i * 45 + Math.random() * 20,
        distance: 12 + Math.random() * 8
      }));
      setParticles(newParticles);
      const timer = setTimeout(() => {
        setParticles([]);
        setIsAnimating(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isAnimating]);
  const handleClick = () => {
    if (disabled) return;
    const newChecked = !checked;
    setIsAnimating(true);
    setAnimationKey(prev => prev + 1);
    onChange(newChecked);
  };
  const handleKeyDown = e => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const newChecked = !checked;
      setIsAnimating(true);
      setAnimationKey(prev => prev + 1);
      onChange(newChecked);
    }
  };
  return <div className="relative">
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={handleClick} onKeyDown={handleKeyDown} className={`w-11 h-6 rounded-full relative overflow-visible transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:scale-105 active:scale-95 ${checked ? 'bg-blue-500 dark:bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`} style={{
      backgroundColor: checked ? '#3b82f6' : '#d1d5db'
    }}>
        <span key={animationKey} className={`block w-5 h-5 rounded-full shadow-md animate-toggle-bounce absolute top-0.5 transition-transform duration-200 ${checked ? 'bg-gray-100' : 'bg-white'}`} style={{
        transform: checked ? 'translateX(22px)' : 'translateX(2px)',
        '--toggle-start': checked ? '2px' : '22px',
        '--toggle-end': checked ? '22px' : '2px'
      }} />

        {/* 粒子效果 */}
        {particles.map(particle => <div key={particle.id} className="absolute top-1/2 w-1.5 h-1.5 rounded-full bg-blue-400 pointer-events-none" style={{
        left: checked ? 'calc(100% - 12px)' : '12px',
        '--particle-angle': `${particle.angle}deg`,
        '--particle-distance': `${particle.distance}px`,
        animation: 'particleExplosion 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards'
      }} />)}
      </button>
    </div>;
}
export default Toggle;