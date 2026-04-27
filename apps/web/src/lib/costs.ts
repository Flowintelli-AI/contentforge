/**
 * Pipeline cost estimation utilities.
 * Rates are estimates based on public pricing — adjust as plans change.
 */

// ── Pricing constants ──────────────────────────────────────────────────────────
const ELEVENLABS_PER_CHAR  = 0.0003;   // $0.30 / 1K chars (API rate)
const HEYGEN_PER_SECOND    = 0.08;     // ~$0.08 / sec lipsync output
const LAMBDA_GB_PER_SECOND = 0.0000166667; // AWS Lambda standard rate
const LAMBDA_GB_MEMORY     = 3;        // Remotion render function memory (GB)
const LAMBDA_SECS_PER_CLIP_SEC = 3;    // ~3s of Lambda compute per 1s of output video

export interface ClipCostBreakdown {
  elevenlabs?: number; // TTS characters cost
  heygen?: number;     // Lipsync output duration cost
  remotion: number;    // Lambda compute cost
  total: number;
}

/**
 * Computes estimated clip cost in USD.
 *
 * @param elevenlabsChars  Number of characters sent to ElevenLabs TTS
 * @param heygenDurationSec  Duration of HeyGen lipsync output in seconds
 * @param remotionDurationSec  Duration of the rendered clip in seconds (for Lambda estimate)
 */
export function computeClipCostUsd(params: {
  elevenlabsChars?: number;
  heygenDurationSec?: number;
  remotionDurationSec?: number;
}): ClipCostBreakdown {
  const elevenlabs = params.elevenlabsChars
    ? parseFloat((params.elevenlabsChars * ELEVENLABS_PER_CHAR).toFixed(4))
    : undefined;

  const heygen = params.heygenDurationSec
    ? parseFloat((params.heygenDurationSec * HEYGEN_PER_SECOND).toFixed(4))
    : undefined;

  const lambdaSec = (params.remotionDurationSec ?? 30) * LAMBDA_SECS_PER_CLIP_SEC;
  const remotion = parseFloat((lambdaSec * LAMBDA_GB_MEMORY * LAMBDA_GB_PER_SECOND).toFixed(4));

  const total = parseFloat(((elevenlabs ?? 0) + (heygen ?? 0) + remotion).toFixed(4));

  return { elevenlabs, heygen, remotion, total };
}
