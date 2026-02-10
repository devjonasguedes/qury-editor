Scaffold para APIs (db & electron)

Objetivo
- Fornecer um ponto de partida para separar responsabilidades: `dbApi` (lógica de drivers/DB) e `electronApi` (operações do app).

Como usar
1. No `src/main.js`, importe e registre os handlers:

```js
const { registerDbHandlers } = require('./apis/dbApi');
const { registerElectronHandlers } = require('./apis/electronApi');

// no bootstrap/main setup
registerDbHandlers(ipcMain, { deps: { /* passe dependências necessárias */ } });
registerElectronHandlers(ipcMain, { getMainWindow: () => mainWindow, shell, dialog, nativeTheme });
```

2. No `src/preload.js` o `api` já está exposto como `window.api.db` e `window.api.electron`.

3. Os drivers ficam em `src/drivers/` e devem implementar funções esperadas (connect, disconnect, runQuery, listTables,...).

Notas
- O scaffold é intencionalmente mínimo e tem como objetivo facilitar a separação; adapte para o fluxo atual do projeto (pooling, policy checks, logging, cancelamento de queries, etc.).
- Padronize respostas como `{ ok: boolean, data?, error? }` para simplicidade no renderer.

Legacy markers
- Este repositório marca trechos "legacy" com o comentário `TODO (LEGACY)` para facilitar migração.
- Atualmente o `src/preload.js` exporta uma forma plana (por exemplo `window.api.connect`) por compatibilidade e também o namespace preferido `window.api.db`/`window.api.electron`.
- Procure por `TODO (LEGACY)` para identificar pontos que podem ser removidos quando a UI for totalmente migrada.
- Recomendação: remover os spreads (`...db`, `...electronApi`) do `preload.js` somente depois que todos os usos no renderer foram convertidos para `window.api.db.*` ou `window.api.electron.*`.

Changelog (migration to namespaced API)
-------------------------------------

- Added namespaced preload exports: `window.api.db` and `window.api.electron`.
	- Implemented in `src/preload.js` — see `db` and `electronApi` objects.
	- Flat/legacy top-level exports (e.g. `window.api.connect`) are still present but annotated with `TODO (LEGACY)` comments to guide removal.

- New API scaffolds added:
	- `src/apis/dbApi.js` — registers `db:*` IPC handlers and provides a simple driver registry.
	- `src/apis/electronApi.js` — registers `app:*`, `dialog:*`, `system:*` handlers (progress, openExternal, error dialog, native theme).

- Renderer adapter preserved and made compatible:
	- `src/modules/dbConnection.js` continues to use `createDbConnection(api)` and now works with `window.api.db` while providing `safeApi` fallbacks when preload is missing.

- Documentation and housekeeping:
	- Added `.github/copilot-instructions.md` with guidance for AI/code assistants, run/debug steps, and migration checklist.
	- Legacy helper `CHAT_INSTRUCTIONS.md` was created temporarily during migration work and subsequently removed; migration guidance consolidated in `.github/copilot-instructions.md`.

- Cleanup steps required (follow the Migration cleanup checklist in `.github/copilot-instructions.md` before removing legacy code):
	1. Replace all flat `window.api.*` usages with `window.api.db.*` or `window.api.electron.*`.
	2. Remove `TODO (LEGACY)` markers and delete the legacy spreads from `src/preload.js`.
	3. Run a repo-wide grep to confirm no remaining flat API uses.

These changes aim to separate concerns (UI vs. platform/DB logic) and make the renderer API surface explicit and easier to maintain.
