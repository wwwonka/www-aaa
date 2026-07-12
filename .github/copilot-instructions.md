# Copilot instructions for `wwwonka/www-aaa`

## Build, lint, and test commands

Use `pnpm` (lockfile is `pnpm-lock.yaml`).

- Install deps: `pnpm install`
- Dev server: `pnpm dev`
- Build: `pnpm build`
- Lint: `pnpm lint`
- Lint autofix: `pnpm lint:fix`
- Format: `pnpm format`
- Format check: `pnpm format:check`
- Run all E2E tests: `pnpm test:e2e`
- Run one test file: `pnpm test:e2e:one tests/smoke.spec.ts`
- Run headed: `pnpm test:e2e:headed`
- Run UI mode: `pnpm test:e2e:ui`
- Open last HTML report: `pnpm test:e2e:report`

## High-level architecture

This project is a worker-first web “console” (receiver desktop + controller phone), not a traditional DOM app.

1. **Main thread (`src/main.ts`, `src/app/`)**
   - Boots `AppHost`, parses query flags, installs browser/PWA guards.
   - Owns WebRTC/pairing flow and app state orchestration (`AppOrchestrator` with XState).
   - Transfers one `OffscreenCanvas` to render worker.
   - Writes control input into a control SAB (`writeAxes` / `pushAction`).

2. **Render worker (`src/render/`)**
   - Owns Babylon + Pixi rendering on a **single shared WebGL context**.
   - Uses strict render order and cache resets to avoid Babylon/Pixi GL state corruption.
   - Hosts all screen UI composition and transitions.
   - In low tier mode, also hosts simulation (`Render+SimWorker`).

3. **Simulation host (`src/sim/`)**
   - Runs boid + Havok simulation with fixed-step updates.
   - Reads control SAB (axes latest-wins + discrete action ring).
   - Writes boid/prop matrices and target data into shared buffers consumed by render.
   - Runs as dedicated `SimulationWorker` on high tier, or embedded in render worker on low tier.

4. **Core system layer (`src/core/`)**
   - `SystemAllocator` picks worker vs inline placement for agile systems (currently AssetsManager) using hardware/tier rules.
   - `sab-manager` defines shared memory allocation boundaries (`createSAB`, `createControlSAB`).

## Key conventions specific to this codebase

1. **Single-canvas rule is non-negotiable**
   - One canvas, one WebGL context.
   - Babylon renders first, Pixi overlays after with `clearBeforeRender: false`.
   - Keep the Babylon/Pixi interoperability safeguards (`gl.bindVertexArray(null)`, `engine.wipeCaches(true)`).

2. **Worker-first runtime**
   - Default path is workers; `?monolith` is debug-only parity mode.
   - Validate behavior in workers, not only monolith/dev paths.

3. **Thread contract**
   - Hot path data flow uses SharedArrayBuffer + Atomics.
   - `postMessage`/Comlink is for cold path control/init/events.
   - `src/shared/` must stay side-effect free and framework-agnostic (no UI/render imports, no global mutable state).

4. **Input pipeline contract**
   - Physical/network input is normalized to numeric control data.
   - Axes are fixed-point atomics with latest-wins semantics.
   - Discrete actions use a ring buffer (must not be silently reordered).
   - Simulation is the single sequential dispatcher/consumer.

5. **Authority and handoff model**
   - Only the active device is authoritative for game state.
   - Planned transfer model is snapshot + ACK + authority switch (no dual authority).

6. **Code organization and naming**
   - Keep modules small and single-responsibility.
   - Use PascalCase for classes/files-of-classes, camelCase for functions/util files, `.worker.ts` suffix for worker entrypoints.
   - In Babylon hot loops, avoid allocations; prefer in-place/vector-to-ref APIs.
   - Private/protected class fields conventionally use `_` prefix.

7. **Dev-only code boundaries**
   - Dev runtime code belongs in `src/_dev/`.
   - Build/dev tooling additions belong in `_dev/`.
   - Gate dev-only imports behind `import.meta.env.DEV` and prefer dynamic imports.

## Primary project references before major changes

1. `CLAUDE.md` (project constraints and priorities)
2. `docs/onboarding.md` (status reality checks and anti-hallucination notes)
3. `docs/architecture/threading-model.md`
4. `docs/architecture/render-stack.md`
5. `docs/architecture/code-conventions.md`
6. `docs/architecture/src-layout.md`
