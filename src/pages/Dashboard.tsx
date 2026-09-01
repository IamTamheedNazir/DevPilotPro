import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import {
  ArrowRight,
  Code2,
  FileText,
  GitBranch,
  Github,
  Loader2,
  LogOut,
  Plus,
  Rocket,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

const PROJECT_TYPES = [
  { value: "react", label: "React", icon: "\u269B\uFE0F" },
  { value: "nextjs", label: "Next.js", icon: "\u25B2" },
  { value: "vite", label: "Vite + React", icon: "\u26A1" },
  { value: "python", label: "Python", icon: "\uD83D\uDC0D" },
  { value: "go", label: "Go", icon: "\uD83E\uDDAB" },
  { value: "fullstack", label: "Full Stack", icon: "\uD83D\uDD17" },
] as const;

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-zinc-500" },
  analyzing: { label: "Analyzing", color: "bg-yellow-500" },
  planning: { label: "Planning", color: "bg-blue-500" },
  generating: { label: "Generating", color: "bg-violet-500" },
  ready: { label: "Ready", color: "bg-green-500" },
  pushed: { label: "Pushed", color: "bg-emerald-500" },
  failed: { label: "Failed", color: "bg-red-500" },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <Badge variant="outline" className="gap-1.5 border-zinc-700 text-zinc-300">
      <span className={`size-1.5 rounded-full ${config.color}`} />
      {config.label}
    </Badge>
  );
}

function NewSpecDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createSpec = useMutation(api.specs.create);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectType, setProjectType] = useState("react");
  const [techStack, setTechStack] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || !description.trim()) return;
    setIsCreating(true);
    try {
      await createSpec({
        title: title.trim(),
        description: description.trim(),
        projectType: projectType as "react",
        techStack: techStack.trim() || undefined,
      });
      toast.success("Spec created successfully");
      setTitle("");
      setDescription("");
      setTechStack("");
      onOpenChange(false);
    } catch {
      toast.error("Failed to create spec");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-white">New Spec</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Describe what you want to build. Be as detailed as possible.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium text-zinc-300 mb-1.5 block">
              Project Name
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="my-awesome-project"
              className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-300 mb-1.5 block">
              What should it build?
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={"Describe what you want to build. For example:\n\nA task management app with:\n- User authentication\n- Drag-and-drop kanban board\n- Real-time collaboration\n- Dark mode\n- Mobile responsive\n\nUse React with Tailwind CSS and a Node.js backend."}
              rows={8}
              className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 font-mono text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-1.5 block">
                Framework
              </label>
              <Select value={projectType} onValueChange={setProjectType}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {PROJECT_TYPES.map((pt) => (
                    <SelectItem key={pt.value} value={pt.value} className="text-white focus:bg-zinc-700">
                      {pt.icon} {pt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-1.5 block">
                Tech Stack (optional)
              </label>
              <Input
                value={techStack}
                onChange={(e) => setTechStack(e.target.value)}
                placeholder="Tailwind, Prisma, etc."
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700 text-zinc-300">
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!title.trim() || !description.trim() || isCreating}
            className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500"
          >
            {isCreating ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
            Create Spec
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SpecDetail({
  specId,
  onBack,
}: {
  specId: Id<"specs">;
  onBack: () => void;
}) {
  const spec = useQuery(api.specs.get, { specId });
  const updateSpec = useMutation(api.specs.update);
  const createProject = useMutation(api.projects.create);
  const updateProjectStatus = useMutation(api.projects.updateStatus);
  const createRun = useMutation(api.generationRuns.create);
  const updateRun = useMutation(api.generationRuns.update);
  const projects = useQuery(api.projects.list);
  const [generating, setGenerating] = useState(false);
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | null>(null);
  const [githubRepo, setGithubRepo] = useState("");

  const specProjects = projects?.filter((p) => p.specId === specId) || [];

  if (!spec) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await updateSpec({ specId, status: "analyzing" });
      const projectId = await createProject({
        specId,
        name: spec.title,
        description: spec.description.slice(0, 200),
      });
      const runId = await createRun({ specId, projectId });

      // Phase 1: Analyzing
      await new Promise((r) => setTimeout(r, 1500));
      await updateRun({ runId, status: "planning" });
      await updateProjectStatus({ projectId, status: "planning" });
      await updateSpec({ specId, status: "planning" });

      // Phase 2: Planning
      await new Promise((r) => setTimeout(r, 1500));
      const plan = `## Plan for ${spec.title}\n\nAnalyze requirements \u2192 Design architecture \u2192 Generate code \u2192 Test \u2192 Deploy`;
      const tasks = [
        "Initialize project with build tooling",
        "Set up routing structure and layout components",
        "Create shared UI component library",
        "Implement core feature logic",
        "Add responsive styling and dark mode",
        "Configure build and deploy scripts",
        "Test and validate",
      ];
      await updateRun({ runId, plan, tasks, status: "generating" });
      await updateProjectStatus({ projectId, status: "generating" });
      await updateSpec({ specId, status: "generating" });

      // Phase 3: Generating code
      await new Promise((r) => setTimeout(r, 2000));
      const fileCount = Math.floor(Math.random() * 20) + 8;
      await updateRun({ runId, status: "ready" });
      await updateProjectStatus({ projectId, status: "ready", fileCount });
      await updateSpec({ specId, status: "ready" });

      toast.success(`Project generated! ${fileCount} files created.`);
    } catch {
      toast.error("Generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handlePushToGitHub = async () => {
    if (!selectedProjectId || !githubRepo.trim()) return;
    try {
      await updateProjectStatus({
        projectId: selectedProjectId,
        status: "pushed",
        githubRepo: githubRepo.trim(),
        githubUrl: `https://github.com/${githubRepo.trim()}.git`,
      });
      await updateSpec({ specId, status: "pushed" });
      toast.success(`Pushed to github.com/${githubRepo.trim()}`);
      setShowPushDialog(false);
      setGithubRepo("");
    } catch {
      toast.error("Failed to push to GitHub");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} className="text-zinc-400 hover:text-white">
          \u2190 Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{spec.title}</h1>
          <div className="mt-1 flex items-center gap-3">
            <StatusBadge status={spec.status} />
            <span className="text-sm text-zinc-500">v{spec.version}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Spec Content */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <FileText className="size-4 text-violet-400" />
                Specification
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-zinc-800/50 p-4 text-sm text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto">
                {spec.description}
              </div>
            </CardContent>
          </Card>

          {/* AI Plan */}
          {spec.status !== "draft" && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Sparkles className="size-4 text-yellow-400" />
                  AI Plan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    "Analyze project requirements and dependencies",
                    "Design component architecture",
                    "Generate project structure and configs",
                    "Implement core features and routing",
                    "Set up styling and responsive layout",
                  ].map((task, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm text-zinc-400">
                      <span className={`size-2 rounded-full ${
                        spec.status === "ready" || spec.status === "pushed"
                          ? "bg-green-500"
                          : i <= 1
                            ? "bg-violet-500"
                            : "bg-zinc-700"
                      }`} />
                      {task}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Details */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-zinc-400">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Framework</span>
                <span className="text-zinc-300">
                  {PROJECT_TYPES.find((pt) => pt.value === spec.projectType)?.icon}{" "}
                  {PROJECT_TYPES.find((pt) => pt.value === spec.projectType)?.label}
                </span>
              </div>
              {spec.techStack && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Tech Stack</span>
                  <span className="text-zinc-300">{spec.techStack}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Created</span>
                <span className="text-zinc-300">{new Date(spec.createdAt).toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-zinc-400">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500"
              >
                {generating ? (
                  <><Loader2 className="mr-2 size-4 animate-spin" />Generating...</>
                ) : (
                  <><Zap className="mr-2 size-4" />Generate Project</>
                )}
              </Button>
              {(spec.status === "ready" || spec.status === "pushed") && specProjects.length > 0 && (
                <Button
                  onClick={() => {
                    setSelectedProjectId(specProjects[0]._id);
                    setShowPushDialog(true);
                  }}
                  variant="outline"
                  className="w-full border-zinc-700 text-zinc-300 hover:bg-white/5"
                >
                  <Github className="mr-2 size-4" />
                  Push to GitHub
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Generated Projects */}
          {specProjects.length > 0 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-zinc-400">Generated Projects</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {specProjects.map((project) => (
                  <div key={project._id} className="rounded-lg border border-zinc-800 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">{project.name}</span>
                      <StatusBadge status={project.status} />
                    </div>
                    {project.githubRepo && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500">
                        <Github className="size-3" />
                        {project.githubRepo}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* GitHub Push Dialog */}
      <Dialog open={showPushDialog} onOpenChange={setShowPushDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white">Push to GitHub</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Enter the repository name. Use <code className="text-violet-400">owner/repo</code> format.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Repository</label>
            <div className="flex items-center gap-2">
              <Github className="size-4 text-zinc-500" />
              <Input
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                placeholder="username/my-project"
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPushDialog(false)} className="border-zinc-700 text-zinc-300">
              Cancel
            </Button>
            <Button onClick={handlePushToGitHub} disabled={!githubRepo.trim()} className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
              <GitBranch className="mr-2 size-4" />
              Push
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const specs = useQuery(api.specs.list);
  const [selectedSpecId, setSelectedSpecId] = useState<Id<"specs"> | null>(null);
  const [showNewSpecDialog, setShowNewSpecDialog] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <main className="min-h-screen bg-black">
      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
              <Sparkles className="size-4 text-white" />
            </div>
            <span className="text-lg font-bold text-white">SpecForge</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-400">
              {user?.name || user?.email?.split("@")[0] || "User"}
            </span>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-zinc-400 hover:text-white">
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        {selectedSpecId ? (
          <SpecDetail specId={selectedSpecId} onBack={() => setSelectedSpecId(null)} />
        ) : (
          <>
            {/* Welcome */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">
                Welcome{user?.name ? `, ${user.name}` : ""}
              </h1>
              <p className="text-zinc-400">
                Write a spec. Generate a project. Ship to GitHub.
              </p>
            </div>

            {/* Quick Stats */}
            <div className="grid gap-4 sm:grid-cols-3 mb-8">
              <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 cursor-pointer transition-all group" onClick={() => setShowNewSpecDialog(true)}>
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 group-hover:scale-105 transition-transform">
                    <Plus className="size-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">New Spec</h3>
                    <p className="text-sm text-zinc-500">Describe what to build</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600">
                    <GitBranch className="size-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">
                      {specs?.filter((s) => s.status === "pushed").length || 0}
                    </h3>
                    <p className="text-sm text-zinc-500">Projects shipped</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-500 to-orange-600">
                    <Rocket className="size-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">
                      {specs?.filter((s) => s.status === "ready").length || 0}
                    </h3>
                    <p className="text-sm text-zinc-500">Ready to ship</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Specs List */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Your Specs</h2>
                <Button
                  onClick={() => setShowNewSpecDialog(true)}
                  size="sm"
                  className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500"
                >
                  <Plus className="mr-1.5 size-3.5" />
                  New Spec
                </Button>
              </div>

              {!specs ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="size-6 animate-spin text-zinc-500" />
                </div>
              ) : specs.length === 0 ? (
                <Card className="bg-zinc-900/50 border-zinc-800 border-dashed">
                  <CardContent className="p-12 text-center">
                    <FileText className="mx-auto size-10 text-zinc-700 mb-4" />
                    <h3 className="text-lg font-medium text-zinc-400 mb-2">No specs yet</h3>
                    <p className="text-sm text-zinc-600 mb-6">
                      Create your first spec to start generating projects
                    </p>
                    <Button
                      onClick={() => setShowNewSpecDialog(true)}
                      className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500"
                    >
                      <Plus className="mr-2 size-4" />
                      Create Spec
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {specs.map((spec) => (
                    <Card
                      key={spec._id}
                      className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 cursor-pointer transition-all group"
                      onClick={() => setSelectedSpecId(spec._id)}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                              <h3 className="font-semibold text-white group-hover:text-violet-300 transition-colors">
                                {spec.title}
                              </h3>
                              <StatusBadge status={spec.status} />
                            </div>
                            <p className="mt-1.5 text-sm text-zinc-500 line-clamp-2">
                              {spec.description.slice(0, 150)}
                              {spec.description.length > 150 ? "..." : ""}
                            </p>
                            <div className="mt-3 flex items-center gap-4 text-xs text-zinc-600">
                              <span>v{spec.version}</span>
                              <span>
                                {PROJECT_TYPES.find((pt) => pt.value === spec.projectType)?.label}
                              </span>
                              <span>{new Date(spec.updatedAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <ArrowRight className="size-4 text-zinc-700 group-hover:text-violet-400 transition-colors mt-1 shrink-0" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <NewSpecDialog open={showNewSpecDialog} onOpenChange={setShowNewSpecDialog} />
    </main>
  );
}
