import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Refreshes the auth session on every request and guards protected routes. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Demo mode: no Supabase configured, so there is nothing to protect.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not remove: this call is what refreshes an expiring session.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic =
    request.nextUrl.pathname.startsWith("/prijava") ||
    request.nextUrl.pathname.startsWith("/dostava/"); // driver signed links

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/prijava";
    return NextResponse.redirect(url);
  }

  return response;
}
