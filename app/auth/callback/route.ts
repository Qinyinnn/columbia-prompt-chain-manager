import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const safeDashboardPaths = new Set(["/", "/history", "/prompt-chains"]);

function redirectTo(request: Request, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedPath = url.searchParams.get("next") ?? "/";
  const nextPath = safeDashboardPaths.has(requestedPath) ? requestedPath : "/";

  if (!code) return redirectTo(request, "/login?error=missing_code");

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) return redirectTo(request, "/login?error=auth_failed");

  // Verify the cookie-backed session with Supabase Auth before checking access.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return redirectTo(request, "/login?error=verification_failed");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || profile?.is_superadmin !== true) {
    return redirectTo(request, "/access-denied");
  }

  return redirectTo(request, nextPath);
}
