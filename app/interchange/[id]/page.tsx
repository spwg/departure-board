import { notFound, redirect } from "next/navigation";
import { INTERCHANGES, getInterchange, interchangeHref } from "@/lib/interchanges";

export function generateStaticParams() {
  return INTERCHANGES.map(({ id }) => ({ id }));
}

/** A bare Interchange URL opens its first system view rather than nothing. */
export default async function InterchangeIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const interchange = getInterchange(id);
  if (!interchange) notFound();
  redirect(interchangeHref(interchange, interchange.views[0]!));
}
