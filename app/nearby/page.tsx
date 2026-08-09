import type { Metadata } from "next";
import { NearbyStations } from "@/components/NearbyStations";

export const metadata: Metadata = {
  title: "Nearby",
};

export default function NearbyPage() {
  return <NearbyStations />;
}
