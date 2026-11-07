-- Passkeys for the owner and the MCP connection (OAuth 2.1) set up on
-- /beheer/profiel. Only the server reaches these tables (secret key);
-- tokens, codes and client secrets are stored as sha256 hashes.

create table if not exists public.passkeys (
  id text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device_type text not null default '',
  backed_up boolean not null default false,
  name text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists passkeys_user_idx on public.passkeys (user_id);

create table if not exists public.mcp_settings (
  user_id uuid primary key references public.users (id) on delete cascade,
  enabled boolean not null default false,
  allow_write boolean not null default false,
  allow_registration boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.oauth_clients (
  id text primary key,
  name text not null,
  secret_hash text,
  redirect_uris text[] not null default '{}',
  source text not null default 'dynamic' check (source in ('dynamic', 'manual')),
  client_uri text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.oauth_codes (
  code_hash text primary key,
  client_id text not null references public.oauth_clients (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  scope text[] not null default '{}',
  resource text not null default '',
  expires_at timestamptz not null
);

create table if not exists public.oauth_grants (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.oauth_clients (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  scope text[] not null default '{}',
  resource text not null default '',
  access_hash text not null unique,
  access_expires_at timestamptz not null,
  refresh_hash text not null unique,
  refresh_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists oauth_grants_user_idx on public.oauth_grants (user_id);

alter table public.passkeys enable row level security;
alter table public.mcp_settings enable row level security;
alter table public.oauth_clients enable row level security;
alter table public.oauth_codes enable row level security;
alter table public.oauth_grants enable row level security;
revoke all on public.passkeys, public.mcp_settings, public.oauth_clients, public.oauth_codes, public.oauth_grants from anon, authenticated;
