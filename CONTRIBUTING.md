# Contributing

## Branches

- `main`: production; never commit directly
- `dev`: integration
- `feature/<name>`: feature work
- `fix/<name>`: bug fixes

Do not commit, push, merge, switch branches, or delete branches unless the
user explicitly requests the operation.

## Commit Messages

Use:

`feat|fix|chore|refactor|test|docs(<scope>): <description>`

Do not include references to Claude or AI in commit messages.

## Pull Requests

Prefer review and merging through GitHub. Do not merge into `dev` or `main`
locally unless explicitly instructed.

## Task Scope

- State the intended approach before substantial implementation.
- Change only what the task requires.
- Do not perform unrelated refactoring.
- Ask when business behavior is ambiguous.
- Update `ARCHITECTURE.md` for new files, models, or architectural patterns.
- Update `Blueprint/reference.md` or the build checklist only when requested.