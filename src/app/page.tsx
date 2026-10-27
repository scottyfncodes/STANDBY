import { Suspense } from "react";
import { DiscoverView } from "@/components/DiscoverView";

export default function Home() {
  return (
    <Suspense>
      <DiscoverView />
    </Suspense>
  );
}
