import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export type WithElementRef<T> = T & { ref?: HTMLElement | null };
export type WithoutChildren<T> = Omit<T, "children">;

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
