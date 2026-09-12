/**
 * Unwraps an angle (0-360) into a continuous accumulating value across frames.
 * Accurately handles wraparound (0° <-> 360°) for any accumulated angle.
 */
export function unwrapAngle(currentDeg: number, previousUnwrappedDeg: number): number {
  const curNorm = ((currentDeg % 360) + 360) % 360;
  const prevNorm = ((previousUnwrappedDeg % 360) + 360) % 360;
  let diff = curNorm - prevNorm;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return previousUnwrappedDeg + diff;
}

/**
 * Normalizes any angle in degrees into [0, 360).
 */
export function normalizeAngle360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Calculates circular distance error between two angles (0-180°).
 */
export function calculateCircularError(predictedDeg: number, actualDeg: number): number {
  const p = normalizeAngle360(predictedDeg);
  const a = normalizeAngle360(actualDeg);
  const rawDiff = Math.abs(p - a);
  return Math.min(rawDiff, 360 - rawDiff);
}

/**
 * Mathematically derives accuracy score (0-100%) from circular angular error (0-180°).
 * 0° error = 100% accuracy, 180° error = 0% accuracy.
 */
export function calculateAccuracyFromError(errorDeg: number): number {
  const clamped = Math.max(0, Math.min(180, errorDeg));
  return Math.max(0, Math.min(100, Math.round((1 - clamped / 180) * 1000) / 10));
}

/**
 * Exponential Moving Average
 */
export function calculateEMA(current: number, previousEMA: number, alpha: number = 0.3): number {
  return current * alpha + previousEMA * (1 - alpha);
}

/**
 * Linear regression to find the slope (acceleration/deceleration) of velocity over time.
 * @param data Array of { t: time in seconds, v: velocity }
 * @returns slope (deceleration)
 */
export function estimateDeceleration(data: { t: number; v: number }[]): number {
  if (data.length < 2) return 0;

  const n = data.length;
  let sumT = 0;
  let sumV = 0;
  let sumTV = 0;
  let sumTT = 0;

  for (const p of data) {
    sumT += p.t;
    sumV += p.v;
    sumTV += p.t * p.v;
    sumTT += p.t * p.t;
  }

  const denominator = n * sumTT - sumT * sumT;
  if (denominator === 0) return 0;

  return (n * sumTV - sumT * sumV) / denominator;
}

/**
 * Predicts stopping distance or remaining rotation.
 * formula: d = v^2 / (2 * a)
 * @param currentVelocity The velocity right now
 * @param deceleration The absolute value of deceleration
 */
export function predictStoppingAmount(currentVelocity: number, deceleration: number): number {
  if (deceleration <= 0 || currentVelocity <= 0) return 0;
  return (currentVelocity * currentVelocity) / (2 * deceleration);
}

export function degreesPerSecToRPM(degPerSec: number): number {
  return (degPerSec / 360) * 60;
}

export function rpmToDegreesPerSec(rpm: number): number {
  return (rpm / 60) * 360;
}

/**
 * Clamps physical tabletop angular velocity to realistic hand-spin limits (default 320 RPM).
 * Spurious single-frame sensor jumps will be rejected.
 */
export function clampPhysicalRPM(rpm: number, maxRPM: number = 320): number {
  return Math.max(0, Math.min(maxRPM, rpm));
}

/**
 * Deadband threshold to eliminate pixel-quantization jitter when the potato is stationary.
 */
export function applyDeadband(val: number, threshold: number = 16): number {
  return Math.abs(val) < threshold ? 0 : val;
}

