import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle, Zap, Calendar, Bot, BarChart3, Video } from "lucide-react";

const features = [
  { icon: Bot,        title: "AI Script Engine",        desc: "Turn any idea into a proven Hook→Pain→Solution script in seconds." },
  { icon: Video,      title: "Video Repurposing",       desc: "Upload one long video. Get 30 optimized clips for every platform." },
  { icon: Calendar,   title: "Content Calendar",        desc: "Auto-built 30-day calendar based on your posting goals." },
  { icon: Zap,        title: "Auto-Distribution",       desc: "Schedule to TikTok, Instagram, LinkedIn and more via Postiz." },
  { icon: BarChart3,  title: "Trend Intelligence",      desc: "Know what's working in your niche before you create." },
  { icon: CheckCircle, title: "Comment Automations",   desc: "Turn comments into DM flows. Reply GUIDE → send your lead magnet." },
];

const tiers = [
  {
    name: "Basic",
    price: "$49",
    period: "/mo",
    description: "Ideas + AI scripts. For creators just getting started.",
    features: ["25 AI scripts/month", "Idea intake board", "Script library", "1 niche", "Email support"],
    cta: "Start Free Trial",
    highlighted: false,
  },
  {
    name: "Growth",
    price: "$99",
    period: "/mo",
    description: "Full content engine. Scripts, repurposing & calendar.",
    features: ["Unlimited scripts", "Video repurposing (Opus Clip)", "30-day auto calendar", "3 niches + influencer tracking", "Postiz scheduling", "Priority support"],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Premium",
    price: "$199",
    period: "/mo",
    description: "Done-for-you. AI avatar, voice, blog & full automation.",
    features: ["Everything in Growth", "AI avatar videos (HeyGen)", "AI voice cloning (ElevenLabs)", "Comment/DM automations", "Blog engine", "Admin review workflow", "Dedicated success manager"],
    cta: "Book a Demo",
    highlighted: false,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b max-w-7xl mx-auto">
        <span className="text-xl font-bold text-indigo-600">ContentForge</span>
        <div className="flex items-center gap-4">
          <Link href="/pricing" className="text-sm text-gray-600 hover:text-gray-900">Pricing</Link>
          <Link href="/sign-in" className="text-sm text-gray-600 hover:text-gray-900">Sign In</Link>
          <Button asChild size="sm">
            <Link href="/sign-up">Start Free Trial</Link>
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-24 px-6 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-sm px-3 py-1 rounded-full mb-6">
          <Zap className="w-4 h-4" />
          <span>1 hour of recording → 30 days of content</span>
        </div>
        <h1 className="text-5xl font-extrabold text-gray-900 leading-tight mb-6">
          Your AI-Powered<br />
          <span className="text-indigo-600">Content Creation Machine</span>
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          ContentForge turns your raw ideas into structured scripts, repurposed clips, 
          scheduled posts, and automated DM flows — all in one platform.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Button asChild size="lg" className="bg-indigo-600 hover:bg-indigo-700">
            <Link href="/sign-up">Start Free Trial</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="#features">See How It Works</Link>
          </Button>
        </div>
        <p className="mt-4 text-sm text-gray-500">14-day free trial · No credit card required</p>
      </section>

      {/* Features */}
      <section id="features" className="py-20 bg-gray-50 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
            Everything you need to go from idea to published
          </h2>
          <p className="text-center text-gray-600 mb-12">
            Stop staring at a blank screen. Let ContentForge do the heavy lifting.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((f) => (
              <div key={f.title} className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-md transition-shadow">
                <f.icon className="w-8 h-8 text-indigo-600 mb-3" />
                <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">Simple, transparent pricing</h2>
          <p className="text-center text-gray-600 mb-12">Start free. Scale as you grow.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`rounded-2xl p-8 border-2 flex flex-col ${
                  tier.highlighted
                    ? "border-indigo-600 bg-indigo-600 text-white shadow-xl scale-105"
                    : "border-gray-200 bg-white"
                }`}
              >
                <div className="mb-6">
                  <h3 className={`text-lg font-bold ${tier.highlighted ? "text-white" : "text-gray-900"}`}>{tier.name}</h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-4xl font-extrabold">{tier.price}</span>
                    <span className={`text-sm ${tier.highlighted ? "text-indigo-200" : "text-gray-500"}`}>{tier.period}</span>
                  </div>
                  <p className={`text-sm mt-2 ${tier.highlighted ? "text-indigo-100" : "text-gray-600"}`}>{tier.description}</p>
                </div>
                <ul className="space-y-3 flex-1 mb-8">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${tier.highlighted ? "text-indigo-200" : "text-indigo-600"}`} />
                      <span className={tier.highlighted ? "text-white" : "text-gray-700"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  variant={tier.highlighted ? "secondary" : "default"}
                  className="w-full"
                >
                  <Link href="/sign-up">{tier.cta}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t text-center">
        <p className="text-sm text-gray-500">© {new Date().getFullYear()} ContentForge. Built for creators who are serious about growth.</p>
      </footer>
    </div>
  );
}
