import { Suspense } from "react";
import { StationPicker } from "@/components/StationPicker";


export default function Home() {
  // StationPicker reads search params, which are only known at request time.
  return (
    <Suspense>
      <StationPicker />
    </Suspense>
  );
}
