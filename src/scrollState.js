// Module-level shared scroll state. This avoids the DOM scroll container
// entirely — wheel events accumulate into `target` and the camera's useFrame
// lerps `current` toward `target`. No React state, no re-renders → no
// browser overscroll/momentum issues.
export const scrollState = {
  target: 0,
  current: 0,
}
