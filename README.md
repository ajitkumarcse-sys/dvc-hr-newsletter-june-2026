# MY DVC – MY VOICE · HR Newsletter website

Static newsletter site (HTML/CSS/JS) with employee login, online article submission,
and quiz submission, backed by [Supabase](https://supabase.com) (auth, database, photo storage).

| Page | What it does |
|---|---|
| `index.html` | The newsletter. Employees register/log in, submit quiz answers (once per edition), submit articles with photos, and track their entries under **My profile & submissions**. |
| `dashboard.html` | Editor dashboard: review articles (Under review / Shortlisted / Not selected, with a note the contributor can see), quiz entries ranked by submission time, members list, CSV export, open/close the quiz, start a new edition. |

## Files

- `js/config.js` — Supabase URL + publishable key, and **this month's quiz questions**
- `js/auth.js` — login / register / password reset, shared by both pages
- `js/main.js` — quiz + article submission on the newsletter page
- `js/dashboard.js` — editor dashboard
- `supabase/schema.sql` — database tables, row-level security, storage bucket

## One-time Supabase setup (dashboard → project `dvc-hr-newsletter`)

1. **Authentication → URL Configuration**
   - Site URL: your live site, e.g. `https://ajitkumarcse-sys.github.io/dvc-hr-newsletter-june-2026/`
   - Redirect URLs: add the live site URL(s) (GitHub Pages and/or your Hostinger domain).
2. **Email delivery.** Supabase's built-in sender only emails members of your Supabase team, so
   employees can't receive confirmation or reset emails. Choose one:
   - **Authentication → Sign In / Providers → Email → turn off "Confirm email"** (quickest; accounts work immediately), or
   - **Authentication → Emails → SMTP Settings** → add a real SMTP provider (Brevo, Resend, Gmail app password…).
     Needed for "Forgot password" emails to reach employees.

## Common tasks

**Make someone an editor** (SQL Editor in Supabase). Works before or after they register:

```sql
insert into private.editor_emails (email) values ('person@example.com');
-- remove editor access:
delete from private.editor_emails where email = 'person@example.com';
```

**Next month's quiz:** in the dashboard's *Quiz entries* tab, close the old edition and create the new one
(e.g. `2026-07`). Then update `QUIZ_EDITION` and `QUIZ_QUESTIONS` in `js/config.js` and push.

## Security model

All tables use row-level security. Employees can only read their own profile, articles and quiz entries;
they can't change their role, set the submission time, edit an entry after submitting, or submit a quiz twice.
Editors (from the `private.editor_emails` allowlist) can read everything and review articles.
Photos live in a private bucket; editors see them through short-lived signed links.
The publishable key in `js/config.js` is meant to be public — access is enforced by the database policies.
