/**
 * test-gpt.mjs — tests the full GPT → render pipeline end-to-end.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node test-gpt.mjs
 *   OR add OPENAI_API_KEY to local.settings.json and run:
 *   node test-gpt.mjs
 *
 * Sends a real Flowintelli-style article to GPT-4o-mini, prints the structured
 * slides JSON, then renders the full carousel PDF to Desktop/carousel-gpt-test.pdf
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Load env from local.settings.json if OPENAI_API_KEY not already set
if (!process.env.OPENAI_API_KEY) {
  try {
    const settings = JSON.parse(readFileSync(join(__dirname, 'local.settings.json'), 'utf8'));
    Object.assign(process.env, settings.Values ?? {});
  } catch {
    // ignore — env var may be set externally
  }
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY is not set. Add it to local.settings.json or set the env var.');
  process.exit(1);
}

// ─── Sample Flowintelli article ────────────────────────────────────────────────
const ARTICLE_TITLE = 'How Flowintelli Cut Our Client\'s Manual Data Entry Time by 73%';

const ARTICLE_BODY = `
One of our clients — a mid-sized logistics company — had a team of 4 people spending nearly 3 hours every single day on one task: copying shipment data from their carrier portal into their ERP system.

That's 12 hours of human time. Daily. Gone.

The problem wasn't that they lacked a good ERP. They had one. The problem was a 15-year-old carrier portal that didn't support webhooks, had no API, and exported only CSV files that landed in an email inbox.

So we built a Flowintelli automation that:
1. Watched the inbox for emails from the carrier portal
2. Parsed the CSV attachment automatically
3. Validated each row against business rules (flagging anomalies)
4. Pushed clean records into the ERP via its REST API
5. Sent a Slack summary to the ops team showing what was processed and what needed manual review

Total build time: 4 days.
Total cost: $0/month in additional tooling (it ran on their existing Flowintelli plan).

Results after 30 days:
- Manual data entry dropped by 73%
- Error rate fell from 4.2% to 0.1%
- The ops team reclaimed 11 hours per day
- ROI in under 2 weeks

The remaining 27% of cases required human judgment — shipments with incomplete carrier data, exceptions, or regulatory holds. And that's fine. Automation should handle the predictable. Humans should handle the exceptions.

This is the pattern we see again and again: teams aren't short on talent. They're short on time because predictable, rule-based work is stealing hours that should go to thinking, selling, and building.

If you have a process that happens the same way more than 80% of the time, it can be automated. The 20% edge cases don't disqualify automation — they define where the automation stops and the human begins.

The playbook:
- Identify the trigger (what starts the process)
- Map the happy path (the 80% case)
- Define the exception rules (what needs a human)
- Build the automation for the happy path first
- Add exception routing in week 2

Most teams never get started because they're waiting for a perfect solution. A 73% reduction on day one is not perfect. It's transformative.
`;

// ─── Step 1: Call GPT ──────────────────────────────────────────────────────────
console.log('⏳ Calling GPT-4o-mini...');

const { SYSTEM_PROMPT, buildUserPrompt } = await import('./dist/src/prompt.js');

const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${OPENAI_API_KEY}`,
  },
  body: JSON.stringify({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 2000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(ARTICLE_TITLE, ARTICLE_BODY) },
    ],
  }),
});

if (!gptResponse.ok) {
  const err = await gptResponse.text();
  console.error('❌ GPT error:', gptResponse.status, err);
  process.exit(1);
}

const gptData = await gptResponse.json();
const rawJson = gptData.choices[0]?.message?.content;
console.log('\n✅ GPT response received\n');

let carouselInput;
try {
  carouselInput = JSON.parse(rawJson);
} catch {
  console.error('❌ GPT output is not valid JSON:\n', rawJson);
  process.exit(1);
}

console.log('📋 Format:', carouselInput.format);
console.log('📝 Caption preview:', carouselInput.caption?.slice(0, 100) + '...\n');
console.log('🎠 Slides:');
for (const slide of carouselInput.slides) {
  const extra = slide.hook_stat ? ` [stat: ${slide.hook_stat}]` : slide.stats ? ` [${slide.stats.length} stats]` : slide.steps ? ` [${slide.steps.length} steps]` : '';
  console.log(`  ${slide.position}. [${slide.type}] ${slide.headline}${extra}`);
}

// Save structured JSON for inspection
const jsonOut = join(__dirname, 'test-gpt-output.json');
writeFileSync(jsonOut, JSON.stringify(carouselInput, null, 2));
console.log(`\n💾 Full JSON saved → ${jsonOut}`);

// ─── Step 2: Render PDF ────────────────────────────────────────────────────────
console.log('\n⏳ Rendering carousel PDF...');

// Load pipeline from dist
const { generateCarouselPdf } = await import('./dist/src/pipeline.js');

const pdfBase64 = await generateCarouselPdf(carouselInput);
const pdfBytes = Buffer.from(pdfBase64, 'base64');

const pdfOut = join(process.env.USERPROFILE ?? process.env.HOME ?? __dirname, 'Desktop', 'carousel-gpt-test.pdf');
writeFileSync(pdfOut, pdfBytes);

console.log(`✅ PDF saved → ${pdfOut} (${Math.round(pdfBytes.length / 1024)}KB)`);
console.log('\n🎉 Full pipeline test complete — open the PDF to review!');
