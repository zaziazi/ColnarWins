"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { changePassword } from "./actions";

export function PasswordForm() {
  const [password, setPassword] = React.useState("");
  const [repeat, setRepeat] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      // On success the action redirects, so a returned value is always an error.
      const result = await changePassword({ password, repeat });
      if (result && !result.ok) toast.error(result.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <FieldLabel>Novo geslo</FieldLabel>
        <Input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-[11.5px] text-ink-subtle mt-1">Vsaj 8 znakov.</p>
      </div>
      <div>
        <FieldLabel>Ponovi geslo</FieldLabel>
        <Input
          type="password"
          autoComplete="new-password"
          required
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
      </div>
      <Button type="submit" size="lg" loading={pending}>
        Shrani geslo
      </Button>
    </form>
  );
}
