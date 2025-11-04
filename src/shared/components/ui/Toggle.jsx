import * as Switch from '@radix-ui/react-switch'
import { useState, useEffect } from 'react'

function Toggle({ checked, onChange, disabled = false }) {
  const [particles, setParticles] = useState([])
  const [isAnimating, setIsAnimating] = useState(false)
  const [animationKey, setAnimationKey] = useState(0)

  useEffect(() => {
    if (isAnimating) {
      const newParticles = Array.from({ length: 8 }, (_, i) => ({
        id: Date.now() + i,
        angle: (i * 45) + Math.random() * 20,
        distance: 12 + Math.random() * 8
      }))
      setParticles(newParticles)

      const timer = setTimeout(() => {
        setParticles([])
        setIsAnimating(false)
      }, 500)

      return () => clearTimeout(timer)
    }
  }, [isAnimating])

  const handleChange = (newChecked) => {
    setIsAnimating(true)
    setAnimationKey(prev => prev + 1)
    onChange(newChecked)
  }

  return (
    <div className="relative">
      <Switch.Root
        checked={checked}
        onCheckedChange={handleChange}
        disabled={disabled}
        className="w-11 h-6 bg-gray-300 dark:bg-gray-600 rounded-full relative overflow-visible transition-colors duration-200 data-[state=checked]:bg-blue-500 dark:data-[state=checked]:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:scale-105 active:scale-95"
      >
        <Switch.Thumb 
          key={animationKey}
          className="block w-5 h-5 bg-white rounded-full shadow-md animate-toggle-bounce"
          style={{
            '--toggle-start': checked ? '2px' : '22px',
            '--toggle-end': checked ? '22px' : '2px'
          }}
        />
        
        {/* 粒子效果 */}
        {particles.map(particle => (
          <div
            key={particle.id}
            className="absolute top-1/2 w-1.5 h-1.5 rounded-full bg-blue-400 pointer-events-none"
            style={{
              left: checked ? 'calc(100% - 12px)' : '12px',
              '--particle-angle': `${particle.angle}deg`,
              '--particle-distance': `${particle.distance}px`,
              animation: 'particleExplosion 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards'
            }}
          />
        ))}
      </Switch.Root>
    </div>
  )
}

export default Toggle

