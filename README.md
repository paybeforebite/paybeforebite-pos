# PayBeforeBite POS

Restaurant-facing point-of-sale application for billing, menu management, sales reporting, restaurant customers, staff access, account security, and subscription information.

## Repository boundaries

This repository contains the restaurant POS only. Platform-level administration (creating restaurants, managing all customers, platform-wide subscriptions, analytics, and platform-admin settings) belongs in the separate `paybeforebite/admin-portal` repository.

The POS retains restaurant-scoped roles (`owner`, `admin`, and `cashier`) and restaurant membership checks. The restaurant subscription page is part of the POS user experience; it is not the platform-wide subscription manager.

## Stack

- Static HTML, CSS and JavaScript
- Supabase Auth and Postgres
- Supabase Edge Functions
- Supabase Row Level Security (RLS)

## Local setup

1. Copy `supabase-config.example.js` to `supabase-config.js`.
2. Set the Supabase project URL and publishable key in `supabase-config.js`.
3. Serve the repository with a local static web server (for example, `python -m http.server 5500`).
4. Open `http://localhost:5500/index.html`.

Never put a Supabase secret/service-role key in browser code. Configure secret keys only as Edge Function secrets. The publishable/anon key is intended to be public; database security must come from RLS and server-side authorization.

## Main pages

- `index.html`: restaurant sign-in
- `dashboard.html`: restaurant sales dashboard
- `billing.html`: invoice creation\n- `tables.html`: dine-in table management, persistent open orders, takeaway billing and receipt printing
- `menu.html`: restaurant menu
- `restaurant-customers.html`: restaurant's customer area
- `staff.html`: restaurant staff area
- `reports.html`: sales reports
- `profile.html`: account details and password updates
- `subscription.html`: restaurant's subscription information
- `forgot-password.html` and `update-password.html`: account recovery

## Table-wise billing setup\n\nBefore using the Tables & Orders page, review and apply `supabase/migrations/20261024_table_wise_billing.sql` in the Supabase SQL Editor. The migration creates restaurant-scoped tables and open orders, enables RLS, and adds database functions for validated menu-item pricing and invoice settlement. Do not apply it without reviewing it for your existing database.\n\n## Security notes

- Protected pages require a signed-in user with an active `restaurant_members` row.
- Owner/admin-only pages are additionally restricted by the UI to `owner` and `admin` roles.
- Frontend checks are a usability layer, not a security boundary. Enforce tenant isolation and role permissions with Supabase RLS, database function permissions, and Edge Function authorization.
- Review `supabase/schema.sql` before running it; it is a schema reference and contains migration-like SQL and data updates. Do not blindly run it against an existing production database.
- Configure Supabase Auth redirect allow-lists for the real POS hostname and local development URL.

## Related repository

- Platform administration: [paybeforebite/admin-portal](https://github.com/paybeforebite/admin-portal)
- Marketing website: [paybeforebite/paybeforebite](https://github.com/paybeforebite/paybeforebite)
