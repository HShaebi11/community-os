create extension if not exists "pgcrypto";
create extension if not exists "vector";

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null
);

create table if not exists sessions (
  token uuid primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  join_url text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists workspace_leads (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null,
  primary key (workspace_id, user_id)
);

create table if not exists sources (
  id uuid primary key,
  community_id uuid not null references workspaces(id) on delete cascade,
  kind text not null,
  name text not null
);

create table if not exists members (
  id uuid primary key,
  community_id uuid not null references workspaces(id) on delete cascade,
  display_name text not null,
  aliases text[] not null default '{}',
  "do" text,
  want text,
  offer text,
  notes text,
  public_opt_in boolean not null default false,
  public_slug text,
  last_active timestamptz,
  lead_locked_fields text[] not null default '{}'
);

create table if not exists messages (
  id uuid primary key,
  community_id uuid not null references workspaces(id) on delete cascade,
  source_id uuid not null references sources(id),
  source_message_id text not null,
  author_raw text not null,
  member_id uuid references members(id),
  body text not null,
  sent_at timestamptz not null,
  is_noise boolean not null default false,
  unique (community_id, source_message_id)
);

create table if not exists files (
  id uuid primary key,
  community_id uuid not null references workspaces(id) on delete cascade,
  message_id uuid,
  name text not null,
  storage_path text not null,
  mime text not null
);

create table if not exists citations (
  id uuid primary key,
  community_id uuid not null references workspaces(id) on delete cascade,
  object_type text not null,
  object_id uuid not null,
  message_id uuid not null references messages(id),
  quote text not null
);

create table if not exists resources (
  id uuid primary key,
  community_id uuid not null references workspaces(id) on delete cascade,
  url text not null,
  title text not null,
  message_id uuid
);

create table if not exists demands (
  id uuid primary key,
  community_id uuid not null references workspaces(id) on delete cascade,
  topic text not null,
  title text,
  one_liner text,
  member_ids uuid[] not null default '{}',
  message_ids uuid[] not null default '{}',
  updated_at timestamptz not null
);

create table if not exists venues (
  id uuid primary key,
  community_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  area text,
  capacity int,
  contact text,
  user_id uuid
);

create table if not exists sponsors (
  id uuid primary key,
  community_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  notes text,
  user_id uuid
);

create table if not exists proposals (
  id uuid primary key,
  community_id uuid not null references workspaces(id) on delete cascade,
  demand_id uuid not null references demands(id),
  venue_id uuid,
  speaker_ids uuid[] not null default '{}',
  status text not null,
  explanation text,
  outreach_draft text
);

create table if not exists events (
  id uuid primary key,
  community_id uuid not null references workspaces(id) on delete cascade,
  proposal_id uuid not null references proposals(id),
  slug text unique not null,
  title text not null,
  starts_at timestamptz,
  qr_svg text not null default '',
  published_at timestamptz not null
);

create table if not exists guests (
  id uuid primary key,
  event_id uuid not null references events(id) on delete cascade,
  community_id uuid not null references workspaces(id) on delete cascade,
  member_id uuid,
  name text not null,
  email text not null,
  source text not null default 'native'
);

create table if not exists timeline (
  id uuid primary key,
  community_id uuid not null references workspaces(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null
);

create table if not exists applications (
  id uuid primary key,
  community_id uuid not null references workspaces(id) on delete cascade,
  applicant text not null,
  answers text not null,
  score int not null,
  decision text not null,
  reason text not null
);

create table if not exists blocklist (
  id uuid primary key,
  community_id uuid not null references workspaces(id) on delete cascade,
  hash text not null,
  evidence text not null,
  reporter text not null,
  confirmed boolean not null default false
);

create table if not exists autopilot_artifacts (
  id uuid primary key,
  event_id uuid not null references events(id) on delete cascade,
  community_id uuid not null references workspaces(id) on delete cascade,
  kind text not null,
  body text not null
);

alter table workspaces enable row level security;
alter table workspace_leads enable row level security;
alter table sources enable row level security;
alter table members enable row level security;
alter table messages enable row level security;
alter table files enable row level security;
alter table citations enable row level security;
alter table resources enable row level security;
alter table demands enable row level security;
alter table venues enable row level security;
alter table sponsors enable row level security;
alter table proposals enable row level security;
alter table events enable row level security;
alter table guests enable row level security;
alter table timeline enable row level security;
alter table applications enable row level security;
alter table blocklist enable row level security;
alter table autopilot_artifacts enable row level security;

create policy "lead reads workspace" on workspaces
  for select using (exists (
    select 1 from workspace_leads l where l.workspace_id = id and l.user_id = auth.uid()
  ));

create policy "lead reads community" on messages
  for select using (exists (
    select 1 from workspace_leads l where l.workspace_id = community_id and l.user_id = auth.uid()
  ));

create policy "public events" on events for select using (true);
create policy "public workspaces by slug" on workspaces for select using (true);
