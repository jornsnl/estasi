import type { DataStore, FileStorage } from "./store";
import { LocalDataStore, LocalFileStorage } from "./local-store";
import { SupabaseDataStore, SupabaseFileStorage } from "./supabase-store";

export type { DataStore, FileStorage } from "./store";
export * from "./types";

export const dataBackend = () => process.env.DATA_BACKEND ?? "local";
export const isLocalMode = () => dataBackend() === "local";
export const isSupabaseMode = () => dataBackend() === "supabase";

let store: DataStore | undefined;
let files: FileStorage | undefined;

function assertKnownBackend() {
  if (!isLocalMode() && !isSupabaseMode()) {
    throw new Error(`DATA_BACKEND="${dataBackend()}" is onbekend. Gebruik "local" of "supabase".`);
  }
}

export function getStore(): DataStore {
  if (!store) {
    assertKnownBackend();
    store = isSupabaseMode() ? new SupabaseDataStore() : new LocalDataStore();
  }
  return store;
}

export function getFiles(): FileStorage {
  if (!files) {
    assertKnownBackend();
    files = isSupabaseMode() ? new SupabaseFileStorage() : new LocalFileStorage();
  }
  return files;
}
