/**
 * Shapes shared between the editor and its inspector.
 *
 * The nesting mirrors the database, which mirrors the domain: a throw is a place a
 * grenade lands, a lineup is one way to get it there, and a shot is a screenshot of
 * that way. Collapsing lineups into the throw allowed exactly one origin per landing
 * point, which is the bug this structure exists to fix.
 */

import type { Click, LineupSide, Movement, Precision } from "@/lib/lineup-meta";
export type { Click, LineupSide, Movement, Precision };

export type UtilKind = "smoke" | "flash" | "he" | "molotov" | "decoy";
export type ActionKind = "hold" | "entry" | "trade" | "lurk" | "drop" | "throw" | "support";
export type ShotKind = "stand" | "crosshair" | "result";

export interface EditorPlayer {
  steamid64: string;
  nickname: string;
}

export interface EditorShot {
  id: string;
  shotKind: ShotKind;
  idx: number;
}

/** One way to land the throw: where you stand, how you throw, and the screenshots. */
export interface EditorLineup {
  id: string;
  name: string | null;
  throwX: number | null;
  throwY: number | null;
  throwZ: number | null;
  /** From getpos. Null when the spot was clicked on the radar. */
  pitch: number | null;
  yaw: number | null;
  side: LineupSide | null;
  movement: Movement;
  jump: boolean;
  click: Click;
  precision: Precision | null;
  fromCallout: string | null;
  steps: string | null;
  note: string | null;
  shots: EditorShot[];
}

/** Where a grenade lands. Map-scoped and shared by every strat that references it. */
export interface EditorThrow {
  id: string;
  name: string;
  kind: UtilKind;
  /** Null when imported: the screenshots are known, the position is not yet. */
  landX: number | null;
  landY: number | null;
  landZ: number | null;
  level: string;
  note: string | null;
  lineups: EditorLineup[];
  usedBy?: number;
}

/** A throw used in one phase of one strat, by one player. Strat-local. */
export interface EditorUse {
  id: string;
  throwId: string;
  throwerSteamid64: string | null;
  note: string | null;
}

export interface EditorAssignment {
  id: string;
  playerSteamid64: string | null;
  x: number | null;
  y: number | null;
  z: number | null;
  level: string;
  action: ActionKind;
  note: string | null;
}

export interface EditorPhase {
  id: string;
  name: string;
  clockOffsetS: number;
  note: string | null;
  assignments: EditorAssignment[];
  utility: EditorUse[];
}

export interface EditorState {
  version: number;
  name: string;
  kind: string;
  target: string | null;
  status: string;
  description: string | null;
  phases: EditorPhase[];
}

export const UTIL_META: Record<UtilKind, { label: string; glyph: string; colour: string; key: string }> = {
  smoke: { label: "Smoke", glyph: "●", colour: "#cfd8dc", key: "1" },
  flash: { label: "Flash", glyph: "◎", colour: "#ffd257", key: "2" },
  he: { label: "HE", glyph: "✳", colour: "#e57373", key: "3" },
  molotov: { label: "Molotov", glyph: "▲", colour: "#ff8a4c", key: "4" },
  decoy: { label: "Decoy", glyph: "◌", colour: "#90a4ae", key: "5" },
};

export const ACTIONS: ActionKind[] = [
  "hold", "entry", "trade", "lurk", "drop", "throw", "support",
];
