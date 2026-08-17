# Colnix — naročila, dostava in računi

Next.js 15 (App Router) · Supabase · Tailwind v4 · TypeScript

This is the real codebase, not a prototype. It boots in **demo mode** with
sample data, so you can see the interface before Supabase exists.

## Zagon

```bash
npm install
cp .env.example .env.local     # leave the values empty for demo mode
npm run dev                    # http://localhost:3000
```

You should see the order list with sample data and a wine-coloured banner
saying demo mode is on.

## Priklop na Supabase

1. Create a **new, empty** Supabase project. Do not reuse an existing one.
2. Run the migration:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
   Or paste `supabase/migrations/20260817090000_init.sql` into the SQL editor.
3. Fill `.env.local` with the project URL and the anon key. The demo banner
   disappears and the app reads real data.
4. **Enable Row Level Security on every table and write policies.** Supabase
   does not do this for you — until you do, the tables are open. A driver must
   see only their own route for today.
5. Generate types once the schema is live:
   ```bash
   npm run db:types
   ```

## Struktura

```
src/
  app/
    pisarna/            office — order list and the phone order form
      novo/actions.ts   server action: the only place orders are written
    nacrt/              delivery planning        (not built yet, §7.3)
    dostava/            driver screens           (not built yet, §7.4)
    komerciala/         sales rep screens        (not built yet, §7.6)
    prijava/            login
    globals.css         ALL design tokens live here
  components/
    ui/                 design system primitives
    app-shell.tsx       one shell for the whole field app
    order-form.tsx      the screen everything else depends on
  lib/
    data.ts             the only place the app reads data
    demo.ts             sample data — delete once real data flows
    format.ts           EUR, dates, Slovenian plurals
    supabase/           server / client / admin / middleware
supabase/migrations/    the schema. This file is the contract.
```

## Pravila, ki jih ne kršimo

1. **No raw hex values in components.** If a colour is missing, add a token to
   `globals.css` first. This is what keeps three apps looking like one system.
2. **Prices are snapshotted onto the order line at confirmation.** The
   catalogue is never re-read later — a price change must not rewrite history.
3. **The invoice is created at delivery, never at order.** Otherwise every
   quantity change at the door becomes a credit note.
4. **Business rules live in server actions, not in the browser.** A rule that
   only exists in React is not a rule.
5. **`SUPABASE_SERVICE_ROLE_KEY` never gets a `NEXT_PUBLIC_` prefix.** If it
   ever reaches the browser, rotate it — removing it from the code is not
   enough.
6. **Give the AI `supabase/migrations/*.sql` and the spec at the start of every
   session.** Without them it will invent slightly different column names each
   time, and in a month you will have three versions of the same table.

## Naslednji koraki

| Kaj | Kje v specifikaciji |
|---|---|
| Sinhronizacija kupcev in izdelkov iz e-Računov | §8.1 |
| Izdaja računa ob potrjeni dostavi | §7.5 |
| Jutranje preverjanje plačil | §7.8 |
| Opomini — najprej samo 1. stopnja, teden dni v suhem teku | §7.8 |
| Načrt dostave in nakladalni listi | §7.3 |
| Voznikova aplikacija s podpisom | §7.4 |
