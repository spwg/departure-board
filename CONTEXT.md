# Departure Board

This context presents time-sensitive public-transit departure information for a rider at or transferring through a station.

## Language

**Station**:
A transit system's own named boarding location or station complex. Stations belonging to different systems remain distinct even when they occupy the same place or support a transfer between them.
_Avoid_: Universal station, merged station

**Interchange**:
A rider-recognized transfer hub connecting two or more provider-owned boarding locations. It groups transfer choices but owns no live departure data and never becomes a merged feed.
_Avoid_: Merged station, shared feed, system switcher

**Transfer node**:
One provider-owned boarding location or line group inside an Interchange, such as NJT, 1/2/3, or A/C/E at Penn. It opens one provider's departure board.
_Avoid_: System view, universal station

**Transfer option**:
A permitted origin-to-target connection between two Transfer nodes. It describes navigation availability, not a guaranteed or recommended catchable connection.
_Avoid_: Connection recommendation, itinerary

**Transfer context**:
The exact originating train and Transfer node carried into a target board so its live departures can begin after that train's arrival at the correct boarding location.
_Avoid_: Copied timestamp, trip planner

**System chip**:
The NJT or Subway label shown on Home and Interchange items where both systems appear together. Color may reinforce the label but never replaces its text.
_Avoid_: Color-only system indicator, per-row board label

**Departure board**:
A live, station-centred view of upcoming departures for one transit system and their operational status. Rail and subway departures remain separate boards even when they share a station; a departure board is not a trip planner.
_Avoid_: Combined operations list, journey planner, route planner

**Rail departure board**:
A departure board for NJ TRANSIT rail service at one rail station, serving a rider who is targeting one particular train.
_Avoid_: Subway board, combined board

**Subway departure board**:
A departure board for NYC Subway service at one subway station or station complex, serving a rider who takes whichever train comes next.
_Avoid_: Rail board, combined board

**Interchange transfer board**:
An Interchange node's departure board opened from one exact train at another node, with its starting-time filter preset to that train's expected arrival and no judgment about which transfers are catchable.
_Avoid_: Transfer outlook, connection recommendation

**Destination**:
A transit system's own rider-facing label for where a train is headed, kept consistent with its station signs and train displays. When a live Subway trip cannot be joined reliably to its published headsign, the official name of its final remaining stop is the destination; destinations are never normalized into shared cross-system labels.
_Avoid_: App-defined direction, universal destination

**Direction group**:
A simultaneously visible subway-board section labeled with MTA's own station-direction wayfinding, with departures ordered chronologically inside it. Complex members merge only when their published labels match, falling back to provider-native destinations rather than cardinal wording. It stands in for the platform a rider has not yet chosen, so it exists only on subway boards; rail boards list every departure in one chronological sequence, as the station's own board does.
_Avoid_: Inferred direction, shared cross-system direction, rail direction group

**Next stop**:
The first stop a subway departure makes after the board's station, shown as the rider's boarding cue in the same terms as the sign inside the train. A departure with no later stop is not a departure, so every row has one.
_Avoid_: Following station, upcoming stops, skipped stops

**Remaining route**:
The upcoming stops for one exact train, beginning at its current or next stop and ending at its live destination. Passed stops and their times are not part of the remaining route.
_Avoid_: Trip history, full timetable

**Service banner**:
A contextual board warning linking to an official alert from the board's transit system that affects the current station or one of its routes or lines. It includes active disruptions and planned service advisories.
_Avoid_: Alert feed, global announcement

**Service-alert source**:
The transit system's official alert feed, read through a briefly cached server-side adapter. Rail uses NJ TRANSIT Rail Advisories and Subway uses MTA service alerts; each service banner links to its original notice when one is available.
_Avoid_: Scraped alert page, third-party alert feed

**Service advisory**:
A future or ongoing service change announced by a transit system that affects a station or one of its routes or lines. It is distinct from an active disruption and is presented with lower-severity styling.
_Avoid_: Disruption, delay

**Service-status summary**:
The single collapsed line standing for every service notice relevant to a board. It displays their counts first and reveals the individual official notices and links on expansion. It is the only form in which service notices appear above departures.
_Avoid_: Alert stack, full alert feed, expanded banner

**Active disruption**:
A current service interruption relevant to the board, as distinct from a planned advisory. Providers mark currency, not consequence, so a disruption is counted and styled within the service-status summary rather than granted space above the departures.
_Avoid_: Service advisory, planned work, severe alert

**Train-page service status**:
Service banners on a train's remaining route that are relevant to that train's route or line only. Station-specific notices appear only on their station board.
_Avoid_: Unrelated station notices, all station alerts

**Dismissed service banner**:
A locally hidden, exact official alert. The dismissal ends when its transit system removes or materially changes that alert and never suppresses unrelated alerts.
_Avoid_: Muted line, dismissed station

**Freshness warning**:
A non-dismissible banner stating that shown realtime departure data is no longer live and how long ago the most recent live response arrived. It clears after the next successful live response.
_Avoid_: Offline notice, data alert

**Station picker**:
The home-page selection screen for both rail and subway departure boards. It opens without redirecting and shows saved favorite board choices in one list, followed by search and the full directory. Nearby choices have their own page. Recent station history remains recorded locally but is not shown on Home for now.
_Avoid_: Default station, launch redirect

**Nearby stations**:
Provider-qualified board choices whose published coordinates are within two miles of the rider's current location, ordered closest first. Interchange views remain separate system-specific choices.
_Avoid_: Closest station only, merged station

**Recent stations**:
The five most recently opened system-specific station-board choices, kept in one list and ordered newest first. Reopening a board moves it to the front; the history remains recorded locally for a future picker treatment.
_Avoid_: Default station, favorite stations

**Favorite stations**:
The rider's locally saved system-specific station-board choices, kept together for quick access from the station picker.
_Avoid_: Recent stations, default stations

**Station-picker provenance label**:
The visible badge explaining why a board choice appears in the combined picker list: “fav” for a saved favorite and “nearby” for geolocation. Nearby choices also show their distance; when the nearest station belongs to an Interchange, each system-specific choice shares that provenance.
_Avoid_: Unlabelled suggestions, recommended station

### Navigation language

**Breadcrumb trail**:
An ordered sequence of links to parent pages, ending at the current page. It shows the rider's location in the board hierarchy; it is not a list of arbitrary categories.
_Avoid_: Category path, navigation menu

**Transfer node selector**:
A visible control for choosing among peer Transfer nodes within one Interchange, such as NJT, 1/2/3, and A/C/E. Its choices are transfer targets, not nested breadcrumb levels.
_Avoid_: System switcher, breadcrumb segment

**Navigation drawer**:
An edge-opening panel containing top-level destinations, with the board temporarily unavailable behind it while the panel is open on a phone.
_Avoid_: Popover, context menu

**Popover**:
A small temporary panel anchored to a control, used for short contextual choices rather than the app's page hierarchy.
_Avoid_: Navigation drawer, breadcrumb trail
