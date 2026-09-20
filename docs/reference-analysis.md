# Reference Analysis

Six repositories were studied as design input. This document records what we
took, what we deliberately did not take, and the attribution obligations that
follow. Steward's architecture is independently coherent: nothing here is
copied code, and no Claude-specific concept is part of the core domain model.

| Repository | License | Studied for |
|---|---|---|
| [obra/superpowers](https://github.com/obra/superpowers) | MIT (at time of analysis) | Skill packaging, progressive disclosure, workflow enforcement |
| [garrytan/gstack](https://github.com/garrytan/gstack) | Not audited — do not copy | Multi-agent git workflow ideas |
| [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) | Not audited — do not copy | Agent-role decomposition |
| [affaan-m/ecc](https://github.com/affaan-m/ecc) | Not audited — do not copy | Command/checklist organization |
| [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling) | BSD-3-Clause | Install/uninstall lifecycle, detection UX |
| [latent-spaces/brag](https://github.com/latent-spaces/brag) | Not audited — do not copy | Evidence/brag-document framing |

> Licenses marked "not audited" were not verified at authoring time. Until
> someone audits them, treat those repos as **idea sources only** — no text,
> code, or structure may be transplanted from them. This is a standing task
> before any release that claims derivative-work cleanliness.

---

## obra/superpowers

**What it is.** A skill library for Claude Code: packaged skills (markdown
with frontmatter), installed into `.claude/`, with a progressive-disclosure
pattern where a short description stands resident and the body loads on
demand.

**What inspires us**
- The skill-as-file unit with frontmatter metadata — we adopted a stricter,
  zod-validated version (`steward.skill.v1`).
- Progressive disclosure as a context-economy strategy. Our adapters emit
  thin pointer artifacts (~1 line of standing context per skill) that load
  the canonical body from `.vibe/skills/` on demand.
- Workflow enforcement through checklists rather than model goodwill.

**What we deliberately do NOT copy**
- Any Claude-specific packaging as the core model. Superpowers is coupled to
  `.claude/`; our core domain model is harness-agnostic and Claude is just
  one adapter.
- Its installation approach of scattering files without a manifest. We keep
  a hash-tracked manifest so uninstall/repair/update are exact.

**Limitations we improve on**
- No vendor neutrality; no evidence ledger; no notion of risk classes or
  autonomy modes; skills are prose, not schema-validated artifacts.

**Attribution.** MIT-licensed at analysis time; ideas only, no code copied.
Credit superpowers in docs as an inspiration for skill packaging.

---

## garrytan/gstack

**Status: ideas only (license not audited).**

**What inspires us** (concept level)
- Treating agent work as a stack of ordered, reviewable increments rather
  than one giant generation.

**What we do NOT take**
- Any git-workflow opinions or tooling specifics. Steward is deliberately
  tool-agnostic: it records evidence, it does not impose a branching model.

**Limitations we improve on**
- Workflow structure without machine-checkable completion criteria. Every
  Steward task and phase carries verify commands that must actually run.

---

## msitarzewski/agency-agents

**Status: ideas only (license not audited).**

**What inspires us** (concept level)
- Role decomposition (spec-writer, implementer, reviewer, QA…) as separate
  concerns rather than one mega-prompt.

**What we do NOT take**
- Fixed persona definitions. Steward models *skills* (processes with gates),
  not personas; the same agent can execute any skill, which keeps the
  system portable across harnesses that have no subagent concept.

**Limitations we improve on**
- Personas without schemas, versioning, or install targeting. Our skills are
  validated, semver'd, and compiled per harness by adapters.

---

## affaan-m/ecc

**Status: ideas only (license not audited).**

**What inspires us** (concept level)
- Large curated command/checklist collections organized by engineering
  discipline (security, QA, review…).

**What we do NOT take**
- The "collection of prompts" shape. Steward is a *harness*: schema,
  brain, ledger, installer, adapters. A prompt list is content; Steward is
  the operating system that installs and enforces content.

**Limitations we improve on**
- No install/update lifecycle, no drift detection, no evidence trail.

---

## D4Vinci/Scrapling

**License: BSD-3-Clause.**

**What inspires us**
- The polished CLI lifecycle: doctor-style health checks, clean update and
  uninstall paths, respectful detection of the user's environment. Steward's
  `doctor`, `status`, `repair`, and foreign-file protection follow this UX
  philosophy.

**What we do NOT copy**
- Any code. Domains do not overlap; we borrowed only the lifecycle UX bar.

**Attribution.** BSD-3 requires preserving license notices if we ever reuse
code — we do not, so no obligation beyond this acknowledgment.

---

## latent-spaces/brag

**Status: ideas only (license not audited).**

**What inspires us** (concept level)
- The "brag document" idea: maintain a running record of verified
  accomplishments rather than vibes. This maps to Steward's evidence ledger
  and evidence files.

**What we do NOT take**
- Any resume-oriented framing. Our evidence exists to gate completion
  claims, not to market them.

**Limitations we improve on**
- Free-form documents without tamper-evidence. Our ledger is hash-chained
  and `verify()`-able.

---

## Synthesis: what Steward is instead

None of these projects combines: **(1)** a vendor-neutral skill schema,
**(2)** a project brain for durable truth, **(3)** a hash-chained evidence
ledger, **(4)** a manifest-driven installer with foreign-file protection,
**(5)** per-harness adapters compiled from one canonical source, and
**(6)** risk-classified gates including a hard human-approval boundary for
irreversible actions. Steward's design takes inspiration where noted and is
otherwise original.
