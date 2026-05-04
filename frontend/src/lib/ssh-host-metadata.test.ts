import { describe, expect, it } from 'vitest'
import { types } from '@wailsjs/go/models'
import {
  filterSSHHosts,
  getAllHostTags,
  parseHostTags,
  type SSHHostMetadataMap,
} from './ssh-host-metadata'

function makeHost(alias: string, hostName = `${alias}.example.com`) {
  return {
    alias,
    hostName,
    user: 'root',
    port: '22',
    identityFile: '',
  } as types.SSHHost
}

describe('ssh host metadata', () => {
  it('normalizes tags and removes duplicates', () => {
    expect(parseHostTags('Prod, db, prod, , VPN')).toEqual([
      'prod',
      'db',
      'vpn',
    ])
  })

  it('filters hosts by query, tag, and favorite state', () => {
    const metadata: SSHHostMetadataMap = {
      'prod-db': { tags: ['prod', 'db'], favorite: true },
      staging: { tags: ['staging'], favorite: false },
    }

    expect(
      filterSSHHosts([makeHost('prod-db'), makeHost('staging')], metadata, {
        query: 'db',
        tag: 'prod',
        favoritesOnly: true,
      }).map((host) => host.alias)
    ).toEqual(['prod-db'])
  })

  it('collects all host tags alphabetically', () => {
    expect(
      getAllHostTags({
        a: { tags: ['prod', 'db'], favorite: false },
        b: { tags: ['vpn', 'db'], favorite: true },
      })
    ).toEqual(['db', 'prod', 'vpn'])
  })
})
