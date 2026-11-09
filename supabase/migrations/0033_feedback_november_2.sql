-- Feedback Sabine, november (second round). Only additions; existing data stays as it is.

-- Future Weddings Academy ---------------------------------------------------------------------------

-- A photo per module, shown on the module tile (like the photo of a recommendation).
alter table public.modules add column if not exists image_file_id uuid references public.files (id) on delete set null;

-- The main page: a header with an optional photo and a welcome block with an own title.
alter table public.settings add column if not exists header_image_file_id uuid references public.files (id) on delete set null;
alter table public.settings add column if not exists welcome_title text not null default 'Een persoonlijk welkom';

-- Your Wedding Space ---------------------------------------------------------------------------------

set local search_path to wedding_space, public;

-- The tour (Systeem > Rondleiding): the texts of the welcome block and of the pop-up, set by Sabine.
alter table settings add column if not exists tour_welcome_title text not null default 'Welkom in Your Wedding Space!';
alter table settings add column if not exists tour_welcome_text text not null
  default 'In de rondleiding laat Sabine jullie zien hoe alles werkt. Fijn om even te bekijken voordat jullie beginnen.';
alter table settings add column if not exists tour_popup_title text not null default 'De rondleiding';
alter table settings add column if not exists tour_popup_text text not null
  default 'Welkom in Your Wedding Space! In deze video laat ik jullie zien hoe alles werkt.';

-- The opening dance information page: up to three videos (the first stays in dance_video_url).
alter table settings add column if not exists dance_extra_video_urls jsonb not null default '[]'::jsonb;
