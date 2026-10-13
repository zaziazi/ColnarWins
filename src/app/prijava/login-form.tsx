"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);

    const supabase = createClient();
    // A bare username (no @) is mapped to its internal address; real e-mail logins still work.
    const login = email.includes("@") ? email.trim() : `${email.trim().toLowerCase()}@colnix.invalid`;
    const { error } = await supabase.auth.signInWithPassword({ email: login, password });

    setPending(false);
    if (error) {
      toast.error("Napačno uporabniško ime ali geslo.");
      return;
    }
    router.push("/pisarna");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <FieldLabel>Uporabniško ime</FieldLabel>
        <Input
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="npr. janez"
        />
      </div>
      <div>
        <FieldLabel>Geslo</FieldLabel>
        <Input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" size="lg" loading={pending}>
        Prijava
      </Button>
    </form>
  );
}
