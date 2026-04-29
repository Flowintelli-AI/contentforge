import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { PDFDocument } from 'pdf-lib';
import { BlobServiceClient } from '@azure/storage-blob';
import { v2 as cloudinary } from 'cloudinary';
import { getFonts } from './fonts';
import { CarouselInput } from './brand';
import { renderSlide } from './templates/index';
import { fetchPexelsImage } from './images';

const BLOB_CONTAINER = 'carousel-slides';
const BLOB_ACCOUNT_URL = 'https://flowintellistorage.blob.core.windows.net';

const SLIDE_WIDTH = 1080;
const SLIDE_HEIGHT = 1350; // 4:5 — Instagram max portrait ratio

export interface CarouselRenderResult {
  pdf_base64: string;
  slides_png_urls: string[];
  slides_cloudinary_urls: string[];
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
          const uri = await fetchPexelsImage(s.image_query!, pexelsKey, SLIDE_WIDTH, SLIDE_HEIGHT);
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
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
      fonts,
    });

    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: SLIDE_WIDTH },
    });

    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();
    pngBuffers.push(pngBuffer);

    const pngImage = await pdfDoc.embedPng(pngBuffer);
    const page = pdfDoc.addPage([SLIDE_WIDTH, SLIDE_HEIGHT]);
    page.drawImage(pngImage, { x: 0, y: 0, width: SLIDE_WIDTH, height: SLIDE_HEIGHT });
  }

  const pdfBytes = await pdfDoc.save();
  const pdf_base64 = Buffer.from(pdfBytes).toString('base64');
  const slides_png_urls = await uploadSlidesToBlob(pngBuffers);
  const slides_cloudinary_urls = await uploadSlidesToCloudinary(pngBuffers);

  return { pdf_base64, slides_png_urls, slides_cloudinary_urls };
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

async function uploadSlidesToCloudinary(pngBuffers: Buffer[]): Promise<string[]> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) return [];

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const urls = await Promise.all(
    pngBuffers.map((buf, i) =>
      new Promise<string>((resolve, reject) => {
        const publicId = `carousel-slides/${runId}-slide-${i + 1}`;
        const uploadStream = cloudinary.uploader.upload_stream(
          { public_id: publicId, resource_type: 'image', format: 'jpg', quality: 90 },
          (err, result) => {
            if (err || !result) return reject(err ?? new Error('Cloudinary upload returned no result'));
            resolve(result.secure_url);
          },
        );
        uploadStream.end(buf);
      }),
    ),
  );

  return urls;
}
