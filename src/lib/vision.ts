export type Point = { x: number; y: number };
export type BoundingBox = { minX: number; minY: number; maxX: number; maxY: number };
export type RGB = { r: number; g: number; b: number };
export type HSV = { h: number; s: number; v: number };

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

function isDefaultPotatoColor(r: number, g: number, b: number): boolean {
  // Warm brown/tan/yellowish potato spectrum
  return r > 50 && r < 245 && g > 35 && g < 225 && b > 10 && b < 185 && r >= g && g >= b - 20;
}

export function findPotatoBlob(
  imageData: ImageData,
  width: number,
  height: number,
  targetColor: RGB | null
): { centroid: Point; box: BoundingBox } | null {
  const data = imageData.data;

  // Downsample grid (e.g. step by 4 pixels)
  const step = 4;

  let bestBlob = null;
  let bestArea = 0;

  const gridW = Math.floor(width / step);
  const gridH = Math.floor(height / step);
  const visited = new Uint8Array(gridW * gridH);

  const getIdx = (gx: number, gy: number) => gy * gridW + gx;

  const targetHsv = targetColor ? rgbToHsv(targetColor.r, targetColor.g, targetColor.b) : null;

  const matchesPixel = (r: number, g: number, b: number): boolean => {
    if (targetColor && targetHsv) {
      const pixelHsv = rgbToHsv(r, g, b);
      const rawHueDiff = Math.abs(pixelHsv.h - targetHsv.h);
      const circularHueDiff = Math.min(rawHueDiff, 360 - rawHueDiff);

      // If target is very desaturated, hue is noisy; otherwise use tight hue
      const hueMatch = targetHsv.s < 12 ? Math.abs(pixelHsv.v - targetHsv.v) <= 45 : circularHueDiff <= 28;
      const satMatch = Math.abs(pixelHsv.s - targetHsv.s) <= 48;
      const valMatch = Math.abs(pixelHsv.v - targetHsv.v) <= 50;

      if (hueMatch && satMatch && valMatch) return true;
      // Fallback Euclidean color distance for lighting extremes
      return colorDistance(r, g, b, targetColor.r, targetColor.g, targetColor.b) <= 65;
    }
    return isDefaultPotatoColor(r, g, b);
  };

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      if (visited[getIdx(gx, gy)]) continue;

      const px = gx * step;
      const py = gy * step;
      const i = (py * width + px) * 4;

      if (matchesPixel(data[i]!, data[i + 1]!, data[i + 2]!)) {
        // Start flood fill
        const queue: Point[] = [{ x: gx, y: gy }];
        visited[getIdx(gx, gy)] = 1;

        let area = 0;
        let sumX = 0;
        let sumY = 0;
        let minX = gx;
        let maxX = gx;
        let minY = gy;
        let maxY = gy;

        while (queue.length > 0) {
          const { x, y } = queue.pop()!;
          area++;
          sumX += x;
          sumY += y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;

          // Neighbors
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

        const boxW = (maxX - minX) * step;
        const boxH = (maxY - minY) * step;
        
        // Aspect ratio sanity check: potato shouldn't be a needle (< 1:5 or > 5:1)
        const aspectRatio = boxW > 0 && boxH > 0 ? boxW / boxH : 0;
        const isSaneShape = aspectRatio > 0.15 && aspectRatio < 6.0;

        if (area > bestArea && area > 8 && isSaneShape) {
          bestArea = area;
          bestBlob = {
            centroid: { x: (sumX / area) * step, y: (sumY / area) * step },
            box: {
              minX: minX * step,
              minY: minY * step,
              maxX: maxX * step,
              maxY: maxY * step,
            },
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
  centroid?: Point
): Point | null {
  const data = imageData.data;

  // Inset the box to avoid rim shadows
  const insetX = (box.maxX - box.minX) * 0.12;
  const insetY = (box.maxY - box.minY) * 0.12;

  const startX = Math.floor(box.minX + insetX);
  const endX = Math.floor(box.maxX - insetX);
  const startY = Math.floor(box.minY + insetY);
  const endY = Math.floor(box.maxY - insetY);

  if (endX <= startX || endY <= startY) return null;

  const cX = centroid ? centroid.x : (box.minX + box.maxX) / 2;
  const cY = centroid ? centroid.y : (box.minY + box.maxY) / 2;
  const approxRadius = Math.max(8, Math.min(box.maxX - box.minX, box.maxY - box.minY) / 2);
  const minCentroidDist = Math.max(6, approxRadius * 0.18);

  let bestScore = -1;
  let bestPoint: Point | null = null;
  let fallbackPoint: Point | null = null;
  let maxDistSoFar = -1;

  // Step size for performance
  const step = 2;

  for (let y = startY + step; y < endY - step; y += step) {
    for (let x = startX + step; x < endX - step; x += step) {
      const distFromCentroid = Math.hypot(x - cX, y - cY);
      if (distFromCentroid > maxDistSoFar) {
        maxDistSoFar = distFromCentroid;
        fallbackPoint = { x, y };
      }

      // Feature MUST be distinct from the centroid
      if (distFromCentroid < minCentroidDist) continue;

      const i = (y * width + x) * 4;
      const luma = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;

      // Calculate local contrast by sampling neighbors
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

      // Dark spot / sticker with high contrast
      const darkness = 255 - luma;
      const score = darkness * 0.7 + contrast * 0.3;

      if (score > bestScore) {
        bestScore = score;
        bestPoint = { x, y };
      }
    }
  }

  // If no high-contrast dark spot was found, use the farthest interior point from centroid
  return bestPoint || fallbackPoint;
}
