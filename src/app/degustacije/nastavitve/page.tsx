import { redirect } from "next/navigation";

/** Settings moved to the Admin section. */
export default function OldSettingsPage() {
  redirect("/admin/degustacije");
}
