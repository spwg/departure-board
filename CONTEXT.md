# Departure Board

This context presents time-sensitive NJ TRANSIT rail departure information for a rider at a station.

## Language

**Departure board**:
A live, station-centred view of upcoming NJ TRANSIT rail departures and their operational status. It is not a trip planner.
_Avoid_: Journey planner, route planner

**Watch**:
A client-side subscription to one or more exact upcoming departures, including departures at different stations. A watch ends when its departure leaves the live board; it produces no alerts after the page is closed.
_Avoid_: Commute alert, station alert

**Watch key**:
The globally unique identity of a watch: station code, train number, and scheduled departure instant. The scheduled instant distinguishes daily reuse of the same train number.
_Avoid_: Train number, station watch

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
The home-page list of all current watches, regardless of station. Each item identifies its station and exposes its latest expected time or status and an Unwatch control.
_Avoid_: Favorite trains, commute tracker

**Service banner**:
A contextual board warning linking to an official NJ TRANSIT alert that affects the current station or one of its rail lines. It includes active disruptions and planned service advisories.
_Avoid_: Alert feed, global announcement

**Service-alert source**:
NJ TRANSIT's official Rail Advisories RSS feed, read through a briefly cached server-side adapter. Each service banner links to its original NJ TRANSIT notice.
_Avoid_: Scraped alert page, third-party alert feed

**Service advisory**:
An announced future or ongoing service change that affects a station or rail line. It is distinct from an active disruption and is presented with lower-severity styling.
_Avoid_: Disruption, delay

**Service-status summary**:
A compact expandable banner representing all relevant service notices, including active disruptions. It displays an urgency-aware count first and reveals the individual official notices and links on expansion.
_Avoid_: Alert stack, full alert feed

**Active disruption**:
A current service interruption relevant to the board. It is represented in the collapsed service-status summary and retains high-severity styling when expanded.
_Avoid_: Service advisory, planned work

**Train-page service status**:
Service banners on a train's stop list that are relevant to that train's rail line only. Station-specific notices appear only on their station board.
_Avoid_: Route-wide station notices, all station alerts

**Dismissed service banner**:
A locally hidden, exact official alert. The dismissal ends when NJ TRANSIT removes or materially changes that alert and never suppresses unrelated alerts.
_Avoid_: Muted line, dismissed station

**Freshness warning**:
A non-dismissible banner stating that shown rail data is no longer live and how long ago the most recent live response arrived. It clears after the next successful live response.
_Avoid_: Offline notice, data alert

**Station picker**:
The home-page station selection screen. It opens without redirecting and presents recent stations, then the nearest station, followed by search and the full directory.
_Avoid_: Default station, launch redirect

**Line filter**:
A multi-select filter on the station picker. A station matches when it is served by at least one selected rail line.
_Avoid_: Single-line mode, route filter

**Recent stations**:
The five most recently opened stations, ordered newest first. Reopening a station moves it to the front; riders can clear the history with a brief Undo action, after which it repopulates from newly opened stations.
_Avoid_: Default station, favorite stations

**Station-picker provenance label**:
The visible explanation of why a station appears in a top picker section: “Recent stations” for browsing history and “Nearest station” with its distance for geolocation.
_Avoid_: Unlabelled suggestions, recommended station
