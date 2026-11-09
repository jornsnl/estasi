import { redirect } from "next/navigation";

/** Moved to Systeem, Mailgeschiedenis. Old links and bookmarks keep working. */
export default async function Moved({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams(Object.entries(await searchParams).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  redirect(`/beheer/mailgeschiedenis${query.size ? `?${query}` : ""}`);
}
