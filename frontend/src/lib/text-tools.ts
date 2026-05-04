const base64Pattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export function encodeBase64Text(value: string): string {
  return bytesToBase64(new TextEncoder().encode(value))
}

export function decodeBase64Text(value: string): string {
  const normalized = value.trim()
  if (!normalized || !base64Pattern.test(normalized)) {
    throw new Error('Invalid Base64 input.')
  }

  try {
    const bytes = base64ToBytes(normalized)
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('Invalid Base64 input.')
  }
}

export function encodeUrlText(value: string): string {
  return encodeURIComponent(value)
}

export function decodeUrlText(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    throw new Error('Invalid URL encoded input.')
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
