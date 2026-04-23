// Debug: get full Satori error stack trace
process.env.PEXELS_API_KEY = 'IjEZ4VfT6830Q6d7LhrHqLOVm48aC05XT50kyXCl3eBf79VGddB3lxr0';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { renderSlide } = require('./dist/src/templates/index.js');
const { getFonts } = require('./dist/src/fonts.js');
const satori = require('../../node_modules/satori/dist/index.cjs').default;

const slide = { type: 'cta', position: 10, headline: 'Follow For Weekly Playbooks', action: 'Follow Flowintelli' };
const fonts = await getFonts();
const el = renderSlide(slide, 10, undefined);

try {
  await satori(el, { width: 1080, height: 1440, fonts });
  console.log('OK');
} catch (err) {
  console.error('Full error:', err.message);
  console.error('Stack:', err.stack);
}
