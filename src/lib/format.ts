/**
 * Formatting machine values for display.
 *
 * These replace the source application's `@gero/util`. They are not
 * toolchain logic — masking and hex-padding a number is arithmetic, not
 * semantics — so they carry none of the drift risk §11 is about.
 */

export const u16 = (n: number): number => n & 0xffff;

export const u8 = (n: number): number => n & 0xff;

/** A 16-bit value as `0xXXXX`, or bare hex without the prefix. */
export const fmt16 = (v: number, bare = false): string =>
  `${bare ? "" : "0x"}${u16(v).toString(16).toUpperCase().padStart(4, "0")}`;

/** An 8-bit value as `0xXX`, or bare hex without the prefix. */
export const fmt8 = (v: number, bare = false): string =>
  `${bare ? "" : "0x"}${u8(v).toString(16).toUpperCase().padStart(2, "0")}`;
