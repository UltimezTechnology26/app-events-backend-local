# Project Rules — Backend

## Secrets

Never hardcode a key, DB URL, credential, or token — read from `process.env`. New env vars go into `.env.example` with no real value.

## Passwords & Sessions

Hash passwords with bcrypt/argon2, always — never store or log plaintext. Session/auth cookies carry `secure`, `httpOnly`, `sameSite`.

## Auth & Access Control

JWT secrets load from env, tokens carry an expiry. Every non-public route sits behind the auth middleware by default — don't leave a new route open because it "isn't sensitive yet." Role-gated routes check the role, not just that a token exists.

## Input Validation

Every `POST`/`PUT`/`PATCH`/`DELETE` validates its body against a schema before it touches business logic or the database. Reject bad input early with a 4xx, not three layers deep.

## Data Access

Queries go through the ORM's parameter binding — never string-concatenated SQL. Controllers don't talk to the database directly; that's what the repository/service layer is for.

## Query Performance

Paginate anything that returns a list. No `SELECT *`. Batch or join instead of looping a query per row (N+1). No DB calls inside loops.

## Caching (Redis)

Any read that's expensive or hit frequently — repeated lookups, aggregations, anything computed from a join — gets cached in Redis, not re-queried from the DB on every request. Set a TTL appropriate to how often the underlying data changes; don't cache forever by default. Invalidate (or update) the key explicitly on writes that change the cached data — never rely on TTL expiry alone for data that must stay consistent. Key names are namespaced and include the params they depend on (e.g. `user:123:orders:page:2`), not a single shared key for different inputs. Don't cache user-specific or auth-sensitive data unless it's scoped per-user and invalidated on logout/permission change.

## Folder Structure (Module-Based)

Organize by feature/module, not by layer. This applies to every domain module in the project, whatever it's called — each one gets its own folder containing everything it needs, and don't scatter that logic across shared top-level `routes/`, `controllers/`, `services/` folders. Every module folder follows the same shape, `<module>.<layer>.ts`:

```
src/modules/<module>/
 <module>.routes.ts
 <module>.controller.ts
 <module>.service.ts
 <module>.repository.ts   (queries live here, not inline in the service)
 <module>.cache.ts
 <module>.validation.ts
 <module>.types.ts
```

(e.g. a module named `funding` would produce `funding.routes.ts`, `funding.controller.ts`, etc. — that's just an instance of the pattern, not a special case.)

Only true cross-cutting code (auth middleware, the DB client, the logger, the generic error handler) lives outside module folders, in a shared `src/common/` (or `src/shared/`) directory. A module never reaches into another module's internals directly — it goes through that module's service.

## Architecture

Controllers stay thin — parse, call service, respond. One centralized error handler, not scattered try/catch blocks with inconsistent shapes. Log through the project's logger, not bare `console.log`. Rate-limit public and auth endpoints. CORS origins are explicit, never `*` in production. Handle SIGTERM/SIGINT cleanly, expose `/health`, and register handlers for unhandled rejections so a bad promise doesn't take the process down.

## Code Hygiene

No `any`. No `@ts-ignore` or `eslint-disable` without a comment saying why. Split anything pushing 150 lines. Don't commit `console.log`, dead code, or a mock/test endpoint wired into a production route.

## Static Analysis (SonarQube Gate)

Code must pass a Sonar quality gate before merge. Write to these rules directly instead of relying on Sonar to catch it after the fact.

**Reliability (Bugs)**

- Use `===`/`!==` always; never `==`/`!=`.
- No unreachable code after `return`, `throw`, `break`, or `continue`.
- No identical `if`/`else` branches, and no condition that's always true/false.
- Every `async` function's rejections are handled — no floating unhandled promise rejections anywhere in the request path.
- No empty `catch` blocks — log with the structured logger or rethrow, never swallow silently.
- No reassigning function parameters or shadowing an outer-scope variable.
- No assignment inside a conditional expression (`if (x = y)`).
- Every `switch` has a `default` case; no fallthrough without an explicit comment.
- No unused imports, variables, function parameters, or dead branches.
- Close every resource you open — DB connections, file handles, streams — in a `finally` or equivalent cleanup path.
- No unbounded recursion; every recursive function has a clear, reachable base case.

**Maintainability (Code Smells)**

- Cognitive complexity per function capped around 15; cyclomatic complexity capped around 10 — flatten nested conditionals with guard clauses or extract a function.
- No more than 3 levels of nested `if`/loop — extract instead of nesting further.
- No magic numbers/strings — name them as constants (0, 1, -1 excluded).
- No string literal duplicated 3+ times — extract to a shared constant.
- No code block duplicated across services/controllers — extract into a shared util the moment it repeats.
- Functions take no more than ~7 parameters — pass an options object beyond that.
- No commented-out code left in the diff.
- No empty function/block without a comment explaining why it's intentionally empty.

**Security (Vulnerabilities & Hotspots)**

- No string-concatenated SQL, shell commands, or file paths built from user input (SQL/command injection, path traversal).
- No hardcoded credentials, tokens, internal hostnames, IPs, or ports in source.
- No disabling TLS/certificate validation.
- Never use `Math.random()` for tokens, session IDs, or anything security-sensitive — use `crypto.randomBytes` or equivalent.
- No regular expression vulnerable to catastrophic backtracking (ReDoS) on user-controlled input.
- No wildcard (`*`) CORS origin in production config.
- No deserializing untrusted input without validating its shape first.
- No `eval()` or dynamic `require()`/`import()` built from user input.

**Duplication**

- Keep file-level duplication under the project's Sonar threshold (typically 3%). If Sonar would flag it, refactor before committing, not after.

## Definition of Done
Before marking a frontend task complete, Claude must:
1. Run `npx tsc --noEmit` and `npx eslint .` — zero errors
2. Run `[test command]` if tests exist for the touched code
3. Confirm the change doesn't violate any Sonar-gate rule above
4. Confirm no `console.log`, commented-out code, or unexplained
`eslint-disable`/`@ts-ignore` was left in the diff 
