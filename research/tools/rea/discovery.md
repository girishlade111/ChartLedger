# Environment & Tooling Discovery (`morluto/rea`)

## Inspection Summary
Inspected the container PATH, global npm/python packages, and workspace directories during initial environment setup.

- **`morluto/rea` (Reverse Engineer Anything)**: **Not installed** in this container (`which rea`, `which rea-agents`, and filesystem searches returned no installation).
- **Available Container Tools**:
  - Node.js `v22.23.5`
  - npm `10.9.9`
  - `tsx` `4.21.0` (project devDependency)
  - `git` (available; workspace is not initialized as a git repository)
  - `python3`
  - `playwright-cli` `0.1.22` + headless Chromium (`/ms-playwright`)
- **Unavailable Container Tools**:
  - `rea` / `rea-agents`
  - `docker` / `docker-compose` daemon (deployment `Dockerfile` and `docker-compose.yml` are authored and validated statically, not built locally in-container)
  - `psql` CLI (PostgreSQL schema push and SQL verification performed directly via Cloud SQL RPC tools `cloudsql.UpdateSchema` and `cloudsql.ExecuteSql`).

## Impact & Mitigation
Because `rea` is not installed and unauthorized reverse engineering is explicitly out of scope, public research relied solely on permitted web search (`bullgpt.io`) and the GitHub API (`iOfficeAI/AionUi`), documented in `research/evidence-register.json`.
