import { redirect } from "next/navigation";

/** The list is now a view switch inside Zemljevid; old links land there. */
export default function SalesListPage() {
  redirect("/prodaja?v=list");
}
