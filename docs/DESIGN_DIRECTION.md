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

## Design tokens

All colors and radii that repeat across more than one component live as CSS
custom properties in `src/app/globals.css` `:root`. New styles must reference
a token; a raw hex value in a module `*.css` file is a regression unless it
is a genuinely one-off tint used nowhere else.

| Token | Value | Used for |
|---|---|---|
| `--background`, `--background-deep` | `#160a06`, `#0d0705` | App background gradient stops (combined with the `body` radial/linear gradient in `globals.css`) |
| `--orange`, `--orange-bright` | `#ef792f`, `#ff9b50` | Primary accent: active nav, focus rings, headline italics, pill button gradients |
| `--green` / `--danger` | `#67d99b` / `#ff8b73` | Positive / negative signal (health deltas, topbar ticker arrows) |
| `--radius-card` | `7px` | Standard panel/card corner radius |
| `--radius-pill` | `999px` | Fully-rounded buttons, chips and capsule controls |
| `--mood-rad` … `--mood-awful` | 5 steps, `#789f70` → `#bd744e` | Journal mood picker (rad/good/meh/bad/awful) |
| `--mood-bar-good` / `--mood-bar-middle` / `--mood-bar-low` | `#a7bf59` / `#dbb551` / `#e17846` | Journal 30-day mood bar chart bands |
| `--sleep-bar-from/-to`, `--sleep-bar-worst-from/-to` | see `globals.css` | Journal mood × sleep correlation bar gradients |
| `--priority-hot` / `--priority-warm` | `#ef7140` / `#d99a55` | CRM task card left accent bar |
| `--priority-hot-text` / `--priority-warm-text` / `--priority-cold-text` | see `globals.css` | CRM priority chip text/border color (cold uses the neutral default, no distinct accent bar — unchanged from the reference) |

Micro-labels (`// ask the os`, `AI · SUMMARY`, section eyebrows) consistently
use `var(--muted)` or `var(--orange)` with `font-family: ui-monospace…` and a
`letter-spacing` between `0.08em` and `0.2em` depending on size; this is a
shared pattern rather than a single token because the exact tracking value
scales with font size across panels.

The topbar ticker (`.topbar-ticker`, see `src/components/ui/topbar-ticker.tsx`)
only shows BTC, sourced live from CoinGecko's public no-key endpoint. NDX and
XAU are intentionally omitted: no free, keyless data source exists for a
Nasdaq-100 index level or a gold spot price, and inventing numbers for them
would violate the project's "never fabricate data" principle (already
applied to Health). Add a paid provider key and extend
`src/lib/market/ticker.ts` if those are needed later.
