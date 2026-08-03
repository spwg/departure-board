# Departure Board

This context presents time-sensitive public-transit departure information for a rider at or transferring through a station.

## Language

**Station**:
A transit system's own named boarding location or station complex. Stations belonging to different systems remain distinct even when they occupy the same place or support a transfer between them.
_Avoid_: Universal station, merged station

**Interchange**:
A rider-recognized connection among two or more system-owned stations. Its page presents one member system's departure board at a time, allows direct switching without merging their data, and keeps each member board's freshness and availability independent.
_Avoid_: Merged station, shared feed

**System chip**:
The NJT or Subway label shown on Home and Interchange items where both systems appear together. Color may reinforce the label but never replaces its text.
_Avoid_: Color-only system indicator, per-row board label

**Departure board**:
A live, station-centred view of upcoming departures for one transit system and their operational status. Rail and subway departures remain separate boards even when they share a station; a departure board is not a trip planner.
_Avoid_: Combined operations list, journey planner, route planner

**Rail departure board**:
A departure board for NJ TRANSIT rail service at one rail station.
_Avoid_: Subway board, combined board

**Subway departure board**:
A departure board for NYC Subway service at one subway station or station complex.
_Avoid_: Rail board, combined board

**Interchange transfer board**:
An Interchange member's departure board opened from one exact train on another member system, with its starting-time filter preset to that train's expected arrival and no judgment about which transfers are catchable. At Penn, the Subway view combines both MTA stations into shared Uptown and Downtown groups containing all later 1/2/3/A/C/E trains.
_Avoid_: Transfer outlook, connection recommendation

**Destination**:
A transit system's own rider-facing label for where a train is headed, kept consistent with its station signs and train displays. When a live Subway trip cannot be joined reliably to its published headsign, the official name of its final remaining stop is the destination; destinations are never normalized into shared cross-system labels.
_Avoid_: App-defined direction, universal destination

**Destination filter**:
A departure-board filter that narrows trains by their provider-native destinations while leaving those labels unchanged.
_Avoid_: Cross-system direction filter, renamed destination

**Direction group**:
A simultaneously visible departure-board section labeled with the transit system's physical wayfinding language wherever official data supports it, with departures ordered chronologically inside it. Subway uses MTA station-direction labels, merging complex members only when their published labels match and falling back to provider-native destinations rather than cardinal wording; rail uses NJ TRANSIT's Eastbound or Westbound schedule metadata when it can be matched to a live departure, while unmatched departures remain ungrouped.
_Avoid_: Inferred direction, shared cross-system direction

**Remaining route**:
The upcoming stops for one exact train, beginning at its current or next stop and ending at its live destination. Passed stops and their times are not part of the remaining route.
_Avoid_: Trip history, full timetable

**Watch**:
A client-side subscription to one or more exact upcoming trains on either transit system, including trains at different stations. A watch ends when its train leaves the live board; it produces no alerts after the page is closed.
_Avoid_: Commute alert, station alert

**Watch key**:
The provider-qualified identity of one exact train at the watched station, composed from its transit system, station, and provider trip or departure identifiers. A route or train number alone is not a watch key.
_Avoid_: Route, train number, station watch

**Material change**:
A cancellation, a track assignment or change, or a change of at least two minutes to a watched departure's expected time.
_Avoid_: Update, minor change

**Client watcher**:
The open webpage's background process that polls every watched departure. It runs while the page remains open, including in a background tab, and stops when the page closes.
_Avoid_: Push service, background worker

**Watch alert**:
The visible notice for a material change to a watch: an in-page alert in an active tab or a browser notification in a background tab when permission is granted.
_Avoid_: Push notification, commuter alert

**Watch completion**:
The automatic removal of a watch after a successful live station response no longer contains its watch key. Stale or failed responses do not complete a watch, and completed watches leave no history.
_Avoid_: Expiry, timeout

**Watched departures**:
The home-page list of all current watches, regardless of station or transit system. Each item identifies its station, exposes its latest expected time or status and an Unwatch control, and opens the watched train's remaining route.
_Avoid_: Favorite trains, commute tracker

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
A compact expandable banner representing multiple relevant service notices. It displays their count first and reveals the individual official notices and links on expansion.
_Avoid_: Alert stack, full alert feed

**Active disruption**:
A current service interruption relevant to the board. It remains immediately visible even when planned service advisories are collapsed into the service-status summary.
_Avoid_: Service advisory, planned work

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
The home-page selection screen for both rail and subway departure boards. It opens without redirecting and presents recent stations, then the nearest station or its Interchange choices, followed by search and the full directory.
_Avoid_: Default station, launch redirect

**Recent stations**:
The five most recently opened system-specific station-board choices, kept in one list and ordered newest first. Reopening a board moves it to the front; riders can clear the history with a brief Undo action, after which it repopulates from newly opened boards.
_Avoid_: Default station, favorite stations

**Favorite stations**:
The rider's locally saved system-specific station-board choices, kept together for quick access from the station picker.
_Avoid_: Recent stations, default stations

**Station-picker provenance label**:
The visible explanation of why a board choice appears in a top picker section: “Recent stations” for browsing history and “Nearest station” with its distance for geolocation. When the nearest station belongs to an Interchange, each system-specific choice shares that provenance.
_Avoid_: Unlabelled suggestions, recommended station
