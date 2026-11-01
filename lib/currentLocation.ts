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

const OPT_IN_KEY = "departure-board:location-enabled";

function rememberedOptIn(): boolean {
  try {
    return window.localStorage.getItem(OPT_IN_KEY) === "true";
  } catch {
    return false;
  }
}

function rememberOptIn(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(OPT_IN_KEY, "true");
    else window.localStorage.removeItem(OPT_IN_KEY);
  } catch {
    // Location still works when browser storage is unavailable.
  }
}

/**
 * The rider's location for Nearby. Remember an opt-in across visits, including
 * browsers whose permission remains "prompt" or cannot be queried. Browser
 * permission is still authoritative; a refusal clears the opt-in. Reuse a
 * browser-cached position for at most five minutes, never an old saved fix.
 */
export function useCurrentLocation(enabled: boolean) {
  const [state, setState] = useState<LocationState>({ status: "checking" });

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setState({ status: "off" });
      return;
    }
    rememberOptIn(true);
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
      (error) => {
        if (error.code === 1) rememberOptIn(false);
        setState({ status: error.code === 1 ? "off" : "unavailable" });
      },
      { timeout: 8000, maximumAge: 5 * 60_000 },
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // An explicit denial wins over our remembered preference. With "prompt"
    // or no Permissions API, a returning opted-in rider still wants a lookup.
    const permissions = "permissions" in navigator ? navigator.permissions : undefined;
    (permissions?.query({ name: "geolocation" }) ?? Promise.reject())
      .then((status) => {
        if (cancelled) return;
        if (status.state === "denied") {
          rememberOptIn(false);
          setState({ status: "off" });
        } else if (status.state === "granted" || rememberedOptIn()) locate();
        else setState({ status: "off" });
      })
      .catch(() => {
        if (cancelled) return;
        if (rememberedOptIn()) locate();
        else setState({ status: "off" });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, locate]);

  return { state, locate };
}
