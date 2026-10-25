// Removes the local data folder; the demo data is recreated on the next request.
import { rmSync } from "fs";
import path from "path";

const dir = path.resolve(process.env.DATA_DIR ?? ".data");
rmSync(dir, { recursive: true, force: true });
console.log(`Lokale data verwijderd (${dir}). Herstart de app voor verse demodata.`);
