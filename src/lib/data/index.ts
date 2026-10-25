import type { DataStore, FileStorage } from "./store";
import { LocalDataStore, LocalFileStorage } from "./local-store";

export type { DataStore, FileStorage } from "./store";
export * from "./types";

export const dataBackend = () => process.env.DATA_BACKEND ?? "local";
export const isLocalMode = () => dataBackend() === "local";

let store: DataStore | undefined;
let files: FileStorage | undefined;

export function getStore(): DataStore {
  if (!store) {
    if (dataBackend() !== "local") {
      throw new Error(
        `DATA_BACKEND="${dataBackend()}" is nog niet aangesloten. Gebruik "local" of zie README (Supabase).`,
      );
    }
    store = new LocalDataStore();
  }
  return store;
}

export function getFiles(): FileStorage {
  files ??= new LocalFileStorage();
  return files;
}
