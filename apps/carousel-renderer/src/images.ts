/**
 * Pexels image fetcher.
 * Returns a JPEG as a base64 data URI cropped to exact pixel dimensions,
 * so Satori can render it without objectFit (unsupported in Satori).
 */
const PEXELS_API_BASE = 'https://api.pexels.com/v1';

export async function fetchPexelsImage(
  query: string,
  apiKey: string,
  width: number,
  height: number,
): Promise<string | null> {
  try {
    const searchUrl =
      `${PEXELS_API_BASE}/search` +
      `?query=${encodeURIComponent(query)}&per_page=3&orientation=portrait&size=large`;

    const searchRes = await fetch(searchUrl, { headers: { Authorization: apiKey } });
    if (!searchRes.ok) return null;

    const data = (await searchRes.json()) as {
      photos: Array<{ src: { original: string } }>;
    };
    if (!data.photos?.length) return null;

    // Strip existing query params, append exact-crop params
    const baseUrl = data.photos[0].src.original.split('?')[0];
    const cropUrl = `${baseUrl}?auto=compress&cs=tinysrgb&fit=crop&w=${width}&h=${height}`;

    const imgRes = await fetch(cropUrl);
    if (!imgRes.ok) return null;

    const buf = Buffer.from(await imgRes.arrayBuffer());
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
