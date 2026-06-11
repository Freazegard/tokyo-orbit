import {
  useGLTF,
  useAnimations,
  Line,
  TransformControls,
  OrbitControls,
  Html,
} from '@react-three/drei'
import { scrollState } from './scrollState'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useControls, button, folder } from 'leva'
import * as THREE from 'three'
import { useViewStore } from './store'

// Dynamic orbit — camera position alternates low/high while orbiting, and
// the targets follow so each shot frames a different layer of the city:
//   KF 0 (right): LOW, eye-level → look at street
//   KF 1 (back):  HIGH, rooftop → look at upper buildings
//   KF 2 (left):  LOW again
//   KF 3 (front): HIGHEST, panoramic → look at rooftops
const INITIAL_KEYFRAMES = [
  { pos: [6, 1.2, 0], target: [0, 0.5, 0] },
  { pos: [0, 3.5, -6], target: [0, 1.5, 0] },
  { pos: [-6, 1.8, 0], target: [0, 0.7, 0] },
  { pos: [0, 4.0, 6], target: [0, 1.8, 0] },
]

const toKf = (raw) => ({
  position: new THREE.Vector3(...raw.pos),
  target: new THREE.Vector3(...raw.target),
})
const cloneKf = (kf) => ({
  position: kf.position.clone(),
  target: kf.target.clone(),
})

export function Scene() {
  const group = useRef()
  const { scene, animations } = useGLTF('/LittlestTokyo.glb')
  const { actions } = useAnimations(animations, group)
  const { camera } = useThree()

  const [modelOffset, setModelOffset] = useState([0, 0, 0])
  useEffect(() => {
    if (!scene) return
    scene.scale.setScalar(0.012)
    scene.position.set(0, 0, 0)
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    setModelOffset([-center.x, -box.min.y, -center.z])
    console.log('📏 Model centered. Size:', size, 'Original center:', center)
  }, [scene])

  const cameraView = useViewStore((s) => s.cameraView)
  const setGrade = useViewStore((s) => s.setGrade)
  const setScrollProgress = useViewStore((s) => s.setScrollProgress)
  const controls = useThree((s) => s.controls)

  // When set, useFrame will smoothly fly the AUTHOR camera (OrbitControls)
  // toward this {pos, target} pair → lets you preview each keyframe's shot.
  const flyTo = useRef(null)

  const [keyframes, setKeyframes] = useState(() => INITIAL_KEYFRAMES.map(toKf))
  const [selectedKf, setSelectedKf] = useState(0)
  // 'position' = editing where the camera IS, 'target' = where it LOOKS
  const [editMode, setEditMode] = useState('position')

  const positionRefs = useRef([])
  const targetRefs = useRef([])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'r' || e.key === 'R') {
        setKeyframes(INITIAL_KEYFRAMES.map(toKf))
        setSelectedKf(0)
        setEditMode('position')
        console.log('🔄 path reset (R key)')
      }
      if (e.key === 'f' || e.key === 'F') {
        const kf = keyframes[selectedKf]
        if (!kf) return
        flyTo.current = {
          pos: kf.position.clone(),
          target: kf.target.clone(),
        }
        console.log(`📷 fly to KF ${selectedKf}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keyframes, selectedKf])

  const preview = useControls('preview', {
    overrideScroll: { value: false, label: 'scrub manually' },
    scrollAt: {
      value: 0,
      min: 0,
      max: 1,
      step: 0.001,
      label: 'scroll position',
    },
    damping: {
      value: 0.25,
      min: 0.01,
      max: 1,
      step: 0.01,
      label: 'smoothing',
    },
    fov: { value: 35, min: 15, max: 90, step: 1 },
  })

  const viz = useControls('viz', {
    showPath: { value: true, label: 'show paths' },
    showKeyframes: { value: true, label: 'show points' },
    'add keyframe': button(() => {
      setKeyframes((prev) => {
        const next = [...prev]
        const a = prev[selectedKf]
        const b = prev[(selectedKf + 1) % prev.length]
        const mid = {
          position: new THREE.Vector3()
            .addVectors(a.position, b.position)
            .multiplyScalar(0.5),
          target: new THREE.Vector3()
            .addVectors(a.target, b.target)
            .multiplyScalar(0.5),
        }
        next.splice(selectedKf + 1, 0, mid)
        return next
      })
    }),
    'remove selected': button(() => {
      setKeyframes((prev) => {
        if (prev.length <= 2) return prev
        return prev.filter((_, i) => i !== selectedKf)
      })
      setSelectedKf((i) => Math.max(0, i - 1))
    }),
    'reset path': button(() => {
      setKeyframes(INITIAL_KEYFRAMES.map(toKf))
      setSelectedKf(0)
      setEditMode('position')
    }),
    'preview selected shot (F)': button((get) => {
      // Read live state via Leva's getter so the button works after edits
      const kf = keyframes[selectedKf]
      if (!kf) return
      flyTo.current = {
        pos: kf.position.clone(),
        target: kf.target.clone(),
      }
    }),
    'copy to clipboard': button(() => {
      const fmt = (v) => v.toFixed(2)
      const posLines = keyframes
        .map(
          (k) =>
            `  new THREE.Vector3(${fmt(k.position.x)}, ${fmt(
              k.position.y
            )}, ${fmt(k.position.z)}),`
        )
        .join('\n')
      const tgtLines = keyframes
        .map(
          (k) =>
            `  new THREE.Vector3(${fmt(k.target.x)}, ${fmt(k.target.y)}, ${fmt(
              k.target.z
            )}),`
        )
        .join('\n')
      const full =
        `// Camera path\nnew THREE.CatmullRomCurve3([\n${posLines}\n], true, 'catmullrom', 0.5)\n\n` +
        `// Target path\nnew THREE.CatmullRomCurve3([\n${tgtLines}\n], true, 'catmullrom', 0.5)`
      navigator.clipboard.writeText(full)
      console.log('📋 copied:\n' + full)
    }),
  })

  const fog = useControls('fog', {
    fogEnabled: { value: true, label: 'enabled' },
    fogNear: { value: 4, min: 0, max: 20, step: 0.1, label: 'near' },
    fogFar: { value: 14, min: 1, max: 30, step: 0.1, label: 'far' },
  })

  const grade = useControls('color grade', {
    gradeEnabled: { value: true, label: 'enabled' },
    startHue: { value: 0.25, min: -1, max: 1, step: 0.01, label: 'opener hue' },
    startSat: { value: 0.1, min: -1, max: 1, step: 0.01, label: 'opener sat' },
    midHue: { value: -0.3, min: -1, max: 1, step: 0.01, label: 'middle hue' },
    midSat: { value: -0.05, min: -1, max: 1, step: 0.01, label: 'middle sat' },
    endHue: { value: 0.35, min: -1, max: 1, step: 0.01, label: 'final hue' },
    endSat: { value: 0.18, min: -1, max: 1, step: 0.01, label: 'final sat' },
  })

  const feel = useControls('feel', {
    parallax: folder(
      {
        parallaxEnabled: { value: true, label: 'enabled' },
        parallaxAmount: {
          value: 0.1,
          min: 0,
          max: 1,
          step: 0.01,
          label: 'amount',
        },
      },
      { collapsed: false }
    ),
    shake: folder(
      {
        shakeEnabled: { value: true, label: 'enabled' },
        shakeIntensity: {
          value: 0.15,
          min: 0,
          max: 2,
          step: 0.05,
          label: 'intensity',
        },
        shakeFreq: {
          value: 0.3,
          min: 0.1,
          max: 2,
          step: 0.05,
          label: 'frequency',
        },
      },
      { collapsed: false }
    ),
  })

  const cameraPath = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        keyframes.map((k) => k.position),
        true,
        'catmullrom',
        0.5
      ),
    [keyframes]
  )
  const targetPath = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        keyframes.map((k) => k.target),
        true,
        'catmullrom',
        0.5
      ),
    [keyframes]
  )
  const cameraPathPoints = useMemo(
    () => cameraPath.getPoints(120),
    [cameraPath]
  )
  const targetPathPoints = useMemo(
    () => targetPath.getPoints(120),
    [targetPath]
  )

  useEffect(() => {
    Object.values(actions).forEach((a) => a?.reset().play())
  }, [actions])

  const tmpTarget = useMemo(() => new THREE.Vector3(), [])
  const parallaxState = useMemo(() => ({ x: 0, y: 0 }), [])
  const lastGrade = useRef({ hue: 0, sat: 0 })

  useFrame((state) => {
    camera.fov = preview.fov
    camera.updateProjectionMatrix()

    // Author-mode fly-to: smoothly move OrbitControls camera to the requested
    // keyframe so the user can see "what does this shot look like".
    if (!cameraView && flyTo.current && controls?.target) {
      camera.position.lerp(flyTo.current.pos, 0.12)
      controls.target.lerp(flyTo.current.target, 0.12)
      controls.update()
      if (camera.position.distanceTo(flyTo.current.pos) < 0.05) {
        flyTo.current = null
      }
    }

    if (!cameraView) return

    // Smooth toward the wheel-accumulated target; wrap to [0,1] for the curve.
    scrollState.current = THREE.MathUtils.lerp(
      scrollState.current,
      scrollState.target,
      0.15
    )
    const rawT = preview.overrideScroll ? preview.scrollAt : scrollState.current
    const t = ((rawT % 1) + 1) % 1

    // Push the wrapped value to the store (throttled inside the setter) so the
    // title overlays know which one to show.
    setScrollProgress(t)

    const pos = cameraPath.getPointAt(t).clone()

    if (feel.parallaxEnabled) {
      parallaxState.x = THREE.MathUtils.lerp(
        parallaxState.x,
        state.pointer.x * feel.parallaxAmount,
        0.06
      )
      parallaxState.y = THREE.MathUtils.lerp(
        parallaxState.y,
        state.pointer.y * feel.parallaxAmount,
        0.06
      )
      pos.x += parallaxState.x
      pos.y += parallaxState.y
    }

    camera.position.lerp(pos, preview.damping)

    // Per-keyframe lookAt: interpolated along the target curve
    tmpTarget.copy(targetPath.getPointAt(t))
    camera.lookAt(tmpTarget)

    // Manual camera shake — applied AFTER lookAt so it stacks instead of being
    // clobbered. Three desynchronized sine waves give organic handheld feel.
    if (feel.shakeEnabled) {
      const time = state.clock.elapsedTime
      const f = feel.shakeFreq
      const i = feel.shakeIntensity
      const yaw = Math.sin(time * f * 2.7) * 0.015 * i
      const pitch = Math.sin(time * f * 3.1 + 1.5) * 0.015 * i
      const roll = Math.sin(time * f * 1.9 + 3.0) * 0.008 * i
      camera.rotateY(yaw)
      camera.rotateX(pitch)
      camera.rotateZ(roll)
    }

    let nextHue = 0
    let nextSat = 0
    if (grade.gradeEnabled) {
      if (t < 0.5) {
        const k = t / 0.5
        nextHue = THREE.MathUtils.lerp(grade.startHue, grade.midHue, k)
        nextSat = THREE.MathUtils.lerp(grade.startSat, grade.midSat, k)
      } else {
        const k = (t - 0.5) / 0.5
        nextHue = THREE.MathUtils.lerp(grade.midHue, grade.endHue, k)
        nextSat = THREE.MathUtils.lerp(grade.midSat, grade.endSat, k)
      }
    }
    if (
      Math.abs(nextHue - lastGrade.current.hue) > 0.01 ||
      Math.abs(nextSat - lastGrade.current.sat) > 0.01
    ) {
      lastGrade.current.hue = nextHue
      lastGrade.current.sat = nextSat
      setGrade(nextHue, nextSat)
    }
  })

  const syncPositionFromMesh = (idx) => {
    const m = positionRefs.current[idx]
    if (!m) return
    setKeyframes((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], position: m.position.clone() }
      return next
    })
  }
  const syncTargetFromMesh = (idx) => {
    const m = targetRefs.current[idx]
    if (!m) return
    setKeyframes((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], target: m.position.clone() }
      return next
    })
  }

  const showAuthorUI = !cameraView
  const activeMeshRef =
    editMode === 'position'
      ? positionRefs.current[selectedKf]
      : targetRefs.current[selectedKf]

  return (
    <>
      {fog.fogEnabled && (
        <fog attach="fog" args={['#0a0a0f', fog.fogNear, fog.fogFar]} />
      )}

      {showAuthorUI && (
        <OrbitControls
          makeDefault
          enableDamping
          target={[0, 0.8, 0]}
          minDistance={1}
          maxDistance={20}
        />
      )}

      <group ref={group}>
        <primitive object={scene} scale={0.012} position={modelOffset} />

        {/* Camera path — cyan */}
        {showAuthorUI && viz.showPath && (
          <Line
            points={cameraPathPoints}
            color="#00ffd5"
            lineWidth={2}
            depthTest={false}
            renderOrder={999}
          />
        )}

        {/* Target path — soft yellow */}
        {showAuthorUI && viz.showPath && (
          <Line
            points={targetPathPoints}
            color="#ffcc66"
            lineWidth={1}
            dashed
            dashSize={0.1}
            gapSize={0.08}
            depthTest={false}
            renderOrder={998}
          />
        )}

        {showAuthorUI &&
          viz.showKeyframes &&
          keyframes.map((kf, i) => {
            const isSelected = i === selectedKf
            return (
              <group key={`kf-${i}-${keyframes.length}`}>
                {/* Camera position sphere — big, primary */}
                <mesh
                  ref={(el) => (positionRefs.current[i] = el)}
                  position={kf.position}
                  renderOrder={1000}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedKf(i)
                    setEditMode('position')
                  }}
                  onPointerOver={(e) => {
                    e.stopPropagation()
                    document.body.style.cursor = 'pointer'
                  }}
                  onPointerOut={() => {
                    document.body.style.cursor = 'auto'
                  }}
                >
                  <sphereGeometry args={[0.15, 16, 16]} />
                  <meshBasicMaterial
                    color={
                      isSelected && editMode === 'position'
                        ? '#00ffd5'
                        : i === 0
                        ? '#ff5050'
                        : '#ffcc00'
                    }
                    depthTest={false}
                    transparent
                  />
                  {isSelected && (
                    <Html
                      center
                      distanceFactor={8}
                      style={{
                        color: '#00ffd5',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        pointerEvents: 'none',
                        transform: 'translateY(-22px)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      KF {i}
                    </Html>
                  )}
                </mesh>

                {/* Target (lookAt) sphere — small, secondary */}
                <mesh
                  ref={(el) => (targetRefs.current[i] = el)}
                  position={kf.target}
                  renderOrder={1000}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedKf(i)
                    setEditMode('target')
                  }}
                  onPointerOver={(e) => {
                    e.stopPropagation()
                    document.body.style.cursor = 'pointer'
                  }}
                  onPointerOut={() => {
                    document.body.style.cursor = 'auto'
                  }}
                >
                  <sphereGeometry args={[0.08, 12, 12]} />
                  <meshBasicMaterial
                    color={
                      isSelected && editMode === 'target' ? '#00ffd5' : '#ffcc66'
                    }
                    depthTest={false}
                    transparent
                  />
                </mesh>

                {/* Sight line: from camera position to its lookAt target */}
                <Line
                  points={[kf.position, kf.target]}
                  color={isSelected ? '#00ffd5' : '#555'}
                  lineWidth={1}
                  dashed
                  dashSize={0.06}
                  gapSize={0.04}
                  depthTest={false}
                  renderOrder={997}
                  transparent
                  opacity={isSelected ? 0.9 : 0.4}
                />
              </group>
            )
          })}

        {showAuthorUI && viz.showKeyframes && activeMeshRef && (
          <TransformControls
            object={activeMeshRef}
            mode="translate"
            size={editMode === 'target' ? 0.4 : 0.6}
            onObjectChange={() =>
              editMode === 'position'
                ? syncPositionFromMesh(selectedKf)
                : syncTargetFromMesh(selectedKf)
            }
          />
        )}
      </group>

      {/* Camera shake is now done manually inside useFrame so it doesn't
          clobber the per-frame lookAt rotation. See the useFrame block. */}
    </>
  )
}

useGLTF.preload('/LittlestTokyo.glb')
