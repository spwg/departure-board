"use client";

import { useCallback, useEffect, useState } from "react";

export type Coordinates = {
  latitude: number;
  longitude: number;
};

/**
 * Where Home's Nearby section stands. `checking` is the moment before the
 * browser says whether location is already allowed; `off` covers both a
 * rider who has not turned location on and one who said no, since the app
 * cannot reliably tell them apart and treats them the same.
 */
export type LocationState =
  | { status: "checking" }
  | { status: "off" }
  | { status: "locating" }
  | { status: "unavailable" }
  | { status: "found"; coordinates: Coordinates };

/**
 * The rider's location for Nearby. It is looked up without asking only when
 * the browser already allows it; otherwise nothing happens until the rider
 * taps, and the browser decides whether to prompt. The app stores nothing,
 * so the browser's own permission is the only memory.
 */
export function useCurrentLocation(enabled: boolean) {
  const [state, setState] = useState<LocationState>({ status: "checking" });

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setState({ status: "off" });
      return;
    }
    setState({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) => setState({
        status: "found",
        coordinates: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
      }),
      // A refusal, from the prompt or a setting, turns Nearby off; anything
      // else (no fix underground, a timeout) is worth another try.
      (error) => setState({ status: error.code === 1 ? "off" : "unavailable" }),
      { timeout: 8000, maximumAge: 5 * 60_000 },
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // Only "granted" is trusted: Safari reports "prompt" even for a site the
    // rider has denied, so anything else waits for a tap.
    const permissions = "permissions" in navigator ? navigator.permissions : undefined;
    (permissions?.query({ name: "geolocation" }) ?? Promise.reject())
      .then((status) => {
        if (cancelled) return;
        if (status.state === "granted") locate();
        else setState({ status: "off" });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "off" });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, locate]);

  return { state, locate };
}
