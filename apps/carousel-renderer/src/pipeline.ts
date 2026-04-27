import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { PDFDocument } from 'pdf-lib';
import { BlobServiceClient } from '@azure/storage-blob';
import { getFonts } from './fonts';
import { CarouselInput } from './brand';
import { renderSlide } from './templates/index';
import { fetchPexelsImage } from './images';

const BLOB_CONTAINER = 'carousel-slides';
const BLOB_ACCOUNT_URL = 'https://flowintellistorage.blob.core.windows.net';

export interface CarouselRenderResult {
  pdf_base64: string;
  slides_png_urls: string[];
}

/**
 * Full render pipeline: 10 slides → SVG (Satori) → PNG (resvg) → PDF (pdf-lib) → base64.
 * PNG buffers are also uploaded to Azure Blob Storage (public container) for Instagram posting.
 * Pexels background images are pre-fetched in parallel before the render loop.
 */
export async function generateCarouselPdf(input: CarouselInput): Promise<CarouselRenderResult> {
  const fonts = await getFonts();
  const pexelsKey = process.env.PEXELS_API_KEY ?? '';

  // Pre-fetch background images in parallel for hook + example slides
  const imageMap = new Map<number, string>();
  if (pexelsKey) {
    await Promise.all(
      input.slides
        .filter(s => s.image_query && (s.type === 'hook' || s.type === 'example'))
        .map(async s => {
          const uri = await fetchPexelsImage(s.image_query!, pexelsKey, 1080, 1440);
          if (uri) imageMap.set(s.position, uri);
        }),
    );
  }

  const pdfDoc = await PDFDocument.create();
  const pngBuffers: Buffer[] = [];

  for (const slide of input.slides) {
    const imageDataUri = imageMap.get(slide.position);
    const element = renderSlide(slide, input.slides.length, imageDataUri);

    const svg = await satori(element, {
      width: 1080,
      height: 1440,
      fonts,
    });

    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1080 },
    });

    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();
    pngBuffers.push(pngBuffer);

    const pngImage = await pdfDoc.embedPng(pngBuffer);
    const page = pdfDoc.addPage([1080, 1440]);
    page.drawImage(pngImage, { x: 0, y: 0, width: 1080, height: 1440 });
  }

  const pdfBytes = await pdfDoc.save();
  const pdf_base64 = Buffer.from(pdfBytes).toString('base64');
  const slides_png_urls = await uploadSlidesToBlob(pngBuffers);

  return { pdf_base64, slides_png_urls };
}

async function uploadSlidesToBlob(pngBuffers: Buffer[]): Promise<string[]> {
  const connStr = process.env.AzureWebJobsStorage;
  if (!connStr) return [];

  const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
  const containerClient = blobServiceClient.getContainerClient(BLOB_CONTAINER);

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const urls: string[] = [];

  await Promise.all(
    pngBuffers.map(async (buf, i) => {
      const blobName = `${runId}-slide-${i + 1}.png`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.upload(buf, buf.length, {
        blobHTTPHeaders: { blobContentType: 'image/png' },
      });
      urls.push(`${BLOB_ACCOUNT_URL}/${BLOB_CONTAINER}/${blobName}`);
    }),
  );

  // Sort by slide number (Promise.all does not guarantee order for different indices)
  return pngBuffers.map((_, i) => {
    const blobName = `${runId}-slide-${i + 1}.png`;
    return `${BLOB_ACCOUNT_URL}/${BLOB_CONTAINER}/${blobName}`;
  });
}
