import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface VideoSegment {
  title: string;
  hook: string;
  startTime: number;
  endTime: number;
  transcript: string;
}

interface AssemblyAIUtterance {
  start: number;
  end: number;
  text: string;
}

interface AssemblyAITranscript {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  text?: string;
  error?: string;
  utterances?: AssemblyAIUtterance[];
}

/**
 * Transcribes a video via AssemblyAI using the public blob URL.
 * No size limit — AssemblyAI downloads directly from the URL server-side.
 */
export async function transcribeVideo(videoUrl: string): Promise<{
  transcript: string;
  segments: { start: number; end: number; text: string }[];
}> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY is not set");

  // Submit transcription job
  const submitRes = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: {
      authorization: apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      audio_url: videoUrl,
      speaker_labels: false,
      auto_chapters: false,
      punctuate: true,
      format_text: true,
    }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`AssemblyAI submit error ${submitRes.status}: ${err}`);
  }

  const { id } = (await submitRes.json()) as { id: string };

  // Poll until done (max 10 min)
  const pollingUrl = `https://api.assemblyai.com/v2/transcript/${id}`;
  const deadline = Date.now() + 10 * 60 * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));

    const pollRes = await fetch(pollingUrl, {
      headers: { authorization: apiKey },
    });
    const data = (await pollRes.json()) as AssemblyAITranscript;

    if (data.status === "completed") {
      const segments = (data.utterances ?? []).map((u) => ({
        start: u.start / 1000,
        end: u.end / 1000,
        text: u.text,
      }));

      // If no utterances, fall back to full transcript as one segment
      if (segments.length === 0 && data.text) {
        segments.push({ start: 0, end: 999, text: data.text });
      }

      return { transcript: data.text ?? "", segments };
    }

    if (data.status === "error") {
      throw new Error(`AssemblyAI transcription failed: ${data.error}`);
    }
  }

  throw new Error("AssemblyAI transcription timed out after 10 minutes");
}

/**
 * Uses GPT-4o to select the most engaging segments for short-form clips.
 */
export async function selectBestSegments(
  transcript: string,
  segments: { start: number; end: number; text: string }[],
  count = 10
): Promise<VideoSegment[]> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          `You are a viral short-form content strategist.`,
          `Your job: pick the ${count} best moments from a video transcript for vertical 9:16 Reels/Shorts.`,
          `Each clip must be between 15–30 seconds. Focus on: surprising insights, emotional peaks,`,
          `quotable statements, actionable tips, or compelling story arcs.`,
          `Clips should NOT overlap in content.`,
        ].join(" "),
      },
      {
        role: "user",
        content: [
          `Full transcript:\n${transcript}`,
          `\nTimestamped segments (seconds):\n${JSON.stringify(segments, null, 2)}`,
          `\nReturn EXACTLY ${count} clips as JSON:`,
          `{"clips":[{"title":"Short catchy title (max 60 chars)","hook":"Opening sentence that grabs attention","startTime":0.0,"endTime":28.5,"transcript":"Verbatim quote from this segment"}]}`,
          `Rules: startTime and endTime must match real timestamps from the segments above. Duration 15–30s.`,
        ].join("\n"),
      },
    ],
  });

  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error("GPT-4o returned empty response");

  const json = JSON.parse(content) as { clips: VideoSegment[] };
  return json.clips.slice(0, count);
}

/**
 * Submits a single render job to Shotstack.
 * Returns the render job ID.
 */
export async function submitShotstackRender(
  videoUrl: string,
  segment: VideoSegment,
  webhookUrl: string
): Promise<string> {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  if (!apiKey) throw new Error("SHOTSTACK_API_KEY is not set");

  const env = process.env.SHOTSTACK_ENV ?? "stage";
  const duration = Math.max(1, segment.endTime - segment.startTime);

  const edit = {
    timeline: {
      tracks: [
        {
          clips: [
            {
              asset: {
                type: "video",
                src: videoUrl,
                trim: segment.startTime,
                volume: 1,
              },
              start: 0,
              length: duration,
              fit: "cover",
              scale: 0,
            },
          ],
        },
      ],
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
