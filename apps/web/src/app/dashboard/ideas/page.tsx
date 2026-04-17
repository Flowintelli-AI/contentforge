"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Send, Lightbulb, FileText, Mic, Square } from "lucide-react";
import { IdeaStatus, ContentPillarType } from "@prisma/client";

const PILLAR_LABELS: Record<ContentPillarType, string> = {
  EDUCATION: "🎓 Education",
  ENTERTAINMENT: "🎭 Entertainment",
  INSPIRATION: "✨ Inspiration",
  PROMOTION: "📣 Promotion",
  BEHIND_THE_SCENES: "🎬 Behind the Scenes",
  COMMUNITY: "🤝 Community",
};

const STATUS_COLORS: Record<IdeaStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  IN_REVIEW: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  SCRIPTED: "bg-indigo-100 text-indigo-700",
  ARCHIVED: "bg-red-100 text-red-700",
};

// Extend window type for SpeechRecognition (browser API)
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor;
    webkitSpeechRecognition: SpeechRecognitionConstructor;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone access denied. Click the 🔒 icon in your browser's address bar and allow microphone.",
  "no-speech": "No speech detected. Try speaking louder or check your microphone.",
  "network": "Network error. Chrome needs internet access to process speech.",
  "audio-capture": "No microphone found. Check that a mic is connected.",
  "aborted": "",
};

function useSpeechDictation(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const shouldRestartRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setIsSupported(!!SR);
  }, []);

  function createRecognition() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return null;

    const recognition: SpeechRecognitionInstance = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript + " ";
        } else {
          interim += result[0].transcript;
        }
      }
      if (final) onTranscriptRef.current(final);
      setInterimText(interim);
    };

    recognition.onend = () => {
      // Chrome stops after silence — auto-restart if user didn't click stop
      if (shouldRestartRef.current) {
        const next = createRecognition();
        if (next) {
          next.start();
          recognitionRef.current = next;
          return;
        }
      }
      setIsListening(false);
      setInterimText("");
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const msg = ERROR_MESSAGES[event.error] ?? `Speech error: ${event.error}`;
      if (msg) setError(msg);
      if (event.error !== "no-speech") {
        shouldRestartRef.current = false;
        setIsListening(false);
        setInterimText("");
      }
    };

    return recognition;
  }

  function start() {
    setError(null);
    shouldRestartRef.current = true;
    const recognition = createRecognition();
    if (!recognition) return;
    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch (e) {
      setError(`Could not start microphone: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function stop() {
    shouldRestartRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    setInterimText("");
  }

  return { isListening, isSupported, interimText, error, start, stop, toggle: isListening ? stop : start };
}

export default function IdeasPage() {
  const [rawIdea, setRawIdea] = useState("");
  const [pillar, setPillar] = useState<ContentPillarType | "">("");
  const [showForm, setShowForm] = useState(false);

  const { isListening, isSupported, interimText, error, toggle, stop } = useSpeechDictation((text) => {
    setRawIdea((prev) => prev + text);
  });

  const { data, isLoading, refetch } = api.ideas.list.useQuery({ limit: 20 });

  const submit = api.ideas.submit.useMutation({
    onSuccess: () => {
      stop();
      setRawIdea("");
      setPillar("");
      setShowForm(false);
      refetch();
    },
  });

  function handleSubmit() {
    if (!rawIdea.trim()) return;
    submit.mutate({ rawIdea, pillarType: pillar || undefined });
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ideas</h1>
          <p className="text-sm text-gray-500 mt-1">Dump your raw ideas. AI will structure them into scripts.</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-2" /> New Idea
        </Button>
      </div>

      {/* Submission form */}
      {showForm && (
        <Card className="mb-6 border-indigo-200 bg-indigo-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              What&apos;s your idea?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Textarea with mic button */}
            <div className="relative">
              <Textarea
                placeholder={
                  isListening
                    ? "🎙️ Listening… just speak naturally"
                    : "Just dump it raw. Speak or type. Example: 'talk about how most people waste time on content that doesn't convert'"
                }
                value={isListening && interimText ? rawIdea + interimText : rawIdea}
                onChange={(e) => {
                  if (!isListening) setRawIdea(e.target.value);
                }}
                rows={4}
                className={`bg-white resize-none pr-12 transition-all ${isListening ? "border-red-400 ring-2 ring-red-200" : ""}`}
              />
              {isSupported && (
                <button
                  type="button"
                  onClick={toggle}
                  title={isListening ? "Stop dictation" : "Start dictation"}
                  className={`absolute right-3 top-3 p-1.5 rounded-full transition-all ${
                    isListening
                      ? "bg-red-100 text-red-600 hover:bg-red-200 animate-pulse"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {isListening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              )}
            </div>

            {isListening && (
              <div className="flex items-center gap-2 text-xs text-red-600 -mt-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                Recording… speak your idea. Click the stop button when done.
              </div>
            )}
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 -mt-2">
                ⚠️ {error}
              </p>
            )}
            {!isSupported && (
              <p className="text-xs text-amber-600">
                ⚠️ Voice dictation requires Chrome or Edge. Type your idea instead.
              </p>
            )}

            <div className="flex items-center gap-3">
              <Select value={pillar} onValueChange={(v) => setPillar(v as ContentPillarType)}>
                <SelectTrigger className="w-52 bg-white">
                  <SelectValue placeholder="Content pillar (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PILLAR_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleSubmit}
                disabled={!rawIdea.trim() || submit.isPending}
                className="ml-auto"
              >
                {submit.isPending
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
                  : <><Send className="w-4 h-4 mr-2" /> Submit &amp; Generate Script</>
                }
              </Button>
            </div>
            {submit.isPending && (
              <p className="text-xs text-indigo-600">
                🤖 AI is refining your idea and queuing script generation…
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Ideas list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin w-6 h-6 text-indigo-500" />
        </div>
      ) : data?.ideas.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <Lightbulb className="w-12 h-12 text-amber-300 mx-auto mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">No ideas yet</h3>
            <p className="text-sm text-gray-500 mb-4">Start by submitting your first raw idea above.</p>
            <Button onClick={() => setShowForm(true)}>Submit Your First Idea</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data?.ideas.map((idea) => (
            <Card key={idea.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 font-medium line-clamp-2">
                      {idea.refinedIdea ?? idea.rawIdea}
                    </p>
                    {idea.refinedIdea && idea.refinedIdea !== idea.rawIdea && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-1">Raw: {idea.rawIdea}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[idea.status]}`}>
                        {idea.status.replace("_", " ")}
                      </span>
                      {idea.pillarType && (
                        <span className="text-xs text-gray-500">
                          {PILLAR_LABELS[idea.pillarType]}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-xs text-gray-400">
                      {new Date(idea.createdAt).toLocaleDateString()}
                    </span>
                    {idea.scripts.length > 0 && (
                      <Link href={`/dashboard/scripts/${idea.scripts[0].id}`}>
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          <FileText className="w-3 h-3 mr-1" />
                          View Script
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
