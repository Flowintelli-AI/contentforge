import OpenAI from "openai";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── R2 client (reuse across calls) ──────────────────────────────────────────
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});
const R2_BUCKET = "contentforge-videos";

// ─── Types ────────────────────────────────────────────────────────────────────
export type ContentFormat =
  | "jabber"
  | "ranking"
  | "man-on-the-street"
  | "clone"
  | "day-in-the-life"
  | "storytelling"
  | "screen"
  | "reactions"
  | "whiteboard"
  | "split-screen";

export interface ReelScript {
  hook: string;
  painPoint: string;
  authority: string;
  solution: string;
  cta: string;
  narrationScript: string; // full voiced text ~75-85 words = ~25 seconds
}

export interface VideoSegment {
  title: string;
  format: ContentFormat;
  reelScript: ReelScript;
  startTime: number;
  endTime: number;
  transcript: string; // verbatim quote from source video
}

// ─── AssemblyAI ───────────────────────────────────────────────────────────────

/**
 * Submits a transcription job to AssemblyAI and returns immediately.
 * AssemblyAI will POST to webhookUrl when transcription completes.
 */
export async function submitTranscriptionJob(
  videoUrl: string,
  webhookUrl: string
): Promise<string> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY is not set");

  const res = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: {
      authorization: apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      audio_url: videoUrl,
      speech_models: ["universal-2"],
      punctuate: true,
      format_text: true,
      webhook_url: webhookUrl,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AssemblyAI submit error ${res.status}: ${err}`);
  }

  const { id } = (await res.json()) as { id: string };
  return id;
}

// ─── ElevenLabs ───────────────────────────────────────────────────────────────

/**
 * Clones the speaker's voice from the uploaded video.
 * Downloads the video from R2, sends to ElevenLabs Instant Voice Cloning.
 * Returns the ElevenLabs voice_id for use in TTS calls.
 */
export async function cloneVoiceFromVideo(
  videoUrl: string,
  videoId: string
): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  console.log(`[clone-voice] Downloading video for ${videoId}...`);
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error(`Failed to fetch video: ${videoRes.status}`);

  const videoBuffer = await videoRes.arrayBuffer();
  const filename = videoUrl.split("/").pop() ?? `video-${videoId}.mp4`;

  const form = new FormData();
  form.append("name", `Speaker-${videoId}`);
  form.append("description", "Auto-cloned voice for ContentForge");
  form.append("remove_background_noise", "true");
  form.append(
    "files",
    new Blob([videoBuffer], { type: "video/mp4" }),
    filename
  );

  console.log(`[clone-voice] Submitting to ElevenLabs (${(videoBuffer.byteLength / 1024 / 1024).toFixed(1)} MB)...`);
  const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs voice clone error ${res.status}: ${err}`);
  }

  const { voice_id } = (await res.json()) as { voice_id: string };
  console.log(`[clone-voice] Voice cloned: ${voice_id}`);
  return voice_id;
}

/**
 * Generates a voiceover MP3 using ElevenLabs TTS with the cloned voice,
 * uploads it to R2, and returns the public URL.
 */
export async function generateAndUploadVoiceover(
  narrationScript: string,
  voiceId: string,
  clipKey: string
): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: narrationScript,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.85,
          style: 0.2,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs TTS error ${res.status}: ${err}`);
  }

  const audioBuffer = await res.arrayBuffer();
  const key = `voiceovers/${clipKey}.mp3`;

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: Buffer.from(audioBuffer),
      ContentType: "audio/mpeg",
    })
  );

  const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
  console.log(`[voiceover] Uploaded to R2: ${publicUrl}`);
  return publicUrl;
}

// ─── GPT-4o ───────────────────────────────────────────────────────────────────

/**
 * Uses GPT-4o to select the 10 best moments and generate a full reel script
 * (Hook / Pain Point / Authority / Solution / CTA) for each, in one of the
 * 10 proven viral content formats.
 */
export async function selectBestSegments(
  transcript: string,
  segments: { start: number; end: number; text: string }[],
  count = 10
): Promise<VideoSegment[]> {
  const MAX_TRANSCRIPT_CHARS = 80_000;
  const MAX_SEGMENTS = 500;

  const truncatedTranscript =
    transcript.length > MAX_TRANSCRIPT_CHARS
      ? transcript.slice(0, MAX_TRANSCRIPT_CHARS) + "\n[transcript truncated]"
      : transcript;

  const sampledSegments =
    segments.length > MAX_SEGMENTS
      ? segments.filter((_, i) => i % Math.ceil(segments.length / MAX_SEGMENTS) === 0)
      : segments;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          `You are an expert viral short-form content strategist.`,
          `Your job: find ${count} powerful moments in a video transcript and transform each into`,
          `a structured viral reel (25 seconds, 9:16 vertical format).`,
          ``,
          `For each clip you must:`,
          `1. Identify the best moment (startTime/endTime from the transcript, 20-30 seconds)`,
          `2. Choose the BEST content format for that moment (use variety — max 2 clips per format):`,
          `   - jabber: energetic direct-to-camera talking head rant`,
          `   - ranking: "Top N..." numbered list structure`,
          `   - man-on-the-street: vox pop / interview Q&A energy`,
          `   - clone: duet-with-self or call-and-response`,
          `   - day-in-the-life: sequential narrative, "first... then... finally..."`,
          `   - storytelling: narrative arc (setup → tension → payoff)`,
          `   - screen: tutorial / how-to / walkthrough`,
          `   - reactions: commentary overlaid on a clip or idea`,
          `   - whiteboard: explain with 3-5 visual key points`,
          `   - split-screen: before/after or comparison`,
          `3. Write a full reel script in that format's style, structured as:`,
          `   hook (1 sentence that stops the scroll), painPoint (relatable struggle),`,
          `   authority (why should they listen), solution (the insight from the video),`,
          `   cta (clear action to take)`,
          `4. Combine all sections into narrationScript (~75-85 words = ~25 seconds voiced).`,
          `   The narrationScript should sound NATURAL when spoken — inspired by the video`,
          `   moment but written to be compelling, not just verbatim transcript.`,
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Full transcript:\n${truncatedTranscript}`,
          `\nTimestamped segments (seconds):\n${JSON.stringify(sampledSegments, null, 2)}`,
          `\nReturn EXACTLY ${count} clips as JSON:`,
          `{
  "clips": [
    {
      "title": "Short catchy title (max 60 chars)",
      "format": "jabber",
      "startTime": 0.0,
      "endTime": 27.5,
      "transcript": "Verbatim quote from this segment of the video",
      "reelScript": {
        "hook": "1-sentence scroll-stopper",
        "painPoint": "Relatable struggle the audience faces",
        "authority": "Why this voice/insight matters",
        "solution": "The key insight or actionable takeaway from the video",
        "cta": "Clear call to action",
        "narrationScript": "Full 75-85 word voiced script combining all sections naturally"
      }
    }
  ]
}`,
          `Rules: startTime/endTime must match real timestamps from the segments. Duration 20-30s. Vary formats.`,
        ].join("\n"),
      },
    ],
  });

  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error("GPT-4o returned empty response");

  const json = JSON.parse(content) as { clips: VideoSegment[] };
  return json.clips.slice(0, count);
}

// ─── Shotstack ────────────────────────────────────────────────────────────────

/**
 * Submits a Shotstack render job for a single reel clip.
 * - Video: trimmed from source at segment timestamps, audio ducked to 5%
 * - Audio: ElevenLabs voiceover as primary soundtrack
 * - Captions: hook + key lines burned in as text overlay
 */
export async function submitShotstackRender(
  videoUrl: string,
  segment: VideoSegment,
  webhookUrl: string,
  voiceoverUrl?: string
): Promise<string> {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  if (!apiKey) throw new Error("SHOTSTACK_API_KEY is not set");

  const env = process.env.SHOTSTACK_ENV ?? "stage";
  const duration = Math.max(1, segment.endTime - segment.startTime);

  // Caption text: hook on first half, CTA on second half
  const captionHook = segment.reelScript?.hook ?? segment.title;
  const captionCta = segment.reelScript?.cta ?? "";

  const tracks = [
    // Caption overlays (top track = rendered on top)
    {
      clips: [
        {
          asset: {
            type: "html",
            html: `<p>${captionHook}</p>`,
            css: [
              "p { font-family: 'Montserrat', sans-serif; font-weight: 900;",
              "font-size: 52px; color: #FFFFFF; text-align: center;",
              "text-shadow: 3px 3px 6px rgba(0,0,0,0.9);",
              "padding: 0 40px; line-height: 1.2; }",
            ].join(" "),
            width: 1080,
            height: 300,
          },
          start: 0,
          length: duration * 0.55,
          position: "bottom",
          offset: { y: 0.15 },
        },
        {
          asset: {
            type: "html",
            html: `<p>${captionCta}</p>`,
            css: [
              "p { font-family: 'Montserrat', sans-serif; font-weight: 700;",
              "font-size: 44px; color: #FFE135; text-align: center;",
              "text-shadow: 2px 2px 4px rgba(0,0,0,0.9);",
              "padding: 0 40px; line-height: 1.2; }",
            ].join(" "),
            width: 1080,
            height: 200,
          },
          start: duration * 0.75,
          length: duration * 0.25,
          position: "bottom",
          offset: { y: 0.15 },
        },
      ],
    },
    // Video track (original footage, audio nearly muted so voiceover is primary)
    {
      clips: [
        {
          asset: {
            type: "video",
            src: videoUrl,
            trim: segment.startTime,
            volume: voiceoverUrl ? 0.05 : 1.0, // near-silent if voiceover present
          },
          start: 0,
          length: duration,
          fit: "cover",
          scale: 0,
        },
      ],
    },
  ];

  const edit: Record<string, unknown> = {
    timeline: {
      tracks,
      // ElevenLabs voiceover as primary audio soundtrack
      ...(voiceoverUrl && {
        soundtrack: {
          src: voiceoverUrl,
          effect: "fadeOut",
          volume: 1.0,
        },
      }),
    },
    output: {
      format: "mp4",
      size: { width: 1080, height: 1920 },
      fps: 30,
      quality: "medium",
    },
    callback: webhookUrl,
  };

  const res = await fetch(`https://api.shotstack.io/${env}/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(edit),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Shotstack render error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as { response: { id: string } };
  return data.response.id;
}
