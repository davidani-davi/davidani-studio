import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** beUI's class merger. Vendored from beui.dev alongside its components. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
