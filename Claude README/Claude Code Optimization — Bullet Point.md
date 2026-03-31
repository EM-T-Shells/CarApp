# Claude Code Optimization — Bullet Point Summary
*Based on Paul Goldsmith-Pinkham's Setup Guide*

---

## 🧠 Mental Model: The Context Window

- Every message sends the **entire conversation history** as one big document — prompts, responses, files read, code output, tool calls, all of it
- Claude's context window is ~**200,000 tokens** (~¾ word per token) — fills faster than you'd expect
- **Performance degrades as context grows** — turn 30 is noticeably worse than turn 3
- When full, Claude auto-compacts (summarizes history) — but it may forget earlier decisions or constraints

---

## ⚡ Context Management Strategies

- **Compact intentionally** — type `/compact` before the window overflows; guide it with e.g. `/compact remember all the nonlinear programming work we just did`
- **Write state to files** — halfway through work, say: *"Write a summary of what we've done and what's left to `progress.md`"* — then start a fresh session that reads that file
- **Break work into focused sessions** — 5–10 turns with one clear objective (e.g., "this session: just get data cleaning working")
- **Don't keep critical info only in conversation** — files persist, context doesn't; have Claude write decisions to a README or plan file
- **Start fresh often** — after 20+ turns with heavy code output, open a new session

---

## ✅ Prompting Best Practices

- **Be specific** — not *"analyze this data"* but *"load employment.csv, compute monthly growth rates by sector, and plot a time series"*
- **Correct early** — if Claude goes the wrong direction, interrupt immediately; saves time vs. letting it run
- **Iterate naturally** — *"make the legend larger and move it top-left"* is a valid follow-up; no need to re-specify everything
- **Don't argue with the LLM** — if output is wrong, hit `ESC` to go back and reset context to prior state, then re-prompt
- **Trust but verify** — always check output against expectations, especially statistical methods and edge cases

---

## 🔒 Data & Security

- Files stay **local** — but file content read by Claude is sent to Anthropic as part of context
- **Keep sensitive data away from Claude** — IRB data, PII, HIPAA data, API keys, passwords
- Rough heuristic: *"If you wouldn't put it on Dropbox, don't put it in front of Claude"*

---

## 💰 Subscription Tiers

| Tier | Cost | Recommendation |
|---|---|---|
| Pro | $20/mo | Good starting point; includes Claude Code if you already pay for Claude chat |
| Max | $100/mo | Best value for regular use |
| Max 20x | $200/mo | Likely unnecessary for most |
| API (pay-per-use) | Variable | Subscriptions are better value for most |

---

## 🛠️ Recommended Terminal Setup

- **Ghostty** — fast, GPU-accelerated terminal; handles large code outputs without lag → `brew install ghostty`
- **Zellij** — split-pane terminal multiplexer; run Claude on left, watch file output on right → `brew install zellij`
  - Split pane: `Ctrl+p` then `d` | Navigate: `Alt+arrow`
- **Oh My Zsh** — better shell autocompletion, git branch in prompt, useful plugins (`git`, `z`, `virtualenv`)

---

## 🏗️ Workflow Loop

```
1. cd into project directory → type `claude`
2. Ask Claude to summarize project structure
3. State one clear objective for the session
4. Describe what you want in specific terms
5. Claude writes + executes → you review
6. Iterate with follow-ups
7. Write progress to a file before session ends
8. Start fresh session for next objective
```

---

## 🚦 Agentic Level Reference

| Level | What It Looks Like |
|---|---|
| 0–1 | ChatGPT in browser, copy-paste code, GitHub Copilot inline |
| 2 | Agentic IDE (e.g., Cursor) — edits files inside editor |
| **3** | **Claude Code — terminal, full local environment access** |
| 4 | Claude Code + MCPs (databases, APIs, external tools) |
| 5 | Autonomous container runs for 1–2 hours unattended |

