import { types } from '@wailsjs/go/models'

const hostMetadataStorageKey = 'devtools:ssh-host-metadata'

export interface SSHHostMetadata {
  tags: string[]
  favorite: boolean
}

export type SSHHostMetadataMap = Record<string, SSHHostMetadata>

export interface SSHHostFilterOptions {
  query: string
  tag: string
  favoritesOnly: boolean
}

export function parseHostTags(value: string): string[] {
  const seen = new Set<string>()
  return value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => {
      if (!tag || seen.has(tag)) return false
      seen.add(tag)
      return true
    })
}

export function filterSSHHosts(
  hosts: types.SSHHost[],
  metadata: SSHHostMetadataMap,
  options: SSHHostFilterOptions
): types.SSHHost[] {
  const query = options.query.trim().toLowerCase()

  return hosts.filter((host) => {
    const hostMetadata = metadata[host.alias] ?? createEmptyHostMetadata()
    if (options.favoritesOnly && !hostMetadata.favorite) return false
    if (options.tag !== 'all' && !hostMetadata.tags.includes(options.tag)) {
      return false
    }
    if (!query) return true

    return getHostSearchText(host, hostMetadata.tags).includes(query)
  })
}

export function getAllHostTags(metadata: SSHHostMetadataMap): string[] {
  return Array.from(
    new Set(Object.values(metadata).flatMap((item) => item.tags))
  )
    .filter(Boolean)
    .sort()
}

export function loadSSHHostMetadata(): SSHHostMetadataMap {
  try {
    const raw = window.localStorage.getItem(hostMetadataStorageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, Partial<SSHHostMetadata>>
    if (!parsed || typeof parsed !== 'object') return {}

    return Object.fromEntries(
      Object.entries(parsed).map(([alias, item]) => [
        alias,
        {
          favorite: Boolean(item.favorite),
          tags: Array.isArray(item.tags)
            ? item.tags.filter((tag) => typeof tag === 'string')
            : [],
        },
      ])
    )
  } catch {
    return {}
  }
}

export function saveSSHHostMetadata(metadata: SSHHostMetadataMap): void {
  window.localStorage.setItem(hostMetadataStorageKey, JSON.stringify(metadata))
}

export function createEmptyHostMetadata(): SSHHostMetadata {
  return { tags: [], favorite: false }
}

function getHostSearchText(host: types.SSHHost, tags: string[]): string {
  return [
    host.alias,
    host.hostName,
    host.user,
    host.port,
    host.identityFile,
    ...tags,
  ]
    .filter((value) => value !== undefined && value !== null)
    .join(' ')
    .toLowerCase()
}
