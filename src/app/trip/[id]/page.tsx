import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TripView } from "@/components/TripView";
import { DESTINATIONS, getDestination } from "@/lib/data/destinations";

export function generateStaticParams() {
  return DESTINATIONS.map((d) => ({ id: d.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const d = getDestination(id);
  return { title: d ? `${d.name} trip plan` : "Trip plan" };
}

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getDestination(id)) notFound();
  return (
    <Suspense>
      <TripView destinationId={id} />
    </Suspense>
  );
}
