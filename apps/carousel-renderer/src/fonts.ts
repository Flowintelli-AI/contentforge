import { readFileSync } from 'fs';
import { join } from 'path';
import type { Font } from 'satori';

let fontsCache: Font[] | null = null;

function loadFont(filename: string): ArrayBuffer {
  const fontPath = join(__dirname, '..', '..', 'fonts', filename);
  const buf = readFileSync(fontPath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/**
 * Loads TTF fonts from the /fonts directory once and caches them for reuse
 * across warm Azure Function invocations. Fonts must be downloaded via
 * setup-fonts.ps1 before running locally or deploying.
 */
export async function getFonts(): Promise<Font[]> {
  if (fontsCache) return fontsCache;

  fontsCache = [
    { name: 'Poppins', data: loadFont('Poppins-ExtraBold.ttf'), weight: 800, style: 'normal' },
    { name: 'Poppins', data: loadFont('Poppins-SemiBold.ttf'),  weight: 600, style: 'normal' },
    { name: 'Poppins', data: loadFont('Poppins-Medium.ttf'),    weight: 500, style: 'normal' },
    { name: 'Poppins', data: loadFont('Poppins-Regular.ttf'),   weight: 400, style: 'normal' },
  ];

  return fontsCache;
}
