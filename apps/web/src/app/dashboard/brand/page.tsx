"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/trpc/client";
import { Palette, Save, Upload, CheckCircle } from "lucide-react";

const DEFAULT_PRIMARY = "#06b6d4";
const DEFAULT_ACCENT = "#8b5cf6";

export default function BrandPage() {
  const { data: kit, isLoading } = api.brand.get.useQuery();
  const save = api.brand.save.useMutation();

  const [form, setForm] = useState({
    brandName: "",
    handle: "",
    niche: "",
    primaryColor: DEFAULT_PRIMARY,
    accentColor: DEFAULT_ACCENT,
    logoUrl: "",
    website: "",
    voiceNotes: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (kit) {
      setForm({
        brandName: kit.brandName ?? "",
        handle: kit.handle ?? "",
        niche: kit.niche ?? "",
        primaryColor: kit.primaryColor ?? DEFAULT_PRIMARY,
        accentColor: kit.accentColor ?? DEFAULT_ACCENT,
        logoUrl: kit.logoUrl ?? "",
        website: kit.website ?? "",
        voiceNotes: kit.voiceNotes ?? "",
      });
    }
  }, [kit]);

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    await save.mutateAsync({
      brandName: form.brandName || undefined,
      handle: form.handle || undefined,
      niche: form.niche || undefined,
      primaryColor: /^#[0-9a-fA-F]{6}$/.test(form.primaryColor) ? form.primaryColor : undefined,
      accentColor: /^#[0-9a-fA-F]{6}$/.test(form.accentColor) ? form.accentColor : undefined,
      logoUrl: form.logoUrl || undefined,
      website: form.website || undefined,
      voiceNotes: form.voiceNotes || undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-cyan-500/10 rounded-lg">
          <Palette className="w-6 h-6 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Brand Kit</h1>
          <p className="text-sm text-zinc-400">Define your brand once — auto-filled in every carousel</p>
        </div>
      </div>

      {/* Identity */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Identity</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Brand Name</label>
            <input
              value={form.brandName}
              onChange={(e) => update("brandName", e.target.value)}
              placeholder="My Brand"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Handle</label>
            <input
              value={form.handle}
              onChange={(e) => update("handle", e.target.value)}
              placeholder="@yourbrand"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Niche</label>
            <input
              value={form.niche}
              onChange={(e) => update("niche", e.target.value)}
              placeholder="e.g. Fitness & Nutrition"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Website</label>
            <input
              value={form.website}
              onChange={(e) => update("website", e.target.value)}
              placeholder="https://yourbrand.com"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>
      </section>

      {/* Colors */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Colors</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <ColorField label="Primary Color" value={form.primaryColor} onChange={(v) => update("primaryColor", v)} />
          <ColorField label="Accent Color" value={form.accentColor} onChange={(v) => update("accentColor", v)} />
        </div>
        {/* Live preview */}
        <div className="mt-4 rounded-xl overflow-hidden border border-zinc-700" style={{ background: "#1a1a2e" }}>
          <div className="h-2" style={{ background: `linear-gradient(90deg, ${form.primaryColor}, ${form.accentColor})` }} />
          <div className="p-4 flex items-center justify-between">
            <div>
              <div className="text-white font-semibold text-sm">{form.brandName || "Your Brand"}</div>
              <div className="text-zinc-400 text-xs">{form.handle || "@handle"}</div>
            </div>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ background: form.primaryColor }}
            >
              {(form.brandName || "B")[0].toUpperCase()}
            </div>
          </div>
        </div>
      </section>

      {/* Logo */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Logo</h2>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Logo URL</label>
          <div className="flex gap-2">
            <input
              value={form.logoUrl}
              onChange={(e) => update("logoUrl", e.target.value)}
              placeholder="https://cdn.yourbrand.com/logo.png"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
            />
            {form.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.logoUrl} alt="logo preview" className="w-10 h-10 rounded-lg object-contain bg-zinc-800 border border-zinc-700" />
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
            <Upload className="w-3 h-3" /> Upload to Cloudinary/R2 and paste the URL here
          </p>
        </div>
      </section>

      {/* Voice & Tone */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Voice & Tone</h2>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Instructions for GPT</label>
          <textarea
            value={form.voiceNotes}
            onChange={(e) => update("voiceNotes", e.target.value)}
            rows={4}
            placeholder="e.g. Use an energetic, motivational tone. Write for Gen Z. Always end with a call-to-action."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 resize-none"
          />
        </div>
      </section>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={save.isPending}
          className="flex items-center gap-2 px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-semibold rounded-lg transition-colors"
        >
          {saved ? (
            <><CheckCircle className="w-4 h-4" /> Saved!</>
          ) : save.isPending ? (
            <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Saving…</>
          ) : (
            <><Save className="w-4 h-4" /> Save Brand Kit</>
          )}
        </button>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg cursor-pointer border border-zinc-700 bg-zinc-800"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#06b6d4"
          maxLength={7}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
        />
        <div className="w-8 h-8 rounded-full border border-zinc-700" style={{ background: value }} />
      </div>
    </div>
  );
}
