"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// A GET filter form with no submit button: every control navigates as soon
// as it changes (selects and date inputs fire a native `change`;
// MultiSelectDropdown dispatches one too), same behaviour as the LinkSelect
// rows on Races/Rankings. Empty values are dropped from the URL, except
// `month`, where "" is meaningful: it means "all year" and stops the page
// falling back to the current month.
export default function CalendarAutoForm({
  action,
  className,
  children,
}: {
  action: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    const go = () => {
      const params = new URLSearchParams();
      for (const [k, v] of new FormData(form)) {
        if (typeof v !== "string") continue;
        if (v === "" && k !== "month") continue;
        params.append(k, v);
      }
      router.push(`${action}?${params.toString()}`);
    };
    form.addEventListener("change", go);
    return () => form.removeEventListener("change", go);
  }, [action, router]);

  return (
    <form ref={ref} action={action} className={className} onSubmit={(e) => e.preventDefault()}>
      {children}
    </form>
  );
}
