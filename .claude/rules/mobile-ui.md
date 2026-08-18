---
globs: "app/**/*.tsx,src/components/**/*.tsx,src/design/**/*"
---

# Mobile UI Rules

- Use tokens from `src/design/tokens.ts` for colors, typography, and spacing.
- Use Inter for body text, Space Grotesk for brand/display text, and
  JetBrains Mono for prices and identifiers.
- Support dark mode through dynamic color tokens.
- Touch targets must be at least 44×44 points.
- Maintain at least 4.5:1 text contrast.
- Add `accessibilityLabel` to interactive `Pressable` elements.
- Add `accessibilityRole` to icon-only controls.
- Respect `useReducedMotion()`.
- Every list screen must represent loading, empty, error, and populated states.
- Show transient errors as toasts, form errors inline, and critical errors as
  recoverable full-screen states.
- Multi-step flows use stack navigation. Use modals only for confirmations,
  sheets, and alerts.
- Do not combine customer and provider actions in one persona-specific screen.

Routes and route parameters must use the types in `src/types/navigation.ts`.
