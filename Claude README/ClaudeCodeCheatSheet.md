# Claude Code Cheat Sheet
### Planning & Development Reference

---

## 🗂️ PROJECT SETUP

| File | Purpose |
|---|---|
| `CLAUDE.md` | Claude's "system prompt" for your project. Lives at root. |
| `ARCHITECTURE.md` | Stack, folder structure, data models, design decisions. |
| `.claudeignore` | Exclude irrelevant files from context (like `.gitignore`). |

**Starter `CLAUDE.md` template:**
```markdown
# Project: [App Name]

## Stack
- Frontend: 
- Backend: 
- Database: 
- Auth: 

## Conventions
- Language/style rules (e.g., "No `any` in TypeScript")
- Naming conventions (e.g., camelCase vars, PascalCase components)
- Patterns to always use (e.g., repository pattern, service layer)
- Patterns to NEVER use

## File Structure
src/
  components/
  services/
  models/
  utils/

## Testing
- How to run tests
- Testing framework
- Coverage requirements

## Notes for Claude
- Key constraints or business logic to always respect
- External APIs or integrations to be aware of
```

---

## ✅ PLANNING PHASE

### Session 1 — Foundation
```
"Help me generate an ARCHITECTURE.md for a [type] app using [stack]. 
Include: folder structure, data models, API contracts, and key design decisions."
```
```
"Based on this ARCHITECTURE.md, generate a CLAUDE.md with our conventions, 
patterns to use, patterns to avoid, and how to run tests."
```

### Before Every Feature
```
"Before writing any code, outline the approach for [feature] 
given our ARCHITECTURE.md. List files to create/modify and why."
```

### Define Contracts First
```
"Define the TypeScript interfaces and API request/response shapes 
for [feature] before implementing anything."
```

---

## ⚡ TOKEN EFFICIENCY

### The Golden Rules
| Rule | Why It Matters |
|---|---|
| One goal per session | Prevents context bloat |
| Reference specific files | Reduces unnecessary reads |
| Use `.claudeignore` | Biggest single token saver |
| Modularize your code | Small files = focused context |
| Close and reopen sessions | Clears accumulated context |

### What to put in `.claudeignore`
```
node_modules/
dist/
build/
.next/
coverage/
*.log
*.lock
*.env
__pycache__/
.pytest_cache/
migrations/        # unless actively working on DB
fixtures/
*.test.ts          # unless in a testing session
```

### Prompt Scoping — Bad vs. Good
| ❌ Vague | ✅ Scoped |
|---|---|
| "Fix my app" | "In `src/auth/login.ts`, the JWT refresh fails when token is expired — fix only that function" |
| "Add user features" | "Add email validation to the `createUser` method in `src/services/UserService.ts`" |
| "Clean up the code" | "Refactor only the `handlePayment` function in `src/payments/processor.ts` for readability" |

---

## 🏗️ DEVELOPMENT PHASE

### Session Structure (One Feature = One Session)
```
1. Open session
2. State the goal clearly upfront
3. Reference specific files
4. Implement
5. Ask Claude to update ARCHITECTURE.md
6. Close session
```

### Useful Prompt Patterns

**Implement a feature:**
```
"In [file], implement [feature]. Follow the patterns in CLAUDE.md. 
Only modify this file unless absolutely necessary."
```

**Debug:**
```
"In [file], function [name] produces [wrong output] when given [input]. 
Reason through it step by step before changing anything."
```

**Refactor:**
```
"Refactor [function/file] for [goal — readability/performance/etc]. 
Do not change behavior. Explain what you changed and why."
```

**Write tests:**
```
"Write unit tests for [function] in [file] using [framework]. 
Cover happy path, edge cases, and error states."
```

**Review:**
```
"Review [file] for: security issues, edge cases, and alignment 
with our CLAUDE.md conventions. Do not rewrite — just report findings."
```

---

## 🧱 ARCHITECTURE BEST PRACTICES

### Folder Structure (Generic — Adapt to Your Stack)
```
src/
  models/          ← Data types, interfaces, schemas
  services/        ← Business logic (no DB or HTTP here)
  repositories/    ← All DB access lives here
  controllers/     ← HTTP handlers only, thin layer
  utils/           ← Pure, stateless helpers
  config/          ← Env vars, constants
  tests/           ← Mirror of src/ structure
```

### Design Principles That Help Claude
- **Single Responsibility** — One file, one job. Claude reasons better about small files.
- **Explicit over implicit** — Name things clearly. Claude reads names as context.
- **Interfaces first** — Define contracts before implementation.
- **Flat over nested** — Deep nesting confuses context. Keep hierarchies shallow.

---

## 🔄 KEEPING CONTEXT FRESH

### After Each Feature Session
```
"Update ARCHITECTURE.md to reflect what we just built. 
Add any new files, models, or patterns introduced."
```

### When Starting a New Session
```
"Read CLAUDE.md and ARCHITECTURE.md. Summarize your understanding 
of the project before we begin."
```

### When Claude Goes Off-Track
```
"Stop. Re-read CLAUDE.md. You violated [specific rule]. 
Redo [specific thing] following our conventions."
```

---

## 🚩 RED FLAGS TO WATCH FOR

| Symptom | Fix |
|---|---|
| Claude ignores your conventions | Re-reference `CLAUDE.md` explicitly |
| Responses getting slow/degraded | Start a new session |
| Claude modifying unrelated files | Be more explicit: "only modify X" |
| Hallucinating library APIs | Ask it to reason step by step, verify docs |
| Inconsistent patterns across files | Run a review session against `CLAUDE.md` |

---

## 💬 TEAM COLLABORATION TIPS

- **Commit `CLAUDE.md` and `ARCHITECTURE.md`** to version control — they're living docs.
- **One developer, one session.** Don't share live sessions; merge changes through git instead.
- **Update `CLAUDE.md` as a team** when conventions change — treat it like a decisions log.
- **Tag Claude sessions** in your PR descriptions so teammates know what was AI-assisted.

