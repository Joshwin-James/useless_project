export type Point = { x: number; y: number };
export type BoundingBox = { minX: number; minY: number; maxX: number; maxY: number };

// Helper to check if a pixel is "potato colored" (brown/yellowish)
// This is very rudimentary and assumes decent lighting
function isPotatoColor(r: number, g: number, b: number): boolean {
  // Mostly looking for warm colors where R > G > B, but not too extreme
  return r > 80 && r < 240 && g > 60 && g < 220 && b > 20 && b < 160 && r > g && g > b;
}

export function findPotatoBlob(
  imageData: ImageData,
  width: number,
  height: number,
): { centroid: Point; box: BoundingBox } | null {
  const data = imageData.data;

  // Downsample grid (e.g. step by 4 pixels)
  const step = 4;

  let bestBlob = null;
  let bestArea = 0;

  // We'll do a simple iterative flood fill on the downsampled grid to find the largest connected component
  const gridW = Math.floor(width / step);
  const gridH = Math.floor(height / step);
  const visited = new Uint8Array(gridW * gridH);

  const getIdx = (gx: number, gy: number) => gy * gridW + gx;

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      if (visited[getIdx(gx, gy)]) continue;

      const px = gx * step;
      const py = gy * step;
      const i = (py * width + px) * 4;

      if (isPotatoColor(data[i]!, data[i + 1]!, data[i + 2]!)) {
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
                if (isPotatoColor(data[pi]!, data[pi + 1]!, data[pi + 2]!)) {
                  queue.push({ x: nx, y: ny });
                }
              }
            }
          }
        }

        if (area > bestArea && area > 10) {
          // arbitrary min size
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
): Point | null {
  const data = imageData.data;

  // Inset the box to avoid rim shadows
  const insetX = (box.maxX - box.minX) * 0.15;
  const insetY = (box.maxY - box.minY) * 0.15;

  const startX = Math.floor(box.minX + insetX);
  const endX = Math.floor(box.maxX - insetX);
  const startY = Math.floor(box.minY + insetY);
  const endY = Math.floor(box.maxY - insetY);

  if (endX <= startX || endY <= startY) return null;

  let bestScore = -1;
  let bestPoint: Point | null = null;

  // Step size for performance
  const step = 2;

  for (let y = startY + step; y < endY - step; y += step) {
    for (let x = startX + step; x < endX - step; x += step) {
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

      // We want dark spots with high contrast
      // Invert luma so dark is high score
      const darkness = 255 - luma;
      const score = darkness * 0.7 + contrast * 0.3;

      if (score > bestScore) {
        bestScore = score;
        bestPoint = { x, y };
      }
    }
  }

  return bestPoint;
}
