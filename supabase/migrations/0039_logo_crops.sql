-- Feedback Sabine (27 punten, nr. 3): with a square logo the app icon got a white border. She now
-- chooses the crop of the icon herself when uploading: how large the logo is in the square (zoom,
-- 1 = edge to edge, more crops it) and where it sits (x and y, as a fraction of the icon).
-- One object per kind: {"academy": {"zoom": 1, "x": 0, "y": 0}, ...}. Without one: zoom 0.8, centred.
alter table public.brand_logos add column if not exists crops jsonb not null default '{}'::jsonb;
