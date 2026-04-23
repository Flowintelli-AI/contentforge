// Minimal standalone test — isolate which slide is failing
process.env.PEXELS_API_KEY = 'IjEZ4VfT6830Q6d7LhrHqLOVm48aC05XT50kyXCl3eBf79VGddB3lxr0';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { renderSlide } = require('./dist/src/templates/index.js');
const { getFonts } = require('./dist/src/fonts.js');
const satori = require('../../node_modules/satori/dist/index.cjs').default;

const input = {
  slides: [
    { type: 'hook', position: 1, headline: 'AI Automation Changes Everything', subtext: 'Here is what most teams are missing', hook_stat: '73%' },
    { type: 'example', position: 2, headline: '3 Hours Saved Every Single Day', body: 'One Make.com flow replaced a manual reporting process.', bullets: ['Triggered on new data', 'Formatted and sent automatically', 'Zero human touch after setup'] },
    { type: 'example', position: 3, headline: 'Real Results From Real Teams', body: 'Flowintelli clients see ROI inside 30 days.', bullets: ['14hrs per week recovered', '88 percent fewer errors', 'Deployed in under a week'] },
    { type: 'diagram', position: 4, headline: 'The Automation Stack', steps: ['Trigger webhook or schedule', 'Process with GPT or logic', 'Act on CRM Slack or email', 'Measure via auto-updating dashboard'] },
    { type: 'diagram', position: 5, headline: '2 Stats That Prove It', stats: [{ value: '5x', label: 'faster delivery' }, { value: '80%', label: 'cost reduction' }] },
    { type: 'practical', position: 6, headline: 'Start With The Biggest Pain', body: 'Pick the task your team hates most.', bullets: ['Map the steps', 'Identify the tool', 'Build in 1 day'] },
    { type: 'practical', position: 7, headline: 'Use Make.com First', body: 'No-code visual connects 2000 plus apps.', teaser: 'Next: the prompt that structures your data' },
    { type: 'practical', position: 8, headline: 'Prompt Engineering Is The Lever', body: 'One GPT prompt replaces an entire data team for repetitive tasks.' },
    { type: 'practical', position: 9, headline: '3 Wins Stack Into a System', body: 'Hook then Example then Automate. Repeat for every bottleneck.' },
    { type: 'cta', position: 10, headline: 'Follow For Weekly AI Automation Playbooks', action: 'Follow Flowintelli', cta_comment_prompt: 'Drop a comment if this was useful.' },
  ]
};

const fonts = await getFonts();

for (const slide of input.slides) {
  try {
    const el = renderSlide(slide, input.slides.length, undefined);
    await satori(el, { width: 1080, height: 1440, fonts });
    console.log('OK slide ' + slide.position + ' (' + slide.type + ')');
  } catch (err) {
    console.error('FAIL slide ' + slide.position + ' (' + slide.type + '): ' + err.message);
  }
}
