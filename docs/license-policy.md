# License Policy

Who Eats Token is MIT licensed. Its dependency set must stay compatible with a permissive desktop app, browser extension, VS Code/Cursor adapter, MCP server, skills, and plugin distribution.

Run:

```powershell
npm run license:check
```

The check is offline. It reads `package-lock.json` and fails on missing, forbidden, or unreviewed license metadata.

## Allowed By Default

The automated allowlist accepts common permissive licenses used by the current dependency tree:

- MIT, ISC, 0BSD, BSD-2-Clause, BSD-3-Clause
- Apache-2.0, BlueOak-1.0.0
- CC0-1.0, Unlicense, WTFPL
- Python-2.0 and Artistic-2.0 for existing transitive utility packages

SPDX expressions that combine allowed licenses with `OR` or `AND` are accepted.

## Blocked By Default

The check blocks or requires removal/replacement for:

- AGPL, GPL, LGPL
- SSPL
- BUSL
- Commons Clause
- PolyForm or non-commercial licenses
- missing license metadata unless a package-specific review exception is added

## Reviewed Exceptions

Some lockfile entries need explicit maintainer review because their license metadata is not a simple SPDX expression:

- `@vscode/vsce-sign*`: VS Code extension signing helper packages from `@vscode/vsce`; the lockfile uses `SEE LICENSE IN LICENSE.txt`.
- `spdx-exceptions`: SPDX metadata package using `CC-BY-3.0`.

Adding a new reviewed exception requires updating `scripts/license-check.mjs`, explaining why the package is safe for this project form, and keeping `npm run test:license-check` green.

## Release Rule

Before public source or binary release:

```powershell
npm run secret:scan
npm run license:check
npm audit --audit-level=high
```

`secret:scan` protects local credentials. `license:check` protects open-source distribution rights. `npm audit` covers known vulnerability data and needs network access.
