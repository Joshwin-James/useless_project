export type Point = { x: number; y: number };
export type BoundingBox = { minX: number; minY: number; maxX: number; maxY: number };
export type RGB = { r: number; g: number; b: number };
export type HSV = { h: number; s: number; v: number };

export type PotatoBlob = {
  centroid: Point;
  box: BoundingBox;
  area: number;
  orientationDeg: number;
};

export function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2));
}

export function rgbToHsv(r: number, g: number, b: number): HSV {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rNorm) {
      h = ((gNorm - bNorm) / d) % 6;
    } else if (max === gNorm) {
      h = (bNorm - rNorm) / d + 2;
    } else {
      h = (rNorm - gNorm) / d + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : Math.round((d / max) * 100);
  const v = Math.round(max * 100);
  return { h, s, v };
}

export function isDefaultPotatoColor(r: number, g: number, b: number): boolean {
  // Convert to HSV for robust chromaticity analysis across lighting conditions
  const { h, s, v } = rgbToHsv(r, g, b);

  // Reject extreme darkness or overexposed white glare
  if (v < 14 || v > 98) return false;

  // Potato hues:
  // - Russet, yellow/gold, brown, tan: warm hues 10° to 68°
  // - Red potato, sweet potato, purple-red skin: 335° to 360° and 0° to 25°
  const isWarmHue = (h >= 10 && h <= 68) || (h >= 335 || h <= 25);
  if (!isWarmHue) return false;

  // Natural skin saturation (excludes pure gray/black/white tables, allows earthy skins)
  if (s < 7 || s > 95) return false;

  // Tubers have dominant warm channels (Red/Green) relative to Blue
  if (b > r + 16 || b > g + 35) return false;

  // Red component is higher than or reasonably close to Green
  if (r < g * 0.70) return false;

  return true;
}

export function findPotatoBlob(
  imageData: ImageData,
  width: number,
  height: number,
  targetColor: RGB | null
): PotatoBlob | null {
  const data = imageData.data;
  const step = 4;

  const gridW = Math.floor(width / step);
  const gridH = Math.floor(height / step);
  const totalCells = gridW * gridH;
  const visited = new Uint8Array(totalCells);

  const getIdx = (gx: number, gy: number) => gy * gridW + gx;

  const targetHsv = targetColor ? rgbToHsv(targetColor.r, targetColor.g, targetColor.b) : null;

  const matchesPixel = (r: number, g: number, b: number): boolean => {
    if (targetColor && targetHsv) {
      const pixelHsv = rgbToHsv(r, g, b);
      const rawHueDiff = Math.abs(pixelHsv.h - targetHsv.h);
      const circularHueDiff = Math.min(rawHueDiff, 360 - rawHueDiff);

      // Relaxed tolerances for shadows and highlights on rotating tuber surface
      const hueMatch = targetHsv.s < 12 ? Math.abs(pixelHsv.v - targetHsv.v) <= 50 : circularHueDiff <= 35;
      const satMatch = Math.abs(pixelHsv.s - targetHsv.s) <= 55;
      const valMatch = Math.abs(pixelHsv.v - targetHsv.v) <= 60;

      if (hueMatch && satMatch && valMatch) return true;
      return colorDistance(r, g, b, targetColor.r, targetColor.g, targetColor.b) <= 80;
    }
    return isDefaultPotatoColor(r, g, b);
  };

  let bestBlob: PotatoBlob | null = null;
  let bestArea = 0;

  // Dynamic minimum area: reject tiny noise specks, require at least a small potato shape
  const minAreaThreshold = Math.max(30, Math.floor(totalCells * 0.002));
  const maxAreaThreshold = Math.floor(totalCells * 0.85);

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      if (visited[getIdx(gx, gy)]) continue;

      const px = gx * step;
      const py = gy * step;
      const i = (py * width + px) * 4;

      if (matchesPixel(data[i]!, data[i + 1]!, data[i + 2]!)) {
        // Flood fill
        const queue: Point[] = [{ x: gx, y: gy }];
        visited[getIdx(gx, gy)] = 1;

        let area = 0;
        let sumX = 0;
        let sumY = 0;
        let sumXX = 0;
        let sumYY = 0;
        let sumXY = 0;
        let minX = gx;
        let maxX = gx;
        let minY = gy;
        let maxY = gy;

        while (queue.length > 0) {
          const { x, y } = queue.pop()!;
          area++;
          sumX += x;
          sumY += y;
          sumXX += x * x;
          sumYY += y * y;
          sumXY += x * y;

          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;

          const neighbors = [
            { nx: x + 1, ny: y },
            { nx: x - 1, ny: y },
            { nx: x, ny: y + 1 },
            { nx: x, ny: y - 1 },
          ];

          for (const { nx, ny } of neighbors) {
            if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
              const nIdx = getIdx(nx, ny);
              if (!visited[nIdx]) {
                visited[nIdx] = 1;
                const pi = (ny * step * width + nx * step) * 4;
                if (matchesPixel(data[pi]!, data[pi + 1]!, data[pi + 2]!)) {
                  queue.push({ x: nx, y: ny });
                }
              }
            }
          }
        }

        const boxW = (maxX - minX + 1) * step;
        const boxH = (maxY - minY + 1) * step;
        const boxAreaCells = (maxX - minX + 1) * (maxY - minY + 1);
        const fillDensity = area / Math.max(1, boxAreaCells);
        const aspectRatio = boxW > 0 && boxH > 0 ? boxW / boxH : 0;

        // Strict rejection of random noise specks, needles, and screen-wide fills
        const isSaneShape =
          area >= minAreaThreshold &&
          area <= maxAreaThreshold &&
          boxW >= 24 &&
          boxH >= 24 &&
          fillDensity >= 0.22 &&
          aspectRatio >= 0.22 &&
          aspectRatio <= 4.5;

        if (isSaneShape && area > bestArea) {
          bestArea = area;

          // Compute central moments for orientation angle
          const meanX = sumX / area;
          const meanY = sumY / area;
          const u20 = sumXX / area - meanX * meanX;
          const u02 = sumYY / area - meanY * meanY;
          const u11 = sumXY / area - meanX * meanY;

          let orientationDeg = (0.5 * Math.atan2(2 * u11, u20 - u02) * 180) / Math.PI;
          if (orientationDeg < 0) orientationDeg += 360;

          bestBlob = {
            centroid: { x: meanX * step, y: meanY * step },
            box: {
              minX: minX * step,
              minY: minY * step,
              maxX: (maxX + 1) * step,
              maxY: (maxY + 1) * step,
            },
            area,
            orientationDeg,
          };
        }
      }
    }
  }

  return bestBlob;
}

export function findAsymmetricFeature(
  imageData: ImageData,
  width: number,
  box: BoundingBox,
  centroid?: Point,
  previousFeature?: Point | null
): Point | null {
  const data = imageData.data;

  // Inset the box to avoid rim shadows & background edges
  const insetX = (box.maxX - box.minX) * 0.14;
  const insetY = (box.maxY - box.minY) * 0.14;

  const startX = Math.floor(box.minX + insetX);
  const endX = Math.floor(box.maxX - insetX);
  const startY = Math.floor(box.minY + insetY);
  const endY = Math.floor(box.maxY - insetY);

  if (endX <= startX || endY <= startY) return null;

  const cX = centroid ? centroid.x : (box.minX + box.maxX) / 2;
  const cY = centroid ? centroid.y : (box.minY + box.maxY) / 2;
  const approxRadius = Math.max(8, Math.min(box.maxX - box.minX, box.maxY - box.minY) / 2);
  const minCentroidDist = Math.max(7, approxRadius * 0.20);
  const halfW = Math.max(1, (box.maxX - box.minX) / 2);
  const halfH = Math.max(1, (box.maxY - box.minY) / 2);

  let bestScore = -1;
  let bestPoint: Point | null = null;
  const step = 2;

  for (let y = startY + step; y < endY - step; y += step) {
    for (let x = startX + step; x < endX - step; x += step) {
      const distFromCentroid = Math.hypot(x - cX, y - cY);

      // Feature MUST be strictly inside the potato body (elliptical boundary check)
      const normDist = Math.pow((x - cX) / halfW, 2) + Math.pow((y - cY) / halfH, 2);
      if (normDist > 0.78) continue;

      // Must not be right at the center of mass
      if (distFromCentroid < minCentroidDist) continue;

      const i = (y * width + x) * 4;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;

      // Candidate feature MUST be on potato body
      if (!isDefaultPotatoColor(r, g, b) && !(r > 40 && g > 25 && b > 10 && r >= g)) continue;

      const luma = 0.299 * r + 0.587 * g + 0.114 * b;

      // Local contrast check
      const n1 = ((y - step) * width + x) * 4;
      const n2 = ((y + step) * width + x) * 4;
      const n3 = (y * width + (x - step)) * 4;
      const n4 = (y * width + (x + step)) * 4;

      const l1 = 0.299 * data[n1]! + 0.587 * data[n1 + 1]! + 0.114 * data[n1 + 2]!;
      const l2 = 0.299 * data[n2]! + 0.587 * data[n2 + 1]! + 0.114 * data[n2 + 2]!;
      const l3 = 0.299 * data[n3]! + 0.587 * data[n3 + 1]! + 0.114 * data[n3 + 2]!;
      const l4 = 0.299 * data[n4]! + 0.587 * data[n4 + 1]! + 0.114 * data[n4 + 2]!;

      const avgNeighborLuma = (l1 + l2 + l3 + l4) / 4;
      const contrast = Math.abs(avgNeighborLuma - luma);
      const darkness = 255 - luma;

      // Quality score: contrast + darkness + distance from centroid
      let score = darkness * 0.5 + contrast * 0.5 + (distFromCentroid / approxRadius) * 20;

      // If we were tracking a feature in the previous frame, reward spatial proximity to prevent teleporting
      if (previousFeature) {
        const distFromPrev = Math.hypot(x - previousFeature.x, y - previousFeature.y);
        const maxExpectedMove = approxRadius * 0.8;
        if (distFromPrev < maxExpectedMove) {
          score += (1 - distFromPrev / maxExpectedMove) * 45;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestPoint = { x, y };
      }
    }
  }

  // Only accept feature if score is confident enough
  if (bestScore > 35 && bestPoint) {
    return bestPoint;
  }

  // If previous feature is still valid inside bounds, maintain continuity
  if (previousFeature) {
    const pNormDist = Math.pow((previousFeature.x - cX) / halfW, 2) + Math.pow((previousFeature.y - cY) / halfH, 2);
    if (pNormDist <= 0.80) {
      return previousFeature;
    }
  }

  // Fallback: choose a stable point along the major semi-axis
  const fallbackAngle = (box.maxX - box.minX >= box.maxY - box.minY) ? 0 : Math.PI / 2;
  return {
    x: Math.round(cX + Math.cos(fallbackAngle) * (halfW * 0.65)),
    y: Math.round(cY + Math.sin(fallbackAngle) * (halfH * 0.65)),
  };
}
