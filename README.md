<div align="center">

# SmartEverything

### One place for every device, camera and health signal in the home.

_One codebase. Android, web and desktop. Every gate on from the first commit._

</div>

---

SmartEverything brings Xiaomi, SmartThings and Tuya devices, Xiaomi cameras and Health Connect data
into a single application, and lets each of them drive the others.

## For AI agents

> [!IMPORTANT]
> **Read [docs/STANDARDS.md](docs/STANDARDS.md) in full before you do anything else.** It is the operating manual: the
> code rules, logging, tests, how to work on a change and how changes are reviewed. It overrides habit and preference.
> The code is the documentation; there are no other docs.

`.agents/skills/` holds installed agent skills (linked into `.claude/skills/`); read **`uniwind`** before adding or
debugging any styled component.

## Stack

| Layer      | Choice                                                                            |
| ---------- | --------------------------------------------------------------------------------- |
| App        | Expo 57 · Expo Router · React 19 with the **React Compiler**                      |
| Styling    | Uniwind · Tailwind 4                                                              |
| Server     | `apps/hub` on Node 24/26: embedded SQLite (`node:sqlite`), HTTP + WebSocket API   |
| Desktop    | Electron 44, which also runs the server as a per-user OS service                  |
| Validation | Zod 4, at every boundary                                                          |
| Logging    | `@smarteverything/logging`, one structured logger for every runtime               |
| Tests      | Vitest 4 · Stryker 10 · fast-check                                                |
| Language   | TypeScript 6 — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |

## Layout

```
.
├── apps/
│   ├── app/                    the one application: Android and the desktop window's content
│   │   ├── app/                Expo Router routes; composition only
│   │   ├── src/                app shell, features, store, kit
│   │   └── modules/            local Expo modules (Health Connect)
│   ├── desktop/                Electron window, installer and controller of the background service
│   └── hub/                    the server: SQLite store, API, devices, cameras, automations, MCP
├── packages/
│   ├── domain/                 the shared contract: capabilities, commands, automations, health, search
│   ├── logging/                the logger; no dependencies, runs in every runtime
│   ├── xiaomi/                 miIO, MIoT and Xiaomi cloud protocol logic
│   ├── tuya/                   Tuya cloud signing, data points, IR codes, messages
│   ├── smartthings/            SmartThings mapping, webhook signatures and subscriptions, Samsung TV helpers
│   └── ble/                    Bluetooth advert decoding (the Xiaomi S400 scale)
├── tooling/
│   ├── dependency-contracts/   one contract test per external package
│   ├── go2rtc/                 the pinned, patched go2rtc build for every platform
│   ├── guards/                 tests that prove no gate has been weakened
│   └── eslint/                 the repository's own lint rules
└── .github/workflows/          CI
```

## Commands

```bash
pnpm install
pnpm run build:go2rtc
pnpm --filter @smarteverything/desktop start
pnpm run validate
```

`validate` runs every gate that needs neither git history, a browser nor a device. The full list is in `package.json`.
