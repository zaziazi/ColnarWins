import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/prijava");
  const forced = user.user_metadata?.must_change_password === true;

  return (
    <div className="min-h-dvh grid place-items-center px-5">
      <div className="w-full max-w-[380px]">
        <div className="text-center mb-7">
          <p className="font-bold text-lg tracking-[-0.01em]">
            Colnix<span className="text-wine">.</span>
          </p>
          <p className="text-[13px] text-ink-muted mt-1">
            {forced ? "Pred nadaljevanjem si izberi novo geslo." : "Sprememba gesla"}
          </p>
        </div>
        <Card className="p-5 shadow-card">
          <PasswordForm />
        </Card>
      </div>
    </div>
  );
}
