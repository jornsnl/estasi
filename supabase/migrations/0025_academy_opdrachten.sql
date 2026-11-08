-- Academy: assignments (Academy 4 t/m 7 en 11).
--
-- A lesson block of type "assignment" holds parts with fields (short, long,
-- single, multi, scale, scale_rows, upload). A student's work on it is one row
-- in assignment_submissions (draft + status); every submit adds a fixed copy
-- in submission_versions (answers, files and the assignment as it was then).
-- Feedback hangs on a version. Owners can open a module early per student
-- (module_unlocks).
--
-- Existing data is converted, nothing is removed: every question, choice and
-- upload block becomes an assignment with one field and the same block id;
-- every answer becomes a submission (submitted, version 1, when the lesson was
-- completed or feedback was given; otherwise a draft); existing feedback hangs
-- on version 1. The old tables answers and feedback stay as they are.
-- Safe to run again: converted rows are recognised and skipped.

create table if not exists public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  -- No FK on lesson/block: submissions outlive deleted lessons (retention policy).
  lesson_id uuid not null,
  block_id text not null,
  status text not null default 'concept'
    check (status in ('concept', 'ingediend', 'verbetering_nodig', 'voldoende')),
  draft jsonb not null default '{}'::jsonb,
  draft_version int not null default 1,
  feedback_requested boolean not null default false,
  question_for_sabine text not null default '',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The answer this submission was converted from (migration 0025).
  legacy_answer_id uuid unique,
  unique (user_id, lesson_id, block_id)
);

create table if not exists public.submission_versions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.assignment_submissions (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  version int not null,
  answers jsonb not null default '{}'::jsonb,
  -- The assignment block as it was at this submit.
  assignment jsonb not null,
  feedback_requested boolean not null default false,
  question_for_sabine text not null default '',
  -- Null when no feedback was asked for.
  feedback_status text check (feedback_status in ('nieuw', 'in_behandeling', 'afgerond')),
  submitted_at timestamptz not null default now(),
  unique (submission_id, version)
);

create table if not exists public.assignment_feedback (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.submission_versions (id) on delete cascade,
  submission_id uuid not null references public.assignment_submissions (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  author_id uuid not null references public.users (id),
  text text not null default '',
  attachment jsonb,
  -- Null while it is a draft that only the owner sees.
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The row in public.feedback this was converted from (migration 0025).
  legacy_feedback_id uuid unique
);

create table if not exists public.module_unlocks (
  user_id uuid not null references public.users (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  unlocked_by uuid not null references public.users (id),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

alter table public.assignment_submissions enable row level security;
alter table public.submission_versions enable row level security;
alter table public.assignment_feedback enable row level security;
alter table public.module_unlocks enable row level security;

create index if not exists assignment_submissions_user_idx on public.assignment_submissions (user_id);
create index if not exists submission_versions_submission_idx on public.submission_versions (submission_id);
create index if not exists submission_versions_feedback_idx on public.submission_versions (feedback_status) where feedback_status is not null;
create index if not exists assignment_feedback_version_idx on public.assignment_feedback (version_id);
create index if not exists assignment_feedback_user_idx on public.assignment_feedback (user_id);

-- Conversion ---------------------------------------------------------------------
-- Same rules as legacyToAssignment in src/lib/domain/assignment.ts (a test
-- compares both).

create or replace function public.wpa_legacy_assignment(b jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'id', b->>'id',
    'type', 'assignment',
    'title', '',
    'intro', '',
    'requiredForLesson', coalesce((b->>'required')::boolean, false),
    'feedbackAllowed', coalesce((b->>'feedback')::boolean, false),
    'graded', false,
    'repeatOf', null,
    'parts', jsonb_build_array(jsonb_build_object(
      'id', (b->>'id') || '-p1',
      'title', '',
      'intro', '',
      'fields', jsonb_build_array(
        jsonb_build_object(
          'id', (b->>'id') || '-f1',
          'label', coalesce(b->>'prompt', ''),
          'help', coalesce(b->>'helpText', ''),
          'required', coalesce((b->>'required')::boolean, false)
        ) || case b->>'type'
          when 'choice' then jsonb_build_object(
            'type', 'single',
            'options', coalesce(b->'options', '[]'::jsonb),
            'allowComment', false)
          when 'upload' then jsonb_build_object(
            'type', 'upload',
            'accept', '["pdf","docx","xlsx","pptx","jpg","png"]'::jsonb,
            'maxFiles', 10)
          else jsonb_build_object('type', 'long')
        end
      )
    ))
  );
$$;

-- 1. Blocks: question, choice and upload become assignments (same id and position).
update public.lessons l
set blocks = (
  select coalesce(jsonb_agg(
    case when t.b->>'type' in ('question', 'choice', 'upload') then public.wpa_legacy_assignment(t.b) else t.b end
    order by t.ord), '[]'::jsonb)
  from jsonb_array_elements(l.blocks) with ordinality as t(b, ord)
)
where jsonb_typeof(l.blocks) = 'array'
  and exists (select 1 from jsonb_array_elements(l.blocks) x where x->>'type' in ('question', 'choice', 'upload'));

-- 1b. The same for the unpublished changes of a published lesson (lessons.draft,
-- {"title", "summary", "blocks"}). That column comes from migration 0030, which
-- on an existing database runs before this one and on a new one after it (where
-- there is nothing to convert yet), so only when the column is there.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'lessons' and column_name = 'draft') then
    execute $sql$
      update public.lessons l
      set draft = jsonb_set(l.draft, '{blocks}', (
        select coalesce(jsonb_agg(
          case when t.b->>'type' in ('question', 'choice', 'upload') then public.wpa_legacy_assignment(t.b) else t.b end
          order by t.ord), '[]'::jsonb)
        from jsonb_array_elements(l.draft->'blocks') with ordinality as t(b, ord)
      ))
      where l.draft is not null
        and jsonb_typeof(l.draft->'blocks') = 'array'
        and exists (select 1 from jsonb_array_elements(l.draft->'blocks') x where x->>'type' in ('question', 'choice', 'upload'))
    $sql$;
  end if;
end
$$;

-- 2. Answers become submissions, with version 1 and the feedback when there is any.
do $$
declare
  a record;
  asg jsonb;
  fld jsonb;
  answer_json jsonb;
  answered boolean;
  completed timestamptz;
  feedback_count int;
  last_feedback_version int;
  requested boolean;
  submitted boolean;
  sub_id uuid;
  ver_id uuid;
begin
  for a in
    select x.* from public.answers x
    where not exists (select 1 from public.assignment_submissions s where s.legacy_answer_id = x.id)
    order by x.created_at, x.id
  loop
    asg := null;
    select blk into asg
    from public.lessons l, jsonb_array_elements(l.blocks) blk
    where l.id = a.lesson_id and blk->>'id' = a.block_id and blk->>'type' = 'assignment'
    limit 1;
    if asg is null then
      -- The block (or the lesson) has been deleted since: keep the answer as a one-field assignment.
      asg := public.wpa_legacy_assignment(jsonb_build_object(
        'id', a.block_id,
        'type', case when a.choice is not null then 'choice'
                     when jsonb_array_length(coalesce(a.files, '[]'::jsonb)) > 0 then 'upload'
                     else 'question' end,
        'prompt', '(vraag niet meer in de les)',
        'helpText', '',
        'required', false,
        'feedback', false,
        'options', case when a.choice is not null then jsonb_build_array(a.choice) else '[]'::jsonb end));
    end if;
    fld := asg->'parts'->0->'fields'->0;

    answer_json := case fld->>'type'
      when 'single' then jsonb_build_object('choice', a.choice)
      when 'upload' then jsonb_build_object('files', coalesce(a.files, '[]'::jsonb))
      else jsonb_build_object('text', coalesce(a.text, ''))
    end;
    answered := case fld->>'type'
      when 'single' then a.choice is not null and a.choice <> ''
      when 'upload' then jsonb_array_length(coalesce(a.files, '[]'::jsonb)) > 0
      else btrim(coalesce(a.text, '')) <> ''
    end;

    select c.completed_at into completed
    from public.lesson_completions c where c.user_id = a.user_id and c.lesson_id = a.lesson_id;
    select count(*), max(f.answer_version) into feedback_count, last_feedback_version
    from public.feedback f where f.answer_id = a.id;

    requested := coalesce((asg->>'feedbackAllowed')::boolean, false) and answered;
    submitted := completed is not null or feedback_count > 0;

    insert into public.assignment_submissions
      (user_id, lesson_id, block_id, status, draft, draft_version, feedback_requested,
       submitted_at, created_at, updated_at, legacy_answer_id)
    values
      (a.user_id, a.lesson_id, a.block_id, case when submitted then 'ingediend' else 'concept' end,
       jsonb_build_object(fld->>'id', answer_json), 1, requested,
       case when submitted then coalesce(completed, a.updated_at) end, a.created_at, a.updated_at, a.id)
    on conflict do nothing
    returning id into sub_id;
    continue when sub_id is null;

    if submitted then
      insert into public.submission_versions
        (submission_id, user_id, version, answers, assignment, feedback_requested, feedback_status, submitted_at)
      values
        (sub_id, a.user_id, 1, jsonb_build_object(fld->>'id', answer_json), asg, requested,
         case
           -- Changed after the last feedback: waits for the owner again, as before.
           when requested and (feedback_count = 0 or a.version > last_feedback_version) then 'nieuw'
           when feedback_count > 0 then 'afgerond'
         end,
         coalesce(completed, a.updated_at))
      returning id into ver_id;

      insert into public.assignment_feedback
        (version_id, submission_id, user_id, author_id, text, attachment, sent_at, created_at, updated_at, legacy_feedback_id)
      select ver_id, sub_id, f.user_id, f.author_id, f.text, f.attachment, f.created_at, f.created_at, f.created_at, f.id
      from public.feedback f
      where f.answer_id = a.id
      order by f.created_at
      on conflict (legacy_feedback_id) do nothing;
    end if;
  end loop;
end
$$;

drop function public.wpa_legacy_assignment(jsonb);
