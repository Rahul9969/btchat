import {
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  GROUP_NAME_MAX,
  GROUP_NAME_MIN,
} from "./ble/constants";

/** Counts Unicode code points, so one emoji counts as one character. */
export function charCount(value: string): number {
  return Array.from(value).length;
}

function validateLength(value: string, min: number, max: number, label: string): string | null {
  const length = charCount(value.trim());
  if (length < min) return `${label} is required.`;
  if (length > max) return `${label} must be ${max} characters or fewer.`;
  return null;
}

/** Returns an error message, or null when the value is valid. */
export function validateGroupName(value: string): string | null {
  return validateLength(value, GROUP_NAME_MIN, GROUP_NAME_MAX, "Group name");
}

/** Returns an error message, or null when the value is valid. */
export function validateDisplayName(value: string): string | null {
  return validateLength(value, DISPLAY_NAME_MIN, DISPLAY_NAME_MAX, "Display name");
}

/** Makes a name from a remote device safe to show: trimmed, cut to `max`, never empty. */
export function sanitizeName(value: string, max: number, fallback: string): string {
  const cut = Array.from(value.trim()).slice(0, max).join("");
  return cut.length > 0 ? cut : fallback;
}
