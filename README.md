# Qury Editor

> Um editor SQL desktop pessoal, feito com Electron.

Qury Editor é uma aplicação desktop leve para conectar e executar queries em bancos de dados relacionais. Suporta MySQL, PostgreSQL e SQLite, com suporte a tunnel SSH para conexões remotas.

Este é um **projeto pessoal** — feito para uso próprio no dia a dia e compartilhado publicamente no estado em que está. Sugestões e contribuições são bem-vindas.

---

## Funcionalidades

- Conexão com bancos **MySQL**, **PostgreSQL** e **SQLite**
- Suporte a **tunnel SSH** para servidores remotos/privados
- Editor SQL com [CodeMirror 6](https://codemirror.net/): syntax highlighting e autocomplete
- Salvar e gerenciar múltiplas conexões nomeadas
- Histórico de queries e snippets reutilizáveis
- **Regras de política por ambiente** (dev, staging, produção) — bloqueio de escritas destrutivas ou aprovação obrigatória antes de executar queries perigosas
- Suporte a tema escuro e claro

---

## Como foi feito

O app é construído sobre o [Electron](https://www.electronjs.org/) usando [electron-vite](https://electron-vite.org/) como toolchain de build.

| Camada | Tecnologia |
|---|---|
| Processo principal | Node.js (`src/main.js`) — handlers IPC, ciclo de vida dos drivers, persistência |
| Preload | `src/preload.js` — expõe a superfície IPC segura (`window.api`) ao renderer |
| Renderer (UI) | Módulos JS vanilla + [CodeMirror 6](https://codemirror.net/) |
| Drivers de banco | `src/drivers/` — `mysql2`, `pg`, `better-sqlite3` |
| Tunelamento | `ssh2` |
| Armazenamento | SQLite via `better-sqlite3` (conexões, histórico, snippets) |

O renderer se comunica com o processo principal exclusivamente por canais IPC (`db:*`, `connections:*`, `history:*`, `snippets:*`, `settings:*`). As respostas seguem o formato padrão: `{ ok: boolean, data?: any, error?: string }`.

---

## Próximas atualizações

O renderer atual é JS vanilla puro. O objetivo para a próxima iteração principal é **migrar a UI para React**, mantendo a camada de drivers e a API IPC intactas:

- Substituir o sistema de módulos DOM manual por um **renderer baseado em React**
- Tratar `window.api.db` e `window.api.electron` como a superfície de API estável — os componentes React vão consumir essas interfaces diretamente
- Manter `src/drivers/` e os handlers IPC de `src/main.js` sem alterações; os drivers já funcionam como uma API de backend
- Substituir gradualmente os componentes (`connect-modal`, `saved-connections`, `sql-editor`, etc.) por equivalentes em React

Ou seja: o processo principal do Electron, o preload e a camada de drivers são considerados estáveis — todo o novo trabalho de UI acontecerá apenas no renderer.

---

## Como rodar

**Pré-requisitos:** Node.js e npm.

```bash
# Instalar dependências (também reconstrói módulos nativos)
npm install

# Rodar em modo de desenvolvimento
npm run dev

# Build para produção
npm run build

# Empacotar o app
npm run dist
```

Os artefatos são gerados em `dist/release/`. Builds por plataforma:

```bash
npm run build:mac:arm64
npm run build:win:x64
npm run build:linux:deb
```

---

## Estrutura do projeto

```
src/
  main.js          # Processo principal do Electron — IPC, drivers, persistência
  preload.js       # Expõe window.api ao renderer
  app.js           # Entry point do renderer
  drivers/         # Implementações dos drivers de banco (mysql, postgres, sqlite)
  components/      # Componentes de UI (JS vanilla, a serem substituídos por React)
  modules/         # Lógica do renderer (dbConnection, queryHistory, etc.)
  api/             # Wrappers de chamadas IPC usados pelos componentes
  services/        # Gerenciador de políticas, gerenciador de tema
  constants/       # Constantes compartilhadas
```

---

## Licença

Distribuído sob a [GNU General Public License v3.0](LICENSE).

Você é livre para usar, modificar e distribuir este software nos termos da GPL v3. Qualquer trabalho derivado também deve ser distribuído sob a mesma licença.

---

*Qury Editor — por [Jonas Guedes](https://jonasguedes.com)*
