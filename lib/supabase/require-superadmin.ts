import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "./server";

/**
 * Verify the current user with Supabase Auth and require a superadmin profile.
 * Call this inside every protected server action and Route Handler as well as
 * from the dashboard layout; a layout guard does not authorize those endpoints.
 */
export async function requireSuperadmin() {
  // Supabase Auth checks token expiry using the request clock. Keep it out of
  // Next.js prerendering when Cache Components are enabled.
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || profile?.is_superadmin !== true) {
    redirect("/access-denied");
  }

  return { supabase, user, profile };
}
