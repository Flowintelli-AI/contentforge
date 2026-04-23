import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { PDFDocument } from 'pdf-lib';
import { getFonts } from './fonts';
import { CarouselInput } from './brand';
import { renderSlide } from './templates/index';
import { fetchPexelsImage } from './images';

/**
 * Full render pipeline: 10 slides → SVG (Satori) → PNG (resvg) → PDF (pdf-lib) → base64.
 * Pexels background images are pre-fetched in parallel before the render loop.
 */
export async function generateCarouselPdf(input: CarouselInput): Promise<string> {
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

    const pngImage = await pdfDoc.embedPng(pngBuffer);
    const page = pdfDoc.addPage([1080, 1440]);
    page.drawImage(pngImage, { x: 0, y: 0, width: 1080, height: 1440 });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes).toString('base64');
}
