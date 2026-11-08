import type { DataStore, FileStorage } from "./store";
import { AcademyFileStorage } from "./files";
import { PgDataStore } from "./pg-store";

export type { DataStore, FileStorage } from "./store";
export * from "./types";

let store: DataStore | undefined;
let files: FileStorage | undefined;

/** The Academy data: Postgres via DATABASE_URL (src/lib/data/pg-store.ts). */
export function getStore(): DataStore {
  store ??= new PgDataStore();
  return store;
}

/** Uploads: Supabase Storage in production, Postgres in development (src/lib/data/files.ts). */
export function getFiles(): FileStorage {
  files ??= new AcademyFileStorage();
  return files;
}
