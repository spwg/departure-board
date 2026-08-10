import type { BoardChoice } from "@/lib/boardChoices";
import { DepartureBoard } from "./DepartureBoard";
import { SubwayBoard } from "./SubwayBoard";

/** Renders the provider-owned board selected by a direct station route. */
export function TransferBoard({
  choice,
  direction,
}: {
  choice: BoardChoice;
  direction?: string;
}) {
  return choice.system === "njt" ? (
    <DepartureBoard code={choice.stationId} />
  ) : (
    <SubwayBoard
      stationId={choice.stationId}
      direction={direction}
      limit={direction === undefined ? 3 : null}
      expandComplex={false}
    />
  );
}
