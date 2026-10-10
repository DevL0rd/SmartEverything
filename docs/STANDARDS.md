# Standards

How we work. The code is the documentation; this file holds only the rules.

**Always understand before changing.** Read the code you are about to change, and the code around it, until you know
why it is the way it is. Never edit what you have not read.

## Organisation

- **Where code lives**
  - `packages/domain`: the shared contract. One file per area (`devices.ts`, `ai-chats.ts`…) with its Zod schemas,
    types and pure helpers; endpoints in `api/endpoints-<area>.ts`. The hub, the app and MCP all import from here.
  - `apps/hub/src/<area>/`: server logic per area (`assistant`, `reach`, `plugins`, `cameras`…). Storage only in
    `store/repositories` with numbered `store/migrations`. HTTP handlers stay thin and call the area's service.
  - `apps/app/app/`: Expo Router routes. Composition only: a route file renders one screen from a feature.
  - `apps/app/src/features/<feature>/`: one folder per product area, split into `data/` (queries and actions),
    `model/` (pure logic), `components/`, `screens/`, plus `routes.ts`, `settings.ts` and `index.ts` (the public
    surface). Features import each other only through `index.ts`.
  - `apps/app/src/components`: the shared kit (rows, sheets, buttons, cards, widget frame). Anything used by two
    features belongs here or in the domain, never copied.
  - `src/app-shell` (navigation), `src/settings` (settings tree), `src/search` (global search), `src/store` (live state).
- **One place for each thing.** One definition per concept, one place to configure each setting, one component per UI
  pattern. Extend through registries (providers, device drivers, plugins, tools, widgets, routes, settings) so new
  things are new entries or files, not edits scattered across the code.
- **Settings live where they act**: a page's settings are a sub-page of that page, a device's settings a sub-page of that
  device. Global Settings holds only app-wide things. Repeating a control where it's handy is fine; two places that
  configure the same thing differently is not. A ⋮ menu holds only that page's actions.

## Build general mechanisms, not special cases

- **Read a lot of code before writing any.** The more existing code you read first, the better the new code fits.
  Before starting, read: the features most similar to yours end to end (domain contract, hub area, app feature), the
  shared kit and registries you will touch, and how neighbouring code names, structures, validates, logs and tests
  things. Then extend the existing mechanism and match its patterns; new code should look like it was always there.
- **Solve the general case once, at the lowest shared layer.** If two features need the same kind of behaviour, there is
  one mechanism for both. Example: every data change (device state, health record, setting, event) flows through one
  change stream, and every trigger, automation and AI wake-up subscribes to it the same way. There is never separate
  trigger code per data type.
- **Special-casing is a smell.** An `if (kind === 'x')` branch in shared code means the mechanism is missing a
  parameter or a registry entry. Add that instead, so the next thing of the same kind needs no new code.
- **Prefer one capable primitive over many narrow ones**: one `set_device` with a target and changes over a tool per
  setting, one widget frame over a card per device, as long as no capability is lost.

## Clean code

- Names say what something is or does, in the domain's own words. No `utils`, `helpers`, `misc`, `data2`, `newX`.
- Small units: one job per function and per file. Functions ≤50 lines, complexity ≤10, files ≤400 lines.
- Pure logic separated from I/O and from UI. Components render; hooks and `data/` fetch; `model/` decides.
- Early returns over nesting. No magic numbers or colours: named constants and design tokens.
- No code comments. If something needs explaining, rename or restructure it.
- Delete what you replace: no dead code, unused exports, flags or old components left behind.

## Code rules

- Strict TypeScript (all flags in `tsconfig.base.json`). Forbidden: `any`, `as` (except `as const`), `!`, `@ts-ignore`,
  `@ts-expect-error`, `object`/`Function`/`{}` as types. Explicit return types, `readonly` by default.
- Model state as discriminated unions; exhaustive switches; branded ids.
- Parse everything entering the process with Zod at the boundary; infer types from schemas.
- No silent fallbacks: `??`, `||`, `?.` and defaults only where the value is genuinely optional. Fail loudly, naming what
  failed, what was expected and what was received. Errors are named classes with structured fields; never swallowed.
- Event-driven, no polling (only documented exceptions). Libraries over custom implementations.
- New contract fields are optional or defaulted, and readers ignore fields they do not know (writers stay strict), so an
  older app keeps working against a newer server and a rollback of either side never breaks the other.

## MCP and search coverage

- **MCP**: everything the app can read or change, an AI can too, through the same hub handler. Each capability has an
  MCP tool with an accurate one-line description, correct read/write/destructive marking, and confirmation where the app
  asks for one. Only access-granting steps, phone-only protocols and live media may be human-only, each with a reason.
- **Search**: every page, sub-page, tab, in-page action, setting row and every device control and setting is in global
  search, nested under the page, section or device where it appears, with keywords and synonyms for the words people
  use.

## Logging

One logger (`@smarteverything/logging`), no `console`. Scope `<runtime>.<area>` (runtime: app, edge, db, tool, hub,
desktop; area lowercase-hyphen), event `noun.verb`, values in the payload. Log once, at the boundary that handles it.
Never log secrets, tokens, codes, emails, phone numbers or addresses (redaction is central, in `redaction.ts`).

## Tests

Deterministic, isolated, behavioural, named as a claim, falsifiable. Shared packages at 100% coverage and mutation score;
thresholds only move up. Every external package has a dependency contract test; versions are pinned exactly. Never skip,
weaken or delete a test to pass a build; never mock the thing under test.

## Working on a change

1. Understand the code. 2. Plan the change. 3. Make the narrowest change, with its tests. 4. Run the gates that cover it
   (`pnpm run validate` runs them all). 5. Look at the result: run the app and view every screen and state you touched,
   at phone and desktop sizes, light and dark, with empty, many and long content. 6. Report honestly, with real output.

## Review

A change is reviewed for correctness, cleanliness and organisation (the rules above) and design (spacing, hierarchy,
consistency, copy, every state). Review by looking at the running result, not only the diff. Feedback is one complete
list, not a few items at a time.
