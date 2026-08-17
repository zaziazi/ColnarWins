# CLAUDE.md

Read this, `README.md`, and `supabase/migrations/20260817090000_init.sql` before
doing anything. Together they are the contract for this project. The migration
is the schema source of truth — never touch it without being asked. The rules
in README.md under "Pravila, ki jih ne kršimo" are the project's business
rules — don't relax or rewrite them.

## Stack

Next.js 15 (App Router) · Supabase · Tailwind v4 · TypeScript. Runs in demo
mode with sample data when Supabase env vars are empty — see README.md.

## Commands

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

## Known footguns (found 2026-08-14, fix if you see them again)

### 1. Literal `\uXXXX` escapes in JSX do not decode

JSX text children and bare JSX attribute strings (`title="..."`, plain text
between tags) are **not** run through JavaScript's escape processing. Only
text inside a real JS string — an object property, or a template literal
inside `{}` — gets `č` etc. turned into the actual character.

Concretely:

```tsx
// BROKEN — renders literally as "Naročila" on screen
<AppShell title="Naročila">
  <SectionHeading>Čaka na potrditev</SectionHeading>

// FINE — inside {} as a JS expression, decodes normally
subtitle={`${narocila(orders.length)} · zadnjih 50`}

// FINE — inside an object literal, decodes normally
const SOURCE_LABEL = { email: "e-pošta" };
```

Rule: never write `\uXXXX` escapes in JSX text or in a bare JSX attribute
value. Either use the literal UTF-8 character (č, š, ž, ·, —, §, …) directly,
or wrap the string in `{}` as an actual JS/TS string. This codebase is UTF-8;
prefer writing the real character.

This previously broke visible Slovenian text (diacritics, the demo banner,
section headings, the customer/date separators) on `/pisarna`, `/nacrt`,
`/dostava`, and `/komerciala`. Fixed by replacing the escapes with literal
characters in those four files.

### 2. `@supabase/ssr` 0.6.1 needs explicit cookie types

`createServerClient` exposes both a current overload (`getAll`/`setAll`) and
a deprecated one (`get`/`set`/`remove`). With both present, TypeScript can't
contextually infer the `setAll` callback's parameter types, and `tsc --noEmit`
fails with implicit-`any` errors in `src/lib/supabase/middleware.ts` and
`src/lib/supabase/server.ts`.

Fix: import `CookieOptions` from `@supabase/ssr` and annotate the callback
explicitly:

```ts
setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
  ...
}
```

Do this for any new server-side Supabase client you add — don't rely on
inference.

## Not yet done (do not build unless asked)

`/nacrt`, `/dostava`, `/komerciala` are intentionally stubs. See README.md
"Naslednji koraki" for what's next and where it's specified.
