'use client'

import { useEffect, useRef, useState } from 'react'

/** Animate a number from its current display value toward `target`. */
export function useCountUp(target: number) {
  const [display, setDisplay] = useState(0)
  const ref = useRef(0)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const next = ref.current + (target - ref.current) * 0.15
      if (Math.abs(target - next) < 0.5) { ref.current = target; setDisplay(target); return }
      ref.current = next; setDisplay(Math.round(next)); raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return display
}
