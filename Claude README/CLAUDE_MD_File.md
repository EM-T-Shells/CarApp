# The `CLAUDE.md` File — Deep Dive

---

## What It Actually Is

`CLAUDE.md` is Claude Code's **persistent memory**. Every time you start a session, Claude automatically reads this file before anything else — it's essentially the system prompt for your entire project. Think of it as the onboarding document you'd give a new RA who has zero context about your work. Except this RA reads it perfectly every single time and never forgets it within a session.

Without it, every session starts blind. With it, Claude walks in already knowing your stack, your conventions, your constraints, and your preferences.

---

## Where It Lives & How It Loads

- **Project root** `CLAUDE.md` — loaded for every session in that project
- **Subdirectory** `CLAUDE.md` — loaded only when Claude is working inside that subfolder; useful for monorepos or projects with distinct modules (e.g., `/frontend/CLAUDE.md` vs `/backend/CLAUDE.md`)
- **Global** `~/.claude/CLAUDE.md` — loaded for *every* Claude Code session on your machine regardless of project; good for personal preferences and universal rules

### Priority Order
```
Global ~/.claude/CLAUDE.md
    +
Project root CLAUDE.md
    +
Subdirectory CLAUDE.md
= Everything Claude knows before you type a word
```

---

## What to Put In It

### 1. Project Identity (brief)
```markdown
# Project: [Name]
## Purpose
One or two sentences on what this app/research project does.
The problem it solves. The domain it lives in.
```
This anchors every decision Claude makes. A data pipeline for healthcare reads differently than a consumer web app.

---

### 2. Stack & Environment
```markdown
## Stack
- Language: Python 3.11
- Framework: FastAPI
- Database: PostgreSQL via SQLAlchemy ORM
- Auth: JWT (python-jose)
- Testing: pytest
- Package manager: poetry

## Environment
- Run server: `poetry run uvicorn main:app --reload`
- Run tests: `poetry run pytest`
- Lint: `poetry run ruff check .`
```
Without this, Claude may guess wrong — using `npm` when you use `yarn`, or writing tests in `unittest` when you use `pytest`.

---

### 3. Explicit Conventions
```markdown
## Conventions
### Do
- Use repository pattern for all DB access
- All services return typed dataclasses, never raw dicts
- Snake_case for variables, PascalCase for classes
- Every function gets a docstring

### Never Do
- No `any` type in TypeScript
- Never write raw SQL — always use ORM
- No business logic in controllers
- Never commit .env files
```
The **"Never Do"** section is just as important as the "Do" section — arguably more so. Claude is very good at following explicit prohibitions.

---

### 4. Folder Structure
```markdown
## Folder Structure
src/
  models/        ← Pydantic schemas and DB models only
  services/      ← All business logic lives here
  repositories/  ← All DB queries live here
  routers/       ← HTTP route handlers, thin layer only
  utils/         ← Pure stateless helpers
  config/        ← Settings, env vars, constants
tests/           ← Mirrors src/ structure exactly
```
This prevents Claude from deciding on its own where new files belong.

---

### 5. Key Business Logic & Constraints
```markdown
## Business Logic Notes
- Users can belong to multiple orgs; always filter queries by org_id
- Payments are processed via Stripe only — never store card data locally
- All timestamps stored as UTC, converted to user timezone at display layer
```
This is the section most people skip and then wonder why Claude writes code that subtly breaks their domain rules.

---

### 6. What Claude Should Always Do
```markdown
## Claude Behavior Rules
- Before writing code, briefly state your approach and ask if it's correct
- When modifying existing code, only touch what's necessary
- After completing a task, summarize what changed and why
- If something is unclear, ask rather than assume
- Always run the linter after making changes
```

---

## Optimization Tips

### ✅ Be Declarative, Not Conversational
```markdown
# ❌ Weak
Please try to use the repository pattern when possible.

# ✅ Strong
ALL database access must go through a repository class in src/repositories/.
No exceptions. Controllers and services never call the DB directly.
```
Claude responds much better to firm declarative rules than soft suggestions.

---

### ✅ Use Negative Examples
Telling Claude what *not* to do is often more token-efficient and precise than describing what to do:
```markdown
## Never Do
- Never use `os.system()` — use `subprocess` with explicit args
- Never return HTTP 200 with an error message in the body
- Never write a function longer than 50 lines without breaking it up
```

---

### ✅ Keep It Scannable
Claude reads `CLAUDE.md` like a document, not a conversation. Use headers, short bullets, and code blocks. Avoid paragraphs of prose — they dilute signal.

---

### ✅ Treat It as a Living Document
After every significant session, run:
```
"Update CLAUDE.md to reflect any new conventions or decisions we made today."
```
It should evolve with the project. An outdated `CLAUDE.md` is worse than a sparse one because it actively misleads Claude.

---

### ✅ Version Control It
Commit `CLAUDE.md` to git. When a teammate pulls your repo, Claude immediately inherits all your project knowledge. It's free onboarding for both humans and AI.

---

### ✅ Don't Bloat It
Counterintuitively, a `CLAUDE.md` that is too long hurts performance — it consumes context budget and dilutes the most important rules. Aim for **under 200 lines**. If it's getting long, ask yourself: *is this a rule, or is it documentation that belongs in a separate file Claude can read on demand?*

---

## A Quick Quality Check

Before each sprint or major feature, ask Claude:
```
"Read CLAUDE.md and tell me if anything seems outdated, 
contradictory, or missing given what we're about to build."
```
This turns Claude into a collaborator on maintaining the file itself — and often surfaces gaps you didn't notice.

---

