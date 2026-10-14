"use client";
import { createContext } from "react";
/** Only the visible hero slide owns the page h1; other scenes keep their level. */
export const ActiveCarouselSlide = createContext(true);
