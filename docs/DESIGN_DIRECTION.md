# HinkoK OS design direction

The seven supplied screenshots are the visual source of truth for the product
UI. Their original content is preserved in `docs/design-references`.

## Visual language

- Nearly black, warm brown application background with a restrained amber
  radial glow.
- Thin low-contrast borders, subtle inset highlights and compact panel grids.
- Warm orange is reserved for active navigation, primary controls, progress
  and selected states.
- Off-white primary text, muted clay secondary text and occasional soft green
  for positive health or completion signals.
- Editorial sans-serif display headings paired with small uppercase
  monospaced labels, indexes and metadata.
- Dense desktop information layout that remains calm through strict alignment,
  generous outer margins and consistent panel spacing.
- Rounded corners are small and functional rather than soft or playful.

## Product surfaces represented

1. Home: operator card, session capture, daily tasks, habits, goals and calendar.
2. CRM: time-horizon Kanban with filters, priority, categories and smart search.
3. Brain: sphere navigation, RAG question input, briefings, tasks and notes.
4. Journal: mood, 30-day history, sleep correlation, prompts and archive.
5. Health: metric summary, weekly sleep and activity, heart rate and nutrition.

## Implementation requirements

- Preserve the information hierarchy and atmosphere, not the photographed
  browser chrome, desktop dock or video-presenter overlay.
- Build reusable panel, metric, chip, control, chart and navigation primitives.
- Support desktop, tablet and mobile without hiding essential actions.
- Maintain keyboard focus visibility, semantic landmarks and accessible color
  contrast while retaining the subdued visual character.
- Use motion sparingly for state transitions and live feedback only.
