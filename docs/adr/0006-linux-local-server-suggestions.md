# 0006: Linux-only, identity-first local suggestions

- Status: Accepted
- Date: 2026-11-06

## Context

Native Linux users can have a server on a documented loopback default, but an
open port or healthy foreign service cannot establish Windwatcher compatibility.
The shared browser/Windows/Android application must not start Linux probes.

## Decision

Require both core `isTauri()` and a Vite literal from the CLI hook's
`TAURI_ENV_PLATFORM === "linux"`. Ordinary Vite defaults to `web`. Actual Linux
dev/build hooks and WebKitGTK behavior were verified; emitted web/Windows/Android
gates are tested separately. This is not an authorization boundary and adds no
OS-information plugin, IPC command or permissions.

Scan only IPv4/IPv6 loopback roots on HTTP port 8080, independently, with an
eight-second global deadline and three-second inspection/readiness budgets.
Reuse ADR 0005's discovery/legacy policy. Query unversioned readiness only after
a supported modern advertisement; bound its JSON to 4 KiB and interpret exact
200/ready and 503/not_ready pairs, not generic API Problem Details.

Show unready, unknown-readiness and incompatible Windwatcher results as
diagnostics, without selection. Only ready modern or recognized-but-unverified
legacy candidates can populate the manual field. Selection still requires manual
inspection and, for legacy, acknowledgment. Preserve HTTP warnings and never
equate matching advertisements with shared identity.

## Consequences

Custom listeners/proxies and readiness-unknown servers remain manually accessible.
Advice is transient, abortable and isolated from manual inspection; editing,
dismissal, replacement and unmount invalidate pending results. There is no saved
profile, credential, automatic authentication or background lifecycle.
Native smoke uses a disposable IPv6 listener because the existing IPv4 service
was not safe to replace. Fixture readiness failures are documented separately
from real-server compatibility evidence in [local discovery](../local-discovery.md).
