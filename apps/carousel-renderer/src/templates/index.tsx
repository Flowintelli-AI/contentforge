import type { ReactElement } from 'react';
import { SlideData, BrandTheme } from '../brand';
import { HookSlide } from './hookSlide';
import { ExampleSlide } from './exampleSlide';
import { DiagramSlide } from './diagramSlide';
import { PracticalSlide } from './practicalSlide';
import { CtaSlide } from './ctaSlide';

/** Dispatches a slide to its corresponding template component */
export function renderSlide(
  slide: SlideData,
  totalSlides: number,
  imageDataUri?: string,
  brand?: BrandTheme,
): ReactElement {
  switch (slide.type) {
    case 'hook':
      return <HookSlide slide={slide} totalSlides={totalSlides} imageDataUri={imageDataUri} brand={brand} />;
    case 'example':
      return <ExampleSlide slide={slide} totalSlides={totalSlides} imageDataUri={imageDataUri} brand={brand} />;
    case 'diagram':
      return <DiagramSlide slide={slide} totalSlides={totalSlides} brand={brand} />;
    case 'practical':
      return <PracticalSlide slide={slide} totalSlides={totalSlides} brand={brand} />;
    case 'cta':
      return <CtaSlide slide={slide} totalSlides={totalSlides} brand={brand} />;
    default:
      return <HookSlide slide={slide} totalSlides={totalSlides} imageDataUri={imageDataUri} brand={brand} />;
  }
}

