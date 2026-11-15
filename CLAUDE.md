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
> The Git handoff, production target and release process live in [docs/STANDARDS.md](docs/STANDARDS.md#git-handoff-and-releases).
> The code is the documentation; the other retained plan is [docs/IOS-READINESS.md](docs/IOS-READINESS.md), the iOS plan kept by the owner's order.

In the owner's checkout `AGENT-BRIEF.md` (git-ignored) holds the working process for every agent and `tmp/howto.md` the command cheat sheet.

### Work tracking

The queue and ideas live in this repository's GitHub issues, never in tracked files.

- One issue per item, with every detail the owner gave in its body: requirements, constraints, examples, reasons and decisions, under **Details**, **Status** and **Pointers**.
- Labels: `bug` or `enhancement`, `on-hold` for held work, `idea` for ideas that never start by themselves, and one `area:*` label.
- Queue order lives in the owner's git-ignored `STATE.md`, whose In Queue lists issue numbers (`#123 title`).
- New requests become new issues in the same turn. Progress and decisions are added to the issue body or as comments.
- Close an issue the moment it is done: once the change is verified in the code (or the owner says it is done), close it in the same turn with a one-line comment naming the evidence. Fixed but unreleased work is closed with a note that it ships with the next release. Open issues are only unfinished work. Testing by the owner or anyone else is never a step of an issue and never keeps it open: when the code is done, the issue closes.
- Commit messages that finish an issue name it (`Fixes #123`).
- This repository is public: issues, comments, commits and tracked files never carry private details (network addresses, host names, device, camera or account ids, home-revealing device names, people, health, money, schedule or location details, secrets). Those go in the git-ignored `tmp/issues/private-notes.md` under the issue number.

`.agents/skills/` holds installed agent skills (linked into `.claude/skills/`); read **`uniwind`** before adding or
debugging any styled component.

## Stack

| Layer      | Choice                                                                            |
| ---------- | --------------------------------------------------------------------------------- |
| App        | Expo 57 · Expo Router · React 19 with the **React Compiler**                      |
| Styling    | Uniwind · Tailwind 4                                                              |
| Hub        | Node.js 26 · embedded SQLite (`node:sqlite`) · HTTP + WebSocket API               |
| Desktop    | Electron 44 · Desktop app and per-user Computer service                           |
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
│   ├── desktop/                Electron window, installer and controller of the Computer service
│   └── hub/                    the server: SQLite store, API, devices, cameras, automations, MCP
├── packages/
│   ├── domain/                 the shared contract: capabilities, commands, automations, health, search
│   ├── logging/                the logger; no dependencies, runs in every runtime
│   ├── xiaomi/                 miIO, MIoT and Xiaomi cloud protocol logic
│   ├── tuya/                   Tuya Smart Life sign-in, data points, IR codes, messages
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

`validate` runs every gate that needs neither git history, a browser nor a device. The full list is in `package.json`. It runs before each stable-point push under the owner’s standing project authorization unless explicitly waived; while developing, run only the scoped checks of the files you touched.

## Install the standalone Hub on Linux

The Hub supports Linux x64 and arm64 with glibc 2.31 or newer and a systemd user session.
To build the installer from this checkout, use Node.js 26 and the Go version pinned in
`tooling/go2rtc/pin.json`. For the bundled runtime, verify the matching official Node.js 26
archive against the signed Node.js release checksums before unpacking it. Set `target` to
`linux-x64` or `linux-arm64`.

```sh
target=linux-x64
node_bundle=/absolute/path/to/unpacked/verified/node
out="$PWD/tmp/hub-installer"
pnpm install
pnpm run build:go2rtc
node --import tsx tooling/build-headless-hub.ts --target "$target" --out "$out/service"
node --import tsx tooling/release-headless.ts --target "$target" --service "$out/service" --node "$node_bundle" --out "$out"
```

For a fresh installation as the Hub user, no checkout, `node_modules` or build tool is needed:

1. Extract the resulting `smarteverything-hub-<version>-<target>.tar.gz` on the target machine.
2. From the extracted directory, run `./install.sh --repository <owner/name>` (add `--branch <branch>`
   when it is not `main`, and `--data <absolute folder>` to keep the Hub data elsewhere). The installer
   saves the GitHub repository as the Hub's update source, which is all the `github` build source
   needs, installs the Hub and its bundled Node runtime in `~/.local/opt/SmartEverything-Hub`, keeps
   Hub data in `~/.config/SmartEverything` and starts the `smarteverything.service` user unit. A failure
   rolls the whole installation back. Without `--repository` no update source is saved, and the
   `provided` source still works.

Only the opt-in `hub` build source needs a checkout and build tools. To enable it, clone this
repository into `~/Github/SmartEverything` with an upstream branch (`git branch --set-upstream-to`),
install its dependencies with the bundled Node runtime
(`PATH="<extracted directory>/node/bin:$PATH" npx --yes pnpm@11.3.0 install --frozen-lockfile`), run
`~/.local/opt/SmartEverything-Hub/node/bin/node --import tsx tooling/configure-update-source.ts --checkout ~/Github/SmartEverything`
(or pass `--update-source ~/Github/SmartEverything` to `install.sh` instead of `--repository`; the
repository is read from the checkout's remote) and provision the build tools without root:
`~/.local/opt/SmartEverything-Hub/node/bin/node --import tsx tooling/provision-build-host.ts --accept-android-sdk-licenses`.
It installs pinned zip and unzip, a JDK and the Android SDK under the Hub data folder and reports
anything still missing. Without `--accept-android-sdk-licenses` it stops and names the Android SDK
licences it would accept. If it reports `apps/app/google-services.json` missing, copy that file from
the development PC into the checkout.

To change the update source of an installed Hub without a checkout, edit `updateSource` in its
`service.json` to `{ "repository": "<owner/name>", "branch": "<branch>" }` and restart the Hub.

`--data` can point at a folder on another disk; the installer refuses a folder that holds another
data folder's marker. A small pointer file in
`~/.config/SmartEverything-Hub` (or `$XDG_CONFIG_HOME/SmartEverything-Hub`) records the chosen
folder. `SMARTEVERYTHING_HUB_HOME` names a different pointer folder for containers and custom
launches; unset it for the systemd install. The data folder can be moved later in Settings.
Run `loginctl enable-linger "$(id -un)"` to start the Hub at boot without signing in.

Nothing is built on the Hub by default. A release is built on a dev machine or by GitHub and delivered through
`update_control` with a build source:

- `provided`: on a dev machine, with the machine key made once by
  `node --import tsx tooling/provide-release.ts --init-key`, run
  `node --import tsx tooling/provide-release.ts <hub|app|ui|desktop> --notes "<notes>" --hub <hub url>`.
  It type checks, builds, signs and uploads the bundle and prints an upload ID. Then call
  `update_control` with the action, `source: "provided"` and `upload: "<upload ID>"`. Trust the machine's
  public key on the Hub once with `update_control` action `release_keys`, operation `trust`, role `machine`.
- `github`: `.github/workflows/release.yml` builds every artifact on GitHub, signs the bundles in the
  protected `release` environment with the `RELEASE_SIGNING_KEY` secret and attaches them to a GitHub
  release. Start it by pushing a `v*` tag (the tag message is the release notes) or by a manual dispatch.
  Then call `update_control` with `source: "github"` and `tag` (or the release's `commit`). The Hub
  downloads the assets from the repository of its update source and verifies them with the
  trusted `github` key. A public repository needs no token. For a private repository, store a
  token that can only read the repository's releases with `update_control` action `release_keys`,
  operation `set` and `token`, called from the owner's own MCP connection (never from an AI
  chat). The Hub keeps it encrypted in its secret store and never shows it again; operation `list`
  says whether one is stored (`githubTokenStored`) and `clear` deletes it.
- `hub`: an explicit opt-in, never part of a normal release. The Hub builds only when the artifact's source is
  set to `hub` (or the call passes `source: "hub"`) and the opt-in checkout and build host from the install
  section are set up. Otherwise the call is refused.

To set up `github` once, configure the `release` environment exactly: deployment branches and tags limited to `main` and `v*`, and a required reviewer (the owner). A manual dispatch from any other branch runs that branch's copy of the workflow, so without this restriction a modified copy could reach the signing key. The `sign-and-publish` job also refuses to run outside `main` and `v*` tags, and it does not restore the pnpm store cache, so build jobs cannot poison it. Then make an Ed25519 key without printing the private part, store it as the
`RELEASE_SIGNING_KEY` secret of the `release` environment and trust its public key on the Hub.

```sh
key=tmp/github-release.key
node -e "const c=require('node:crypto'),f=require('node:fs');const k=c.generateKeyPairSync('ed25519');f.writeFileSync(process.argv[1],k.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600,flag:'wx'});console.log(Buffer.from(c.createPublicKey(k.privateKey).export({format:'jwk'}).x,'base64url').toString('base64'))" "$key"
gh secret set RELEASE_SIGNING_KEY --env release < "$key"
rm "$key"
```

The printed line is the public key: trust it with `update_control` action `release_keys`, operation
`trust`, role `github`, a label, and check the fingerprint with operation `list`. `GOOGLE_SERVICES_JSON`
is the secret of the `android-build` environment. A failed release is reported and stops; a rollback
runs only when the owner orders it (`update_control` action `rollback`).
The owner’s assistant and any owner MCP client, such as Claude Code on a paired computer, can call `update_control`.

The owner’s production Hub runs on the NAS (`ssh nas`, `192.168.50.254`), at
`https://smarteverything.devl0rd.com`. This desktop’s Hub stays disabled by default; start a test Hub only on demand with isolated scratch data.
Use Git to exchange accepted changes between the machines and follow the production release
process in [docs/STANDARDS.md](docs/STANDARDS.md#git-handoff-and-releases).

For an installed standalone Hub, review releases in the Hub section of the app's **Updates**
settings. The Hub applies the releases that were staged or downloaded for it; by default it does not build them,
and only the opt-in `hub` source builds on the Hub.

## Install Desktop and Computer

Build the normal Desktop distribution with
`pnpm --filter @smarteverything/desktop run make:release` and install the artifact for your
operating system. It contains the Desktop app, the per-user Computer service and its AI harness.
Desktop never installs or runs the Hub. Install the Hub on its own machine and connect Desktop to it over the network when you first open the app.

To build the Linux ZIP, set `arch` to `x64` or `arm64`.

```sh
arch=x64
pnpm install
pnpm --filter @smarteverything/desktop run make:release --arch "$arch" --targets zip
```

Extract the ZIP from `apps/desktop/out/make/zip/linux/<arch>/` into a directory writable by your
user, such as `~/.local/opt/SmartEverything-Desktop`. Keep the parent directory writable so the
updater can replace the installation. Launch the `smarteverything` executable from the
extracted directory.

To attach the Computer service to your Hub, generate a code in **Pair a computer** and run the
Desktop executable on that computer with the displayed arguments. The Hub address is its network
address; an `https` address also needs the displayed `--pin`. Use **Check for updates** in
the Desktop tray to look for Desktop releases. The Desktop updater replaces the app and Computer
service together.

## Release notes

Write one set of notes for each release you publish. Start with one plain-language sentence of about 100 characters
or fewer for the update banner. Leave a blank line, then list the user-visible changes in short bullets for update
details. Include any steps the user needs to take. Keep the notes scoped to the changes in the release.

```text
Camera previews open faster and reconnect automatically.

- Camera previews resume after a brief network interruption.
- Low-bandwidth mode loads a smaller preview on mobile data.
```

- For a managed Desktop installer, pass `--notes="$(cat "$release_notes_file")"` to
  `tooling/release-machine-update.ts` with the version and package.
- For a UI OTA, pass the same multiline `--notes` argument to `tooling/publish-app-update.ts publish`
  or set the `notes` input of `update_control` action `ui`. For a signed Android APK, set the multiline
  `notes` input of action `app`.
- For a Hub Git update from the opt-in `hub` source checkout, include `release-notes/hub.json` in the published tip with exactly the
  fields shown below. Use the full SHA of the exact comparison base for `from` and the full
  multiline release text for `notes`. The comparison base is the verified running remote tip
  when available, or the checkout HEAD when only the source is known to be ahead. Update this
  file in the release tip so it differs from the file at that tip's first parent.

```json
{
  "from": "<full SHA of the comparison base>",
  "notes": "Camera previews reconnect automatically.\n\n- Previews resume after a brief network interruption."
}
```
