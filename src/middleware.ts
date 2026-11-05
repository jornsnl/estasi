import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase mode only: refreshes the short lived access token before the page
 * renders (Server Components cannot write cookies themselves). In local mode
 * this does nothing.
 */
export async function middleware(request: NextRequest) {
  if (process.env.DATA_BACKEND !== "supabase") return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  // Validates the token and refreshes it when it is about to expire.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  runtime: "nodejs",
  // Skip static files and images; everything else may need a fresh session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
