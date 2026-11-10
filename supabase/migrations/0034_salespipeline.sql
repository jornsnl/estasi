-- Salespipeline (beheer, /beheer/pipeline): leads of Estasi Weddings on a board with stages,
-- with an expected value and chance for the forecast. Modelled on the pipeline of SVB Solutions.
-- New tables only; nothing existing changes. Read and written by the server only (src/lib/pipeline/):
-- row level security is on without policies, so the public Supabase API sees nothing.

create table if not exists public.pipeline_leads (
  id uuid primary key default gen_random_uuid(),
  -- Name on the card, for example "Lisa & Tom" or "Bruiloft Kasteel De Haar".
  title text not null,
  contact_name text not null default '',
  partner_name text not null default '',
  email text not null default '',
  phone text not null default '',
  -- What the lead is interested in (src/lib/pipeline/rules.ts, INTERESTS).
  interest text not null default 'weddingplanning'
    check (interest in ('weddingplanning', 'openingsdans', 'academy', 'overig')),
  source text not null default 'handmatig'
    check (source in ('website', 'instagram', 'aanbeveling', 'beurs', 'mail', 'handmatig', 'overig')),
  wedding_date date,
  location text not null default '',
  guests integer check (guests is null or guests between 0 and 5000),
  stage text not null default 'nieuw'
    check (stage in ('nieuw', 'contact', 'kennismaking', 'offerte', 'geboekt', 'afgevallen')),
  -- Order within a column (fractional indexing: a move updates one row).
  position double precision not null default 1000,
  -- Expected value in cents, excluding VAT, and the chance in percent. Empty chance: the default per stage.
  value_cents integer check (value_cents is null or value_cents >= 0),
  probability integer check (probability is null or probability between 0 and 100),
  notes text not null default '',
  next_action text not null default '',
  next_action_date date,
  lost_reason text not null default '',
  -- The portal made from this lead ("Maak bruidspaar").
  couple_id uuid references wedding_space.couples (id) on delete set null,
  stage_changed_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pipeline_leads_stage_idx on public.pipeline_leads (stage, position);
create index if not exists pipeline_leads_follow_up_idx on public.pipeline_leads (next_action_date) where closed_at is null;

-- The timeline of a lead: created, stage changes, notes and the link to a couple.
create table if not exists public.pipeline_activity (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.pipeline_leads (id) on delete cascade,
  kind text not null check (kind in ('created', 'stage', 'note', 'couple')),
  from_stage text,
  to_stage text,
  body text not null default '',
  actor_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pipeline_activity_lead_idx on public.pipeline_activity (lead_id, created_at desc);

-- Keep the stage times up to date and log stage changes, wherever the change comes from (beheer or MCP).
create or replace function public.pipeline_leads_before_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.closed_at := case when new.stage in ('geboekt', 'afgevallen') then now() else null end;
    return new;
  end if;
  new.updated_at := now();
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
    new.closed_at := case when new.stage in ('geboekt', 'afgevallen') then now() else null end;
  end if;
  return new;
end;
$$;

drop trigger if exists pipeline_leads_before_update on public.pipeline_leads;
create trigger pipeline_leads_before_update before insert or update on public.pipeline_leads
  for each row execute function public.pipeline_leads_before_update();

create or replace function public.pipeline_leads_log()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.pipeline_activity (lead_id, kind, to_stage, body) values (new.id, 'created', new.stage, 'Lead aangemaakt');
  elsif new.stage is distinct from old.stage then
    insert into public.pipeline_activity (lead_id, kind, from_stage, to_stage) values (new.id, 'stage', old.stage, new.stage);
  end if;
  if tg_op = 'UPDATE' and new.couple_id is not null and old.couple_id is distinct from new.couple_id then
    insert into public.pipeline_activity (lead_id, kind, body) values (new.id, 'couple', 'Bruidspaar aangemaakt in Your Wedding Space');
  end if;
  return null;
end;
$$;

drop trigger if exists pipeline_leads_log on public.pipeline_leads;
create trigger pipeline_leads_log after insert or update on public.pipeline_leads
  for each row execute function public.pipeline_leads_log();

alter table public.pipeline_leads enable row level security;
alter table public.pipeline_activity enable row level security;
revoke all on public.pipeline_leads, public.pipeline_activity from anon, authenticated;
