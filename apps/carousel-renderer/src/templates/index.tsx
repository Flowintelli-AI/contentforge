import type { ReactElement } from 'react';
import { SlideData } from '../brand';
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
): ReactElement {
  switch (slide.type) {
    case 'hook':
      return <HookSlide slide={slide} totalSlides={totalSlides} imageDataUri={imageDataUri} />;
    case 'example':
      return <ExampleSlide slide={slide} totalSlides={totalSlides} imageDataUri={imageDataUri} />;
    case 'diagram':
      return <DiagramSlide slide={slide} totalSlides={totalSlides} />;
    case 'practical':
      return <PracticalSlide slide={slide} totalSlides={totalSlides} />;
    case 'cta':
      return <CtaSlide slide={slide} totalSlides={totalSlides} />;
    default:
      return <HookSlide slide={slide} totalSlides={totalSlides} imageDataUri={imageDataUri} />;
  }
}
