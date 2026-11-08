-- Academy: feedback screen, assessment of final assignments and the
-- practical certificate (Academy 8, 9 en 15).
--
-- assignment_feedback: a concept (sent_at null) can carry an assessment for a
-- graded assignment (voldoende / verbetering nodig) that is applied when it
-- is sent; seen_at is when the student saw sent feedback (the badge in the
-- Academy). At most one concept per version.
--
-- Final assignments (graded) wait for Sabine also without a feedback request:
-- their latest version gets feedback_status 'nieuw' at submit, so they show up
-- in the feedback overview. Existing ones are set here.
--
-- enrollments: the practical certificate, released by hand for package B
-- after the shadow wedding (practical_status completed).
-- Additive and safe to run again.

alter table public.assignment_feedback
  add column if not exists assessment text check (assessment in ('voldoende', 'verbetering_nodig')),
  add column if not exists seen_at timestamptz;

-- Feedback sent before this migration counts as seen: no flood of badges.
update public.assignment_feedback set seen_at = sent_at where sent_at is not null and seen_at is null;

create unique index if not exists assignment_feedback_one_concept_idx
  on public.assignment_feedback (version_id) where sent_at is null;
create index if not exists assignment_feedback_unseen_idx
  on public.assignment_feedback (user_id) where sent_at is not null and seen_at is null;

-- Latest handed-in version of a graded assignment that is not assessed yet.
update public.submission_versions v
set feedback_status = 'nieuw'
from public.assignment_submissions s
where s.id = v.submission_id
  and s.status = 'ingediend'
  and v.feedback_status is null
  and coalesce((v.assignment->>'graded')::boolean, false)
  and v.version = (select max(x.version) from public.submission_versions x where x.submission_id = v.submission_id);

alter table public.enrollments
  add column if not exists practical_certificate_released_at timestamptz,
  add column if not exists practical_certificate_code text unique;
