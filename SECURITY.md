# Security Policy

Lasso runs locally on your machine and, by design, keeps your code on your machine: no
telemetry, and your source files are only sent to whichever coding agent you configured.
That trust model is the core of this project, and we treat anything that breaks it as a
security bug.

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

Older versions are not supported. If you are unable to upgrade, please still report the
issue so we can decide whether a backport is warranted.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.** Report them privately
to the maintainers so we can fix the issue before it is disclosed.

- Email: [security@example.com](mailto:security@example.com) <!-- replace with the real maintainer security address -->
- If you prefer encrypted channels, request a PGP key from the same address and we will
  provide one.

Please include:

1. A description of the vulnerability and its impact (be specific about what an attacker
   could and could not do).
2. Steps to reproduce, or a minimal PoC. Prefer a dropped text file / script over a
   screenshot.
3. Affected versions and platform (OS, Node version, framework + version).
4. Any suggested fix, if you have one.

The report does **not** need to include your source code — and usually should not. If a
bug requires an app to trigger it, provide the smallest synthetic repro you can.

## What we care about most

Things that break the local-first trust model:

- Any path where a user's **source code or screenshots leak** beyond the configured agent.
- Telemetry being **enabled without explicit consent**.
- The overlay mutating the **live DOM** (a behavioral regression, but can become a security
  issue via injected content from untrusted pages).
- Arbitrary code execution through a malicious config / project — e.g. `lasso.config.json`,
  a compromised agent adapter, or path traversal when resolving `data-source` attributes.
- Diff application that writes outside the intended project directory.

## Handling process

1. You report privately; we acknowledge within **72 hours**.
2. We reproduce, assess severity, and work on a fix on a private branch.
3. We release a patched version, then coordinate disclosure with you (typical window:
   7–14 days after the release).

## Good-faith note

For the code above that does not deal with other people's data, we are happy for you to do
research against your own projects and report what you find. Please do not attack
third-party apps running Lasso, and please do not test by attempting to exfiltrate others'
source files.

Thanks for helping keep a local-first tool local-first.