import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Code2,
  FileText,
  GitBranch,
  GitPullRequest,
  Layers,
  Rocket,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.1 } },
};

function Navbar() {
  const navigate = useNavigate();
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-black/40 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
            <Sparkles className="size-4 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">
            SpecForge
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            className="text-sm text-zinc-400 hover:text-white hover:bg-white/5"
            onClick={() => navigate("/auth")}
          >
            Sign in
          </Button>
          <Button
            size="sm"
            className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500 border-0"
            onClick={() => navigate("/auth?returnTo=/dashboard")}
          >
            Get Started
            <ArrowRight className="ml-1.5 size-3.5" />
          </Button>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  const navigate = useNavigate();
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,80,255,0.15),transparent)]" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[600px] rounded-full bg-violet-600/10 blur-[128px]" />

      <div className="relative z-10 mx-auto max-w-5xl px-6 pt-32 pb-24 text-center">
        <motion.div {...fadeUp}>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5 text-sm text-violet-300">
            <Zap className="size-3.5" />
            AI-Powered Spec-Driven Development
          </div>
        </motion.div>

        <motion.h1
          className="text-5xl font-bold tracking-tight text-white sm:text-7xl leading-[1.1]"
          {...fadeUp}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          Write the spec.
          <br />
          <span className="bg-gradient-to-r from-violet-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            Ship the project.
          </span>
        </motion.h1>

        <motion.p
          className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400 leading-relaxed"
          {...fadeUp}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          SpecForge turns your requirements into production-ready code. Describe
          what you want, let AI plan and scaffold the entire project, then push
          straight to GitHub. From idea to repo in minutes.
        </motion.p>

        <motion.div
          className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
          {...fadeUp}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <Button
            size="lg"
            className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500 border-0 px-8 h-12 text-base"
            onClick={() => navigate("/auth?returnTo=/dashboard")}
          >
            Start Building
            <ArrowRight className="ml-2 size-4" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-zinc-700 text-zinc-300 hover:bg-white/5 hover:text-white px-8 h-12 text-base"
            onClick={() => {
              document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            See How It Works
          </Button>
        </motion.div>

        {/* Terminal preview */}
        <motion.div
          className="mx-auto mt-16 max-w-2xl overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-violet-500/5"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <div className="size-3 rounded-full bg-red-500/80" />
            <div className="size-3 rounded-full bg-yellow-500/80" />
            <div className="size-3 rounded-full bg-green-500/80" />
            <span className="ml-2 text-xs text-zinc-500">specforge</span>
          </div>
          <div className="p-5 text-left font-mono text-sm leading-relaxed">
            <div className="text-zinc-500">$ specforge init</div>
            <div className="mt-2 text-zinc-300">
              <span className="text-violet-400">✓</span> Analyzing spec...
              <span className="ml-2 text-zinc-500">(3,240 tokens)</span>
            </div>
            <div className="text-zinc-300">
              <span className="text-violet-400">✓</span> Generating project
              structure
            </div>
            <div className="text-zinc-300">
              <span className="text-violet-400">✓</span> Writing implementation
              tasks
            </div>
            <div className="text-zinc-300">
              <span className="text-violet-400">✓</span> Scaffolding code
            </div>
            <div className="text-zinc-300">
              <span className="text-violet-400">✓</span> Pushing to{" "}
              <span className="text-cyan-400">github.com/user/my-app</span>
            </div>
            <div className="mt-2 text-green-400">
              🚀 Project ready! 14 files generated.
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: FileText,
      title: "Write Your Spec",
      description:
        "Describe what you want to build in plain English. Use our guided templates or freeform markdown — whatever works for you.",
      color: "from-violet-500 to-purple-600",
    },
    {
      icon: Layers,
      title: "AI Plans & Breaks Down",
      description:
        "Our AI analyzes your spec, generates an architecture plan, and breaks it into actionable implementation tasks with dependencies.",
      color: "from-indigo-500 to-blue-600",
    },
    {
      icon: Code2,
      title: "Code Gets Generated",
      description:
        "Full project scaffolding with real, production-ready code. Components, APIs, database schemas, configs — everything wired up.",
      color: "from-cyan-500 to-teal-600",
    },
    {
      icon: GitBranch,
      title: "Push to GitHub",
      description:
        "One click to create a new GitHub repo and push your generated project. Ready for your team to clone and start building on top.",
      color: "from-emerald-500 to-green-600",
    },
  ];

  return (
    <section id="how-it-works" className="relative py-32">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            From spec to shipped
          </h2>
          <p className="mt-4 text-lg text-zinc-400 max-w-xl mx-auto">
            Four steps. No context-switching. No copy-pasting between tools.
          </p>
        </motion.div>

        <motion.div
          className="grid gap-6 md:grid-cols-2"
          variants={stagger}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: "-100px" }}
        >
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              className="group relative rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 transition-all hover:border-zinc-700 hover:bg-zinc-900"
              variants={fadeUp}
            >
              <div className="absolute top-6 right-6 text-6xl font-bold text-zinc-800/50">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div
                className={`mb-5 inline-flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ${step.color}`}
              >
                <step.icon className="size-5 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white">{step.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                {step.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      icon: Sparkles,
      title: "AI-Powered Planning",
      description:
        "Automatic architecture decisions, task decomposition, and dependency mapping from your requirements.",
    },
    {
      icon: GitPullRequest,
      title: "GitHub Integration",
      description:
        "Create repos, open issues, and push branches directly. Your generated project lives where your team already works.",
    },
    {
      icon: Rocket,
      title: "Real Project Scaffolding",
      description:
        "Not boilerplate — actual working code. Routes, components, database schemas, and configs generated from your spec.",
    },
    {
      icon: Layers,
      title: "Spec Versioning",
      description:
        "Track how your spec evolves. Every generation is linked to a spec version so you can diff, review, and iterate.",
    },
    {
      icon: Code2,
      title: "Multi-Framework Support",
      description:
        "React, Next.js, Vue, Svelte, Python, Go — specify your stack and the generator respects it.",
    },
    {
      icon: Zap,
      title: "Iterative Refinement",
      description:
        "Generated something wrong? Refine the spec, regenerate, and compare. Converge on exactly what you need.",
    },
  ];

  return (
    <section className="relative py-32 border-t border-zinc-800/50">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Built for velocity
          </h2>
          <p className="mt-4 text-lg text-zinc-400 max-w-xl mx-auto">
            Everything you need to go from idea to GitHub repo — without the
            busywork.
          </p>
        </motion.div>

        <motion.div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          variants={stagger}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: "-100px" }}
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 transition-all hover:border-zinc-700 hover:bg-zinc-900/60"
              variants={fadeUp}
            >
              <f.icon className="mb-3 size-5 text-violet-400" />
              <h3 className="font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                {f.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function Comparison() {
  const comparisons = [
    {
      aspect: "Interface",
      before: "CLI + text files",
      after: "Visual web dashboard",
    },
    {
      aspect: "Spec → Code",
      before: "Manual agent commands",
      after: "Automated AI pipeline",
    },
    {
      aspect: "GitHub Push",
      before: "Copy-paste git commands",
      after: "One-click repo creation",
    },
    {
      aspect: "Iteration",
      before: "Re-run commands manually",
      after: "Refine spec, auto-regenerate",
    },
    {
      aspect: "Tracking",
      before: "Local files only",
      after: "Versioned spec history",
    },
  ];

  return (
    <section className="relative py-32 border-t border-zinc-800/50">
      <div className="mx-auto max-w-3xl px-6">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Why SpecForge
          </h2>
          <p className="mt-4 text-lg text-zinc-400">
            Traditional spec tools are powerful — but they leave the hard parts
            to you.
          </p>
        </motion.div>

        <motion.div
          className="overflow-hidden rounded-2xl border border-zinc-800"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <div className="grid grid-cols-3 bg-zinc-900 border-b border-zinc-800 px-6 py-3">
            <div className="text-sm font-medium text-zinc-500">Aspect</div>
            <div className="text-sm font-medium text-zinc-500">
              CLI-only tools
            </div>
            <div className="text-sm font-medium text-violet-400">
              SpecForge
            </div>
          </div>
          {comparisons.map((row, i) => (
            <div
              key={row.aspect}
              className={`grid grid-cols-3 px-6 py-4 ${
                i < comparisons.length - 1 ? "border-b border-zinc-800/50" : ""
              }`}
            >
              <div className="text-sm text-zinc-300 font-medium">
                {row.aspect}
              </div>
              <div className="text-sm text-zinc-500">{row.before}</div>
              <div className="text-sm text-zinc-200 flex items-center gap-2">
                <Check className="size-3.5 text-violet-400 shrink-0" />
                {row.after}
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function CTA() {
  const navigate = useNavigate();
  return (
    <section className="relative py-32">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          <div className="absolute inset-0 mx-auto max-w-xl bg-gradient-to-b from-violet-600/10 to-transparent blur-3xl" />
          <h2 className="relative text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Ready to forge your next project?
          </h2>
          <p className="relative mt-4 text-lg text-zinc-400">
            Stop writing boilerplate. Start writing specs.
          </p>
          <div className="relative mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500 border-0 px-10 h-13 text-base"
              onClick={() => navigate("/auth?returnTo=/dashboard")}
            >
              Get Started Free
              <ArrowRight className="ml-2 size-4" />
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-zinc-800/50 py-12">
      <div className="mx-auto max-w-6xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-indigo-600">
            <Sparkles className="size-3 text-white" />
          </div>
          <span className="text-sm font-semibold text-zinc-400">
            SpecForge
          </span>
        </div>
        <p className="text-sm text-zinc-600">
          Spec-Driven Development, reimagined for the web.
        </p>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-black">
      <Navbar />
      <Hero />
      <HowItWorks />
      <Features />
      <Comparison />
      <CTA />
      <Footer />
    </div>
  );
}
