import { useEffect, useRef, useCallback } from 'react'

interface ParticleSpherePreviewProps {
  width?: number
  height?: number
  className?: string
}

interface Particle {
  baseX: number
  baseY: number
  baseZ: number
}

declare global {
  interface Window {
    setAgentSpeaking?: (speaking: boolean) => void
  }
}

/**
 * Perplexity-style particle sphere visualization component
 * Renders a 3D rotating sphere of particles with amber gradient background
 * Reacts to agent speaking state via window.setAgentSpeaking
 */
export function ParticleSpherePreview({ 
  width = 1280, 
  height = 720,
  className = ''
}: ParticleSpherePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const particlesRef = useRef<Particle[]>([])
  const timeRef = useRef(0)
  const speakingRef = useRef(false)
  const speakingIntensityRef = useRef(0)

  // Initialize particles using fibonacci sphere distribution
  const initParticles = useCallback((sphereRadius: number) => {
    const particles: Particle[] = []
    const particleCount = 1000

    for (let i = 0; i < particleCount; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / particleCount)
      const theta = Math.PI * (1 + Math.sqrt(5)) * i

      const x = sphereRadius * Math.sin(phi) * Math.cos(theta)
      const y = sphereRadius * Math.sin(phi) * Math.sin(theta)
      const z = sphereRadius * Math.cos(phi)

      particles.push({ baseX: x, baseY: y, baseZ: z })
    }

    particlesRef.current = particles
  }, [])

  // Animation loop
  const animate = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const time = timeRef.current
    timeRef.current += 0.012

    // Smoothly transition speaking intensity
    const targetIntensity = speakingRef.current ? 1 : 0
    speakingIntensityRef.current += (targetIntensity - speakingIntensityRef.current) * 0.08
    const speakingIntensity = speakingIntensityRef.current

    // Background gradient - warm amber/brown, shifts to vibrant orange when speaking
    const bgHue = 30 + speakingIntensity * 25
    const bgSat = 45 + speakingIntensity * 35
    const bgLight1 = 8 + speakingIntensity * 8
    const bgLight2 = 18 + speakingIntensity * 12

    const gradient = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 0,
      canvas.width / 2, canvas.height / 2, canvas.width * 0.7
    )
    gradient.addColorStop(0, `hsl(${bgHue}, ${bgSat}%, ${bgLight2}%)`)
    gradient.addColorStop(0.6, `hsl(${bgHue - 5}, ${bgSat - 10}%, ${bgLight1 + 5}%)`)
    gradient.addColorStop(1, `hsl(${bgHue - 10}, ${bgSat - 15}%, ${bgLight1}%)`)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Rotation speeds - faster and more dynamic when speaking
    const rotationSpeedY = 0.25 + speakingIntensity * 0.6
    const rotationSpeedX = 0.12 + speakingIntensity * 0.35
    const rotationSpeedZ = 0.08 + speakingIntensity * 0.2

    const angleY = time * rotationSpeedY
    const angleX = time * rotationSpeedX
    const angleZ = time * rotationSpeedZ

    const sphereRadius = Math.min(canvas.width, canvas.height) * 0.28
    const particles = particlesRef.current

    // Project and transform particles
    const projectedParticles = particles.map((p, i) => {
      // Add wave distortion when speaking - creates pulsing effect
      const waveFreq = 2.5 + speakingIntensity * 2
      const waveAmp = speakingIntensity * 25
      const wave = waveAmp * Math.sin(time * waveFreq + i * 0.02)
      const radialPulse = 1 + speakingIntensity * 0.15 * Math.sin(time * 4 + i * 0.01)

      let x = p.baseX * radialPulse
      let y = p.baseY * radialPulse
      let z = p.baseZ * radialPulse + wave

      // Rotate around Z axis
      const cosZ = Math.cos(angleZ)
      const sinZ = Math.sin(angleZ)
      const x0 = x * cosZ - y * sinZ
      const y0 = x * sinZ + y * cosZ

      // Rotate around Y axis
      const cosY = Math.cos(angleY)
      const sinY = Math.sin(angleY)
      const x1 = x0 * cosY - z * sinY
      const z1 = x0 * sinY + z * cosY

      // Rotate around X axis
      const cosX = Math.cos(angleX)
      const sinX = Math.sin(angleX)
      const y1 = y0 * cosX - z1 * sinX
      const z2 = y0 * sinX + z1 * cosX

      return { x: x1, y: y1, z: z2, index: i }
    }).sort((a, b) => a.z - b.z)

    // Draw particles
    const centerX = canvas.width / 2
    const centerY = canvas.height / 2

    projectedParticles.forEach(p => {
      const depthScale = (p.z + sphereRadius * 1.5) / (sphereRadius * 3)
      const alpha = Math.max(0.15, Math.min(0.95, 0.2 + depthScale * 0.75))
      const size = Math.max(0.5, 1 + depthScale * 2.5)

      // Particle color - warm golden, brighter when speaking
      const particleHue = 38 + speakingIntensity * 12
      const particleSat = 55 + speakingIntensity * 30 + depthScale * 20
      const particleLight = 50 + depthScale * 40 + speakingIntensity * 10

      ctx.beginPath()
      ctx.arc(centerX + p.x, centerY + p.y, size, 0, Math.PI * 2)
      ctx.fillStyle = `hsla(${particleHue}, ${particleSat}%, ${particleLight}%, ${alpha})`
      ctx.fill()
    })

    animationRef.current = requestAnimationFrame(animate)
  }, [])

  // Set up speaking state listener
  useEffect(() => {
    const originalSetSpeaking = window.setAgentSpeaking
    
    // Create a new setter that updates our local ref
    window.setAgentSpeaking = (speaking: boolean) => {
      speakingRef.current = speaking
      // Also call the original if it exists
      originalSetSpeaking?.(speaking)
    }

    return () => {
      // Restore original on cleanup
      if (originalSetSpeaking) {
        window.setAgentSpeaking = originalSetSpeaking
      }
    }
  }, [])

  // Initialize and start animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Set canvas dimensions
    canvas.width = width
    canvas.height = height

    // Initialize particles
    const sphereRadius = Math.min(width, height) * 0.28
    initParticles(sphereRadius)

    // Start animation
    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [width, height, initParticles, animate])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
    />
  )
}
