# Laika

BYOK coding agent for VS Code. Chat is the product; **Orbit** is the 50,000-ft morph of the live change set. HTML prototype (Orbit source of truth until M2): `prototype/index.html`.

## Develop

```bash
npx pnpm@9.15.4 install
npx pnpm@9.15.4 build
```

Then **Run → Launch Laika** (F5) in this workspace.

1. Command Palette → **Laika: Set API Key** (stored in VS Code SecretStorage)
2. Settings: `laika.provider` (`anthropic` | `openai`), `laika.model`, `laika.profile`
3. Open the Laika sidebar and send a message

`laika.modelOverrides` always wins over `models/models.json` — including a larger `contextWindow` than the registry default.

- `packages/core` — host-agnostic runtime (no `vscode` imports)
- `packages/vscode` — extension host
- `packages/webview` — React sidebar
