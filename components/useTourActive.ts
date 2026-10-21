"use client";

import { useEffect, useState } from "react";

const TOUR_EVENT = "aced:tour-active";

/** Tells dismissible dashboard tiles to show themselves while the student tour runs. */
export function setTourActiveFlag(on: boolean) {
  try {
    if (on) document.documentElement.dataset.acedTour = "1";
    else delete document.documentElement.dataset.acedTour;
    window.dispatchEvent(new Event(TOUR_EVENT));
  } catch {}
}

export function useTourActive() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const read = () => setOn(document.documentElement.dataset.acedTour === "1");
    read();
    window.addEventListener(TOUR_EVENT, read);
    return () => window.removeEventListener(TOUR_EVENT, read);
  }, []);
  return on;
}
