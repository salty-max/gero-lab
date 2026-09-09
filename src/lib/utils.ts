import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function toU8(s: string) {
  return parseInt(s, 16) & 0xff
}

export function toU16(s: string) {
  return parseInt(s, 16) & 0xffff
}
