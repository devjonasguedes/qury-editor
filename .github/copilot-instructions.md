# Copilot / AI Assistant Instructions — Qury Editor

This file gives concise, actionable guidance for an AI coding agent working in this repository.

Big picture
- Electron app with Vite: renderer (UI) built with Vite/electron-vite, main process in `src/main.js`, preload in `src/preload.js`.
- IPC-based architecture: renderer → preload → main. Preload exposes `window.api` (namespaced as `window.api.db` and `window.api.electron`) which invokes `ipcRenderer.invoke('channel', ...)`.
- DB drivers live in `src/drivers/` and are loaded via `createDriver(type)` in `src/drivers/index.js`.
- UI modules call `createDbConnection(api)` from `src/modules/dbConnection.js` which wraps `window.api` in a `safeApi` Proxy providing fallbacks.

Key files and responsibilities
- `src/main.js` — application bootstrap, IPC handlers, persistence (connections DB), policy rules, and orchestrates drivers/native features. Many core behaviors live here.
- `src/preload.js` — exposes the safe IPC surface to renderer: `window.api.db.*` and `window.api.electron.*`. Contains legacy flat exports for backward compatibility.
- `src/modules/dbConnection.js` — adapter used by renderer UI; implements `safeApi` Proxy, fallback logic, and a stable method surface for the UI.
- `src/drivers/*` — database driver implementations (`mysql.js`, `postgres.js`, `sqlite.js`). Drivers implement `connect`, `disconnect`, `runQuery`, `listTables`, etc.
- `src/apis/*` — scaffolding created for clearer separation: `dbApi.js` (registers `db:*` ipc handlers) and `electronApi.js` (app/system handlers).

IPC conventions and channels
- Namespaces: `db:*`, `connections:*`, `history:*`, `snippets:*`, `settings:*`, `app:*`, `system:*`, `dialog:*`.
- Use `ipcMain.handle('db:runQuery', handler)` in main and `ipcRenderer.invoke('db:runQuery', payload)` in preload/renderer.
- Standardized response shape used across scaffolds: `{ ok: boolean, data?: any, error?: string }`. Follow this when adding handlers.

Project-specific patterns
- `safeApi` Proxy in `createDbConnection(api)` gives list fallbacks (`listSavedConnections`, `listHistory`, `listSnippets`) and a default error-returning async function when the preload API is missing. Preserve this pattern when modifying renderer-facing API behavior.
- Preload exposes both namespaced and flat APIs (`...db`, `...electronApi`, plus `db`, `electron`). Legacy exports are explicitly marked with `TODO (LEGACY)` comments — search for that marker before removing compatibility code.
- Drivers are selected by `createDriver(type, deps)` and normalized (e.g., `postgres` → `postgresql`, `maria` → `mariadb`). Add new drivers under `src/drivers` following existing factory pattern.

Build / run / debug (explicit)

- Prerequisites: Node.js + npm. Install dependencies before running:

	npm install

- Run in development (recommended):

	npm run dev

	This runs `electron-vite dev` which starts the renderer dev server and launches Electron. Use this for iterative UI + main-process changes.

- Start a production-like preview:

	npm start

	This runs `electron-vite preview` and opens the app using the built renderer bundle.

- Build and package:

	npm run build
	npm run build:app
	npm run dist

	Use `npm run build` to produce production assets. `npm run build:app` copies native drivers and prepares packaging; `npm run dist` runs electron-builder.

- Debug tips:
	- When editing `src/main.js` or `src/preload.js`, stop and restart the dev process to reload the main process.
	- Inspect main process logs in the terminal where `npm run dev` is running; renderer console appears in the app DevTools.
	- Add `console.log(...)` in `src/main.js` for quick visibility; use `mainWindow.webContents.send(...)` to forward events to renderer for testing.
	- If you change native modules or drivers, run `npm run build:app` before packaging.

Important: assistant limitations

- The chat/AI assistant will not run local shell commands or start the development server on your machine. It will never execute `npm run dev` or any other local command to test the app — running, building and testing the project is the responsibility of the user.


Conventions for code changes
- Keep IPC channels stable; prefer adding new `db:*` handlers rather than altering existing ones in-place.
- Maintain `{ ok, data, error }` responses to avoid breaking `safeApi` fallbacks.
- Any removal of `TODO (LEGACY)` markers must be accompanied by a cross-repo search and migration of renderer usages to `window.api.db.*` (or `window.api.electron.*`).
- When adding public preload APIs, ensure they are JSON-serializable and safe under `contextIsolation`.

Checklist for PRs changing IPC or API surface
- Update `src/preload.js` to expose new handlers (preserve legacy spreads while migrating).
- Update `src/apis/README.md` with any changes to migration guidance.
- Run `npm run dev` locally and verify renderer actions that call the modified API behave as expected; check console for `{ ok: false }` errors.

Migration cleanup checklist (required when completing an API migration)

- For every change that migrates code to the new namespaced API (`window.api.db` / `window.api.electron`):
	1. Analyze legacy usage: search the repo for all callsites of the flat API (e.g. `window.api.connect`, `window.api.setProgressBar`).
	2. Replace callsites with the namespaced form and test the flow locally (user runs `npm run dev`).
	3. Remove the associated `TODO (LEGACY)` marker and delete the legacy export/spread from `src/preload.js` once all usages are migrated.
	4. Run a cross-repo grep to ensure no remaining references to the flat API remain:

		 grep -R "window.api\.connect\|window.api\.setProgressBar\|..." -n .

	5. Update `src/apis/README.md` and `CHAT_INSTRUCTIONS.md` documenting the removal and any changed contracts.
	6. Add a concise PR description listing the legacy pieces removed and the verification steps performed.

- Rationale: this ensures the repository is cleaned incrementally and avoids leaving dead compatibility code behind.

Search tips
- Find IPC usage: `grep -R "ipcRenderer.invoke\|ipcMain.handle" -n src`.
- Find legacy exports: `grep -R "TODO (LEGACY)" -n .`.
- Locate driver code: `ls src/drivers` and inspect `createDriver` in `src/drivers/index.js`.

If unclear areas remain
- The largest concentration of app logic is in `src/main.js` (>2k lines). When asked to change behavior, inspect how `toStoredConnectionEntry`, `toPublicConnectionEntry`, and policy checks are used (search for `policyMode`, `policy_rules`, and `READ_ONLY_BLOCKED_KEYWORDS`).

If you want changes applied now
- State whether to: (A) remove legacy flat exports from `src/preload.js`, (B) update `createDbConnection` to require `window.api.db`, or (C) integrate `registerDbHandlers`/`registerElectronHandlers` into `src/main.js`. Provide preference and I will implement.

End of instructions.
