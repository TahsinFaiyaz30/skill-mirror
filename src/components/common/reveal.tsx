"use client";
import { useEffect } from "react";

// Eases landing sections in once as they scroll into view. Content stays
// visible without JavaScript and when the OS asks for reduced motion.
export function Reveal() {
  useEffect(() => {
    if (
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    )
      return;
    const items = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];
    // Whatever is already on screen shows at once, so nothing blinks out.
    for (const item of items)
      if (item.getBoundingClientRect().top < innerHeight)
        item.dataset.shown = "";
    const root = document.documentElement;
    root.dataset.revealReady = "";
    let seen = false;
    const observer = new IntersectionObserver(
      (entries) => {
        seen = true;
        for (const entry of entries)
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.shown = "";
            observer.unobserve(entry.target);
          }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    for (const item of items)
      if (!("shown" in item.dataset)) observer.observe(item);
    // If the browser never reports visibility (a background tab, say),
    // show everything so no content stays hidden.
    const guard = setTimeout(() => {
      if (!seen) for (const item of items) item.dataset.shown = "";
    }, 3000);
    return () => {
      clearTimeout(guard);
      observer.disconnect();
      delete root.dataset.revealReady;
    };
  }, []);
  return null;
}
