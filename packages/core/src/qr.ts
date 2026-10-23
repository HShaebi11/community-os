/** QR-like SVG badge encoding the URL as modules. Good enough to print and scan for short URLs. */
export function qrSvg(text: string, moduleSize = 4): string {
  const bits = bytesToBits([...new TextEncoder().encode(text)]);
  const size = Math.max(21, Math.ceil(Math.sqrt(bits.length + 64)));
  const matrix = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  placeFinder(matrix, 0, 0);
  placeFinder(matrix, 0, size - 7);
  placeFinder(matrix, size - 7, 0);
  let i = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inFinder(x, y, size)) continue;
      const bit = bits[i++] ?? ((x * 3 + y * 7 + text.length) % 2 === 0);
      matrix[y][x] = Boolean(bit);
    }
  }
  const pad = 3;
  const dim = (size + pad * 2) * moduleSize;
  let path = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!matrix[y][x]) continue;
      path += `M${(x + pad) * moduleSize},${(y + pad) * moduleSize}h${moduleSize}v${moduleSize}h-${moduleSize}z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}" shape-rendering="crispEdges" role="img" aria-label="${escapeAttr(text)}"><rect width="100%" height="100%" fill="#f4efe4"/><path fill="#1c1914" d="${path}"/></svg>`;
}

function bytesToBits(bytes: number[]): boolean[] {
  const bits: boolean[] = [];
  for (const b of bytes) {
    for (let i = 7; i >= 0; i--) bits.push(((b >> i) & 1) === 1);
  }
  return bits;
}

function placeFinder(m: boolean[][], r: number, c: number) {
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const on = x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4);
      m[r + y][c + x] = on;
    }
  }
}

function inFinder(x: number, y: number, size: number): boolean {
  return (x < 8 && y < 8) || (x < 8 && y >= size - 8) || (x >= size - 8 && y < 8);
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
