-- MY DVC – MY VOICE: database schema (Supabase / Postgres).
-- Applied to project "dvc-hr-newsletter". Re-runnable on a fresh project.
-- Editor emails are seeded separately (see README) and are not stored in this file.

create schema if not exists private;
grant usage on schema private to authenticated;

-- ============ PROFILES ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  employee_no text,
  designation text not null default '',
  department text not null default '',
  place_of_posting text not null default '',
  role text not null default 'employee' check (role in ('employee','editor')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table private.editor_emails (
  email text primary key,
  added_at timestamptz not null default now()
);

create or replace function private.is_editor() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'editor'
  );
$$;
revoke all on function private.is_editor() from public;
grant execute on function private.is_editor() to authenticated;

create policy "profiles: read own or editor" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_editor()));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, employee_no, designation, department, place_of_posting)
  on table public.profiles to authenticated;

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, full_name, employee_no, designation, department, place_of_posting, role)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(meta->>'full_name', ''), 120),
    nullif(left(coalesce(meta->>'employee_no', ''), 40), ''),
    left(coalesce(meta->>'designation', ''), 120),
    left(coalesce(meta->>'department', ''), 120),
    left(coalesce(meta->>'place_of_posting', ''), 120),
    case when exists (select 1 from private.editor_emails e where lower(e.email) = lower(new.email))
         then 'editor' else 'employee' end
  );
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.sync_editor_role() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set role = 'editor' where lower(email) = lower(new.email);
    return new;
  else
    update public.profiles set role = 'employee' where lower(email) = lower(old.email);
    return old;
  end if;
end;
$$;
create trigger on_editor_email_change
  after insert or delete on private.editor_emails
  for each row execute function private.sync_editor_role();

-- ============ ARTICLE SUBMISSIONS ============
create table public.article_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  title text not null check (char_length(title) between 3 and 200),
  category text not null check (category in
    ('Article','Achievement','Poem / Creative','Photograph','Station News','Feedback / Suggestion')),
  language text not null default 'English' check (language in ('English','Hindi')),
  content text not null check (
    char_length(content) between 1 and 4000
    and array_length(regexp_split_to_array(btrim(content), '\s+'), 1) <= 300
  ),
  photo_path text,
  author_photo_path text,
  status text not null default 'pending' check (status in ('pending','shortlisted','not_selected')),
  editor_note text check (editor_note is null or char_length(editor_note) <= 1000),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint article_submissions_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint article_submissions_reviewed_by_fkey foreign key (reviewed_by) references public.profiles(id) on delete set null
);
create index article_submissions_user_idx on public.article_submissions (user_id);
create index article_submissions_reviewer_idx on public.article_submissions (reviewed_by);
create index article_submissions_status_idx on public.article_submissions (status, created_at desc);
alter table public.article_submissions enable row level security;

create policy "articles: insert own" on public.article_submissions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (photo_path is null or photo_path like ((select auth.uid())::text || '/%'))
    and (author_photo_path is null or author_photo_path like ((select auth.uid())::text || '/%'))
  );
create policy "articles: read own or editor" on public.article_submissions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_editor()));
create policy "articles: editor review" on public.article_submissions
  for update to authenticated
  using ((select private.is_editor())) with check ((select private.is_editor()));

revoke all on table public.article_submissions from anon, authenticated;
grant select on table public.article_submissions to authenticated;
grant insert (title, category, language, content, photo_path, author_photo_path)
  on table public.article_submissions to authenticated;
grant update (status, editor_note) on table public.article_submissions to authenticated;

create or replace function private.stamp_review() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status or new.editor_note is distinct from old.editor_note then
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;
create trigger stamp_article_review
  before update on public.article_submissions
  for each row execute function private.stamp_review();

-- ============ QUIZ ============
create table public.quiz_editions (
  edition text primary key check (edition ~ '^\d{4}-\d{2}$'),
  title text not null default '',
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.quiz_editions enable row level security;
create policy "quiz_editions: public read" on public.quiz_editions
  for select to anon, authenticated using (true);
create policy "quiz_editions: editor toggle" on public.quiz_editions
  for update to authenticated
  using ((select private.is_editor())) with check ((select private.is_editor()));
create policy "quiz_editions: editor create" on public.quiz_editions
  for insert to authenticated
  with check ((select private.is_editor()));
revoke all on table public.quiz_editions from anon, authenticated;
grant select on table public.quiz_editions to anon, authenticated;
grant insert (edition, title, is_open) on table public.quiz_editions to authenticated;
grant update (is_open, title) on table public.quiz_editions to authenticated;

create table public.quiz_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  edition text not null references public.quiz_editions(edition) on delete cascade,
  answers jsonb not null check (
    jsonb_typeof(answers) = 'array'
    and jsonb_array_length(answers) between 1 and 30
    and char_length(answers::text) <= 6000
  ),
  submitted_at timestamptz not null default now(),
  unique (user_id, edition)
);
create index quiz_submissions_edition_idx on public.quiz_submissions (edition, submitted_at);
alter table public.quiz_submissions enable row level security;

create policy "quiz: insert own while open" on public.quiz_submissions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.quiz_editions q where q.edition = quiz_submissions.edition and q.is_open)
  );
create policy "quiz: read own or editor" on public.quiz_submissions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_editor()));

revoke all on table public.quiz_submissions from anon, authenticated;
grant select on table public.quiz_submissions to authenticated;
grant insert (edition, answers) on table public.quiz_submissions to authenticated;

insert into public.quiz_editions (edition, title, is_open)
values ('2026-06', 'June 2026 — Power Up Your Knowledge: Current Affairs Quiz', true)
on conflict do nothing;

-- ============ STORAGE: submission photos ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submission-photos', 'submission-photos', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "photos: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'submission-photos'
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos: read own or editor" on storage.objects
  for select to authenticated
  using (bucket_id = 'submission-photos'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_editor())));
create policy "photos: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'submission-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
