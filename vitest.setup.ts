import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// jsdom's structuredClone does not preserve Blob instances (returns {}).
// Patch it so that Blob values are preserved by reference, matching the
// IndexedDB spec which allows Blobs to be stored and retrieved intact.
const _nativeStructuredClone = globalThis.structuredClone
globalThis.structuredClone = function patchedStructuredClone<T>(value: T, options?: StructuredSerializeOptions): T {
  if (value instanceof Blob) return value as unknown as T
  if (value !== null && typeof value === 'object') {
    // Shallow-scan one level to patch Blob properties (covers MediaAsset etc.)
    const plain = value as Record<string, unknown>
    const blobKeys = Object.keys(plain).filter((k) => plain[k] instanceof Blob)
    if (blobKeys.length > 0) {
      const clone = _nativeStructuredClone(value, options)
      for (const k of blobKeys) (clone as Record<string, unknown>)[k] = plain[k]
      return clone
    }
  }
  return _nativeStructuredClone(value, options)
}

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}
