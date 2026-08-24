"use client";

import { useEffect } from "react";
import { bootLevelsCatalog } from "./boot";

/**
 * Starts the local Level catalog database and its replication, once on
 * first mount — mirrors AuthBoot's pattern for the auth store.
 */
export function LevelsCatalogBoot() {
  useEffect(() => {
    void bootLevelsCatalog();
  }, []);

  return null;
}
