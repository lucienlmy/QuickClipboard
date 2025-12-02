import { useState, useEffect } from 'react';
function SidebarButton({
  id,
  icon: Icon,
  label,
  isActive,
  onClick,
  index
}) {
  const [particles, setParticles] = useState([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [bounceKey, setBounceKey] = useState(0);
  useEffect(() => {
    if (isAnimating) {
      setBounceKey(prev => prev + 1);
      const newParticles = Array.from({
        length: 8
      }, (_, i) => ({
        id: Date.now() + i,
        angle: i * 45 + Math.random() * 20,
        distance: 15 + Math.random() * 10
      }));
      setParticles(newParticles);
      const timer = setTimeout(() => {
        setParticles([]);
        setIsAnimating(false);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isAnimating]);
  const handleClick = () => {
    setIsAnimating(true);
    onClick(id);
  };
  return <div className="relative">
      <button key={`button-${bounceKey}`} onClick={handleClick} className={`
          group w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium 
          focus:outline-none active:scale-[0.98]
          animate-slide-in-left-fast
          ${isActive ? 'bg-blue-500 text-white shadow-md scale-[1.02] animate-button-bounce' : 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700/50 hover:shadow-sm hover:scale-[1.01] hover:translate-x-0.5'}
        `} style={{
      animationDelay: `${index * 25}ms`,
      animationFillMode: 'backwards',
      transitionProperty: 'transform, box-shadow, background-color, color',
      transitionDuration: '200ms, 200ms, 500ms, 500ms'
    }}>
        <i className={`
    ${Icon}
    transition-transform duration-200
    ${isActive ? 'scale-110' : 'group-hover:scale-110 group-hover:rotate-3'}
  `} style={{
        fontSize: 18
      }} data-strokewidth={2} />

        <span className="transition-transform duration-200 group-hover:translate-x-0.5">
          {label}
        </span>
      </button>

      {/* 粒子效果 */}
      {particles.map(particle => <div key={particle.id} className="absolute top-1/2 left-6 w-1.5 h-1.5 rounded-full bg-blue-400 pointer-events-none" style={{
      '--particle-angle': `${particle.angle}deg`,
      '--particle-distance': `${particle.distance}px`,
      animation: 'particleExplosion 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards'
    }} />)}
    </div>;
}
export default SidebarButton;