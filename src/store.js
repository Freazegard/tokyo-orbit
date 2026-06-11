import { create } from 'zustand'

export const useViewStore = create((set) => ({
  // Production deploys land directly inside the cinematic; local dev keeps the
  // editor available so the keyframe-authoring workflow is unchanged.
  cameraView: import.meta.env.PROD,
  enterCameraView: () => set({ cameraView: true }),
  exitCameraView: () => set({ cameraView: false }),
  toggle: () => set((s) => ({ cameraView: !s.cameraView })),

  // Color grade values updated from Scene each frame (throttled), read by App
  // for the canvas CSS filter.
  gradeHue: 0,
  gradeSat: 0,
  setGrade: (hue, sat) => set({ gradeHue: hue, gradeSat: sat }),

  // Throttled scroll progress (0..1) for the App to render title overlays.
  // The raw, frame-rate value lives in scrollState.js — this is just for React.
  scrollProgress: 0,
  setScrollProgress: (v) =>
    set((s) => (Math.abs(s.scrollProgress - v) > 0.005 ? { scrollProgress: v } : s)),
}))
