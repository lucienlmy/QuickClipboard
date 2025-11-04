import { useState, useEffect } from 'react'

function ThemeOption({ option, isActive, onClick }) {
  const [particles, setParticles] = useState([])
  const [isAnimating, setIsAnimating] = useState(false)
  const [animationKey, setAnimationKey] = useState(0)

  useEffect(() => {
    if (isAnimating) {
      const newParticles = Array.from({ length: 10 }, (_, i) => ({
        id: Date.now() + i,
        angle: (i * 36) + Math.random() * 20,
        distance: 20 + Math.random() * 15
      }))
      setParticles(newParticles)

      const timer = setTimeout(() => {
        setParticles([])
        setIsAnimating(false)
      }, 600)

      return () => clearTimeout(timer)
    }
  }, [isAnimating])

  const handleClick = () => {
    setIsAnimating(true)
    setAnimationKey(prev => prev + 1)
    onClick()
  }

  return (
    <div className="relative w-full">
      <button
        onClick={handleClick}
        className={`
          w-full flex flex-col items-center gap-2 p-3 rounded-lg border-2 
          transition-all duration-300 overflow-visible
          focus:outline-none active:scale-95
          ${isActive
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-105 shadow-lg shadow-blue-500/30'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:scale-102 hover:shadow-md'
          }
        `}
      >
        <div 
          key={animationKey}
          className={`w-full h-16 rounded-md shadow-sm ${isActive ? 'animate-theme-bounce' : ''}`}
          style={{ background: option.preview }}
        />
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {option.label}
        </span>
      </button>

      {/* 粒子效果 */}
      {particles.map(particle => (
        <div
          key={particle.id}
          className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full bg-blue-400 pointer-events-none"
          style={{
            '--particle-angle': `${particle.angle}deg`,
            '--particle-distance': `${particle.distance}px`,
            animation: 'particleExplosion 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards'
          }}
        />
      ))}
    </div>
  )
}

export default ThemeOption

