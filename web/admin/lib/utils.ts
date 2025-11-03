import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Masks an API key for secure display
 * @param apiKey - The API key to mask
 * @returns Masked API key showing only first and last few characters
 *
 * @example
 * maskApiKey('sk-1234567890abcdef') // 'sk-1***cdef'
 * maskApiKey('short') // 'sh***rt'
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey) return ''

  const len = apiKey.length

  // For very short keys (< 8 chars), show first 2 and last 2
  if (len <= 8) {
    if (len <= 4) return '***'
    return `${apiKey.slice(0, 2)}***${apiKey.slice(-2)}`
  }

  // For longer keys, show first 4 and last 4
  return `${apiKey.slice(0, 4)}***${apiKey.slice(-4)}`
}
