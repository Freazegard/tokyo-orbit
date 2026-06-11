import { Canvas } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import { Leva } from 'leva'
import { Suspense, useEffect } from 'react'
import { Scene } from './Scene'
import { useViewStore } from './store'
import { scrollState } from './scrollState'
import './App.css'

const TITLES = [
  {
    title: ['Littlest', 'Tokyo'],
    body: 'A city in miniature, in constant motion.',
    align: 'left',
  },
  {
    title: ['Living', 'streets'],
    body: 'Cars, banners, light — every frame is alive.',
    align: 'right',
  },
  {
    title: ['From', 'above'],
    body: 'The same city, a different angle.',
    align: 'left',
  },
  {
    title: ['Always', 'turning'],
    body: 'Built to orbit. Built to breathe.',
    align: 'right',
  },
]

// Compute fade opacity for a title based on the wrapped progress (0..1).
// Each title owns a 1/N slice of the loop and fades in/out at its edges.
function titleOpacity(progress, index, total = TITLES.length) {
  const quarter = 1 / total
  const center = (index + 0.5) * quarter
  const halfWidth = quarter / 2
  const fadeWidth = quarter * 0.25
  let dist = Math.abs(progress - center)
  if (dist > 0.5) dist = 1 - dist // wrap-around distance
  if (dist <= halfWidth - fadeWidth) return 1
  if (dist >= halfWidth) return 0
  return (halfWidth - dist) / fadeWidth
}

export default function App() {
  const cameraView = useViewStore((s) => s.cameraView)
  const enterCameraView = useViewStore((s) => s.enterCameraView)
  const exitCameraView = useViewStore((s) => s.exitCameraView)
  const gradeHue = useViewStore((s) => s.gradeHue)
  const gradeSat = useViewStore((s) => s.gradeSat)
  const scrollProgress = useViewStore((s) => s.scrollProgress)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && cameraView) exitCameraView()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cameraView, exitCameraView])

  // Custom wheel listener — only active in camera view. Replaces drei's
  // ScrollControls entirely. No DOM scroll container = no browser overscroll
  // trap = scroll back always works.
  useEffect(() => {
    if (!cameraView) return
    const onWheel = (e) => {
      e.preventDefault()
      scrollState.target += e.deltaY * 0.0008
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [cameraView])

  const canvasFilter = cameraView
    ? `hue-rotate(${gradeHue * 180}deg) saturate(${1 + gradeSat})`
    : 'none'

  return (
    <div className={`app ${cameraView ? 'is-camera' : 'is-author'}`}>
      <div className="canvas-wrapper" style={{ filter: canvasFilter }}>
        <Canvas
          camera={{ fov: 35, position: [5, 2, 5] }}
          gl={{ antialias: true, toneMappingExposure: 1.1 }}
        >
          <color attach="background" args={['#0a0a0f']} />
          <Suspense fallback={null}>
            <Environment preset="city" />
            <Scene />
          </Suspense>
        </Canvas>
      </div>

      {cameraView && (
        <div className="titles-overlay">
          {TITLES.map((t, i) => {
            const op = titleOpacity(scrollProgress, i)
            return (
              <section
                key={i}
                className={`title-section ${t.align}`}
                style={{
                  opacity: op,
                  visibility: op < 0.01 ? 'hidden' : 'visible',
                  transform: `translateY(${(1 - op) * 30}px)`,
                }}
              >
                <div>
                  <h1>
                    {t.title[0]}
                    <br />
                    {t.title[1]}
                  </h1>
                  <p>{t.body}</p>
                </div>
              </section>
            )
          })}
        </div>
      )}

      {cameraView && <div className="vignette" />}

      <Leva hidden={cameraView} collapsed={false} />

      {!cameraView && (
        <button
          type="button"
          className="enter-camera-btn"
          onClick={enterCameraView}
        >
          <span className="dot" />
          Enter camera view
        </button>
      )}

      {cameraView && (
        <button
          type="button"
          className="exit-camera-btn"
          onClick={exitCameraView}
          title="Esc"
        >
          ← Exit camera <kbd>ESC</kbd>
        </button>
      )}

      <div className="mode-chip">
        {cameraView ? 'CAMERA VIEW' : 'AUTHOR VIEW'}
      </div>

      {cameraView && <div className="hint">scroll ↓</div>}

      {cameraView && (
        <div className="credit">
          Model: Glen Fox · <abbr title="Creative Commons Attribution">CC-BY</abbr>
        </div>
      )}
    </div>
  )
}
