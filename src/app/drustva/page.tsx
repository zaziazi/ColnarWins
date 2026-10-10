import { redirect } from "next/navigation";

/** The module was renamed to Degustacije; old links land there. */
export default function OldDrustvaPage() {
  redirect("/degustacije");
}
