import { redirect } from "next/navigation";
import { EVENT_GROUPS } from "@/lib/events";
import { eventSlug } from "@/lib/slugs";

export default function DisciplinesIndex() {
  redirect(`/disciplines/${eventSlug(EVENT_GROUPS[0].events.Men[0])}`);
}
