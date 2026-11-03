import { DashboardShell } from "@/app/components/dashboard-shell";
import { requireSuperadmin } from "@/lib/supabase/require-superadmin";

export const instant = false;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await requireSuperadmin();
  const profileName = [profile.first_name, profile.last_name]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  const displayName =
    profileName ||
    (typeof metadataName === "string" ? metadataName : "") ||
    user.email?.split("@")[0] ||
    "Account";

  return (
    <DashboardShell displayName={displayName} email={user.email ?? ""}>
      {children}
    </DashboardShell>
  );
}
