import { useState, useEffect } from 'react'

function FilterButton({ id, label, icon: Icon, isActive, onClick, buttonRef }) {
  const [particles, setParticles] = useState([])
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    if (isAnimating) {
      const delayTimer = setTimeout(() => {
        const newParticles = Array.from({ length: 6 }, (_, i) => ({
          id: Date.now() + i,
          angle: (i * 60) + Math.random() * 30,
          distance: 10 + Math.random() * 6
        }))
        setParticles(newParticles)

        const clearTimer = setTimeout(() => {
          setParticles([])
          setIsAnimating(false)
        }, 600)

        return () => clearTimeout(clearTimer)
      }, 300)

      return () => clearTimeout(delayTimer)
    }
  }, [isAnimating])

  const handleClick = () => {
    setIsAnimating(true)
    onClick(id)
  }

  return (
    <div ref={buttonRef} className="relative w-7 h-7">
      <button
        onClick={handleClick}
        title={label}
        className={`
          relative z-10 flex items-center justify-center w-full h-full rounded-lg 
          focus:outline-none active:scale-95
          ${isActive
            ? 'bg-blue-500 text-white shadow-md'
            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
          }
        `}
        style={{
          transitionProperty: 'transform, box-shadow, background-color, color',
          transitionDuration: '200ms, 200ms, 500ms, 500ms'
        }}
      >
        <Icon size={16} />
      </button>

      {/* 粒子效果 */}
      {particles.map(particle => (
        <div
          key={particle.id}
          className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-blue-400 pointer-events-none z-20"
          style={{
            '--particle-angle': `${particle.angle}deg`,
            '--particle-distance': `${particle.distance}px`,
            animation: 'particleExplosion 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards'
          }}
        />
      ))}
    </div>
  )
}

export default FilterButton

