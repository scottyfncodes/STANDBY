"use client";

import { useEffect, useState } from "react";
import { todayIn } from "@/lib/engine/time";

/** Today's date in the device's zone, resolved after mount to avoid hydration mismatch. */
export function useToday(): string | null {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(todayIn()), []);
  return today;
}
