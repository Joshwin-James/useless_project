/**
 * Unwraps an angle (0-360) to prevent discontinuity when wrapping around 0/360.
 */
export function unwrapAngle(currentDeg: number, previousUnwrappedDeg: number): number {
  const diff = currentDeg - (previousUnwrappedDeg % 360);
  let adjustedDiff = diff;
  if (diff > 180) adjustedDiff -= 360;
  if (diff < -180) adjustedDiff += 360;
  return previousUnwrappedDeg + adjustedDiff;
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
