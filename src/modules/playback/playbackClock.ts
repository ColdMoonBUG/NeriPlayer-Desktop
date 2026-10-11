/** The backend reports consumed audio every 200ms. Never extrapolate through
 * an unbounded network/device stall or advance before the first audible frame. */
export function predictAudiblePosition(anchorMs: number, elapsedMs: number, speed: number, durationMs: number, advancing: boolean): number {
  const leadMs = advancing ? Math.min(250, Math.max(0, elapsedMs)) * speed : 0
  const position = Math.max(0, anchorMs + leadMs)
  return durationMs > 0 ? Math.min(position, durationMs) : position
}
