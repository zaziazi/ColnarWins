"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <>
      <Button variant="secondary" asChild>
        <Link href="/klub/pregled">
          <ArrowLeft /> Nazaj
        </Link>
      </Button>
      <Button onClick={() => window.print()}>
        <Printer /> Natisni
      </Button>
    </>
  );
}
