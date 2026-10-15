"use client";

import * as React from "react";
import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refreshBrief } from "./actions";

export function RefreshBrief() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await refreshBrief();
          if (!r.ok) return void toast.error(r.error);
          router.refresh();
        })
      }
    >
      <RotateCw className="size-3.5" /> Nov povzetek
    </Button>
  );
}
