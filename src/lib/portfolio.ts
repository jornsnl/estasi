import "server-only";
import { getFiles, getStore, type User } from "@/lib/data";
import { listAssignmentFeedback, listSubmissions, listVersions } from "@/lib/data/assignments";
import { buildPortfolio, portfolioFeedback, portfolioFiles, portfolioHtml, type PortfolioModule } from "@/lib/domain/portfolio";
import { safeFileName } from "@/lib/domain/privacy";
import { formatDateTime } from "@/lib/util/format";
import { createZip, worthCompressing, type ZipEntry } from "@/lib/zip";

/** The portfolio of one student. The caller checks who may see it (canViewPortfolio). */
export async function loadPortfolio(userId: string, audience: "student" | "owner"): Promise<PortfolioModule[]> {
  const store = getStore();
  const [modules, lessons, submissions, versions, feedback] = await Promise.all([
    store.listModules(),
    store.listLessons(),
    listSubmissions({ userId }),
    listVersions({ userId }),
    listAssignmentFeedback({ userId, sentOnly: audience === "student" }),
  ]);
  return buildPortfolio({ modules, lessons, submissions, versions, feedback: portfolioFeedback(feedback, audience) });
}

/** Reads the files for a zip; a file that is gone is listed in "ontbrekende-bestanden.txt" instead. */
export async function filesForZip(list: { id: string; path: string }[]): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = [];
  const missing: string[] = [];
  for (const { id, path } of list) {
    const stored = await getFiles().read(id).catch(() => null);
    if (!stored) {
      missing.push(path);
      continue;
    }
    entries.push({ name: path, data: stored.data, compress: worthCompressing(path), date: new Date(stored.meta.createdAt) });
  }
  if (missing.length > 0) {
    entries.push({ name: "ontbrekende-bestanden.txt", data: Buffer.from(`Deze bestanden konden niet worden gelezen:\n${missing.join("\n")}\n`, "utf8"), compress: true });
  }
  return entries;
}

/** The whole portfolio as a zip: portfolio.html (opens in any browser, printable to pdf) and the folder bestanden. */
export async function portfolioZip(user: User, audience: "student" | "owner"): Promise<{ data: Buffer; fileName: string }> {
  const portfolio = await loadPortfolio(user.id, audience);
  const files = portfolioFiles(portfolio);
  const pathById = new Map(files.map((f) => [f.file.id, f.path]));
  const now = new Date().toISOString();
  const html = portfolioHtml(portfolio, {
    studentName: user.name,
    generatedAt: now,
    formatDate: formatDateTime,
    hrefFor: (file) => encodeURI(pathById.get(file.id) ?? ""),
  });
  const entries: ZipEntry[] = [
    { name: "portfolio.html", data: Buffer.from(html, "utf8"), compress: true },
    ...(await filesForZip(files.map((f) => ({ id: f.file.id, path: f.path })))),
  ];
  return { data: createZip(entries), fileName: `${safeFileName(`Portfolio ${user.name}`)} ${now.slice(0, 10)}.zip` };
}

export const zipResponse = (data: Buffer, fileName: string) =>
  new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(data.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
