// Row shapes as the queries return them (snake_case, dates as YYYY-MM-DD strings).

export type Lane = "couple" | "sabine" | "bride" | "groom";

export interface Package {
  id: string;
  name: string;
  variant: string;
  price_cents: number;
  meetings: number;
  suppliers_enabled: boolean;
  description: string;
  position: number;
  archived: boolean;
  kind: "wp" | "cm" | "od";
}

export interface PackageTask {
  id: string;
  package_id: string;
  lane: Lane;
  title: string;
  position: number;
}

export interface Couple {
  id: string;
  partner1_first: string;
  partner1_last: string;
  partner1_email: string;
  partner1_phone: string;
  partner2_first: string;
  partner2_last: string;
  partner2_email: string;
  partner2_phone: string;
  address: string;
  wedding_date: string | null;
  wedding_date_confirmed: boolean;
  location: string;
  package_id: string | null;
  suppliers_enabled: boolean;
  welcome_text: string;
  cover_file_id: string | null;
  status: "concept" | "active" | "archived";
  activated_at: Date | null;
  created_at: Date;
  guests_day: number | null;
  guests_day_kids: number | null;
  guests_evening: number | null;
  total_budget_cents: number | null;
}

export interface Settings {
  business_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_address: string;
  kvk: string;
  terms_url: string;
  default_welcome: string;
  meeting_guides: string[];
  detail_guide: string;
  evaluation_guide: string;
  contact_photo_file_id: string | null;
  group_photo_intro: string;
  default_styling_places: string[];
  /** The opening dance video for couples without the dance: a link, or an upload. */
  dance_video_url: string;
  dance_video_file_id: string | null;
  /** The tour video on the couple's start page (feedback 11): a link, or an upload. */
  tour_video_url: string;
  tour_video_file_id: string | null;
}

export interface Task {
  id: string;
  couple_id: string;
  lane: Lane;
  title: string;
  deadline: string | null;
  notes: string;
  position: number;
  done_at: Date | null;
  done_by_name: string;
  created_at: Date;
}

export interface Question {
  id: string;
  couple_id: string;
  body: string;
  asked_at: Date;
  asked_by_name: string;
  answer: string | null;
  answered_at: Date | null;
  read_at: Date | null;
}

export interface Appointment {
  id: string;
  couple_id: string;
  kind: "appointment" | "deadline";
  title: string;
  on_date: string;
  at_time: string;
  with_sabine: boolean;
  notes: string;
}

export interface Meeting {
  id: string;
  couple_id: string;
  kind: "meeting" | "detail" | "evaluation";
  title: string;
  guide: string;
  planned_on: string | null;
  summary: string;
  summary_file_id: string | null;
  summary_file_name: string | null;
  status: "to_plan" | "planned" | "done" | "skipped";
  position: number;
}

export interface SupplierCategory {
  id: string;
  name: string;
  position: number;
  archived: boolean;
}

export type SupplierStatus = "tbd" | "favorite" | "talking" | "booked" | "not_needed";

export interface CoupleSupplier {
  id: string;
  category_id: string;
  category_name: string;
  status: SupplierStatus;
  recommendation_id: string | null;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  notes: string;
  /** "Aanwezig op locatie vanaf / tot", "13:30" or "". */
  present_from: string;
  present_until: string;
}

export interface FileRef {
  id: string;
  name: string;
  size: number;
  mime: string;
}

export interface BudgetItem {
  id: string;
  couple_id: string;
  name: string;
  category: string;
  budget_cents: number;
  actual_cents: number | null;
  deposit_cents: number | null;
  deposit_due: string | null;
  payment_due: string | null;
  paid: boolean;
  position: number;
}

export interface Recommendation {
  id: string;
  category_id: string;
  name: string;
  profession: string;
  phone: string;
  email: string;
  website: string;
  photo_file_id: string | null;
  brochure_file_id: string | null;
  experience: string;
  region: string;
  contact_person: string;
  instagram: string;
  /** "Meer informatie". */
  description: string;
  work_area: string;
  price_indication: string;
  availability: string;
  /** Position within its category. */
  position: number;
  /** Hidden from the couples ("Zichtbaar: nee"). */
  archived: boolean;
}
