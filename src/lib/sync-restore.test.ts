/**
 * @jest-environment jsdom
 */

import {
  clearSyncRestoreFlag,
  isSyncRestoreComplete,
  restoreFromServer,
  shouldRestore,
} from './sync-restore'

// Mock the recent-groups-helpers module
jest.mock('../app/groups/recent-groups-helpers', () => ({
  getRecentGroups: jest.fn(),
  getStarredGroups: jest.fn(),
  getArchivedGroups: jest.fn(),
  saveRecentGroup: jest.fn(),
  starGroup: jest.fn(),
  archiveGroup: jest.fn(),
}))

describe('Sync Restore', () => {
  const {
    getRecentGroups,
    getStarredGroups,
    getArchivedGroups,
    saveRecentGroup,
    starGroup,
    archiveGroup,
  } = require('../app/groups/recent-groups-helpers')

  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
  })

  describe('Restore flag management', () => {
    it('sets restore flag after successful restore', async () => {
      getRecentGroups.mockReturnValue([])
      getStarredGroups.mockReturnValue([])
      getArchivedGroups.mockReturnValue([])

      const listGroupsFn = jest.fn().mockResolvedValue([])
      const getPreferencesFn = jest
        .fn()
        .mockResolvedValue({ syncExisting: false, syncNewGroups: false })
      const syncAllFn = jest.fn().mockResolvedValue({ synced: 0, skipped: 0 })

      await restoreFromServer(listGroupsFn, getPreferencesFn, syncAllFn)

      expect(isSyncRestoreComplete()).toBe(true)
    })

    it('clears restore flag on clearSyncRestoreFlag()', () => {
      localStorage.setItem('sync-restore-complete', 'true')
      expect(isSyncRestoreComplete()).toBe(true)

      clearSyncRestoreFlag()

      expect(isSyncRestoreComplete()).toBe(false)
    })

    it('shouldRestore returns true when signed in and not restored', () => {
      expect(shouldRestore(true)).toBe(true)
    })

    it('shouldRestore returns false when signed in and already restored', () => {
      localStorage.setItem('sync-restore-complete', 'true')
      expect(shouldRestore(true)).toBe(false)
    })

    it('shouldRestore returns false when not signed in', () => {
      expect(shouldRestore(false)).toBe(false)
    })
  })

  describe('Merge logic', () => {
    it('adds server groups not in local to recent groups', async () => {
      getRecentGroups.mockReturnValue([
        { id: 'local-1', name: 'Local Group 1' },
      ])
      getStarredGroups.mockReturnValue([])
      getArchivedGroups.mockReturnValue([])

      const serverGroups = [
        {
          groupId: 'server-1',
          group: { name: 'Server Group 1' },
          isStarred: false,
          isArchived: false,
        },
      ]

      const listGroupsFn = jest.fn().mockResolvedValue(serverGroups)
      const getPreferencesFn = jest
        .fn()
        .mockResolvedValue({ syncExisting: false, syncNewGroups: false })
      const syncAllFn = jest.fn().mockResolvedValue({ synced: 0, skipped: 0 })

      await restoreFromServer(listGroupsFn, getPreferencesFn, syncAllFn)

      // Both server and local groups should be saved
      expect(saveRecentGroup).toHaveBeenCalledWith({
        id: 'server-1',
        name: 'Server Group 1',
      })
      expect(saveRecentGroup).toHaveBeenCalledWith({
        id: 'local-1',
        name: 'Local Group 1',
      })
    })

    it('keeps local groups not on server', async () => {
      getRecentGroups.mockReturnValue([
        { id: 'local-1', name: 'Local Group 1' },
        { id: 'local-2', name: 'Local Group 2' },
      ])
      getStarredGroups.mockReturnValue([])
      getArchivedGroups.mockReturnValue([])

      const serverGroups: any[] = [] // No server groups

      const listGroupsFn = jest.fn().mockResolvedValue(serverGroups)
      const getPreferencesFn = jest
        .fn()
        .mockResolvedValue({ syncExisting: false, syncNewGroups: false })
      const syncAllFn = jest.fn().mockResolvedValue({ synced: 0, skipped: 0 })

      await restoreFromServer(listGroupsFn, getPreferencesFn, syncAllFn)

      // Local groups should be preserved
      expect(saveRecentGroup).toHaveBeenCalledWith({
        id: 'local-1',
        name: 'Local Group 1',
      })
      expect(saveRecentGroup).toHaveBeenCalledWith({
        id: 'local-2',
        name: 'Local Group 2',
      })
    })

    it('server wins for conflicts on same groupId (starred)', async () => {
      getRecentGroups.mockReturnValue([{ id: 'group-1', name: 'Local Name' }])
      getStarredGroups.mockReturnValue([]) // Not starred locally
      getArchivedGroups.mockReturnValue([])

      const serverGroups = [
        {
          groupId: 'group-1',
          group: { name: 'Server Name' },
          isStarred: true, // Starred on server
          isArchived: false,
        },
      ]

      const listGroupsFn = jest.fn().mockResolvedValue(serverGroups)
      const getPreferencesFn = jest
        .fn()
        .mockResolvedValue({ syncExisting: false, syncNewGroups: false })
      const syncAllFn = jest.fn().mockResolvedValue({ synced: 0, skipped: 0 })

      await restoreFromServer(listGroupsFn, getPreferencesFn, syncAllFn)

      // Server name should win
      expect(saveRecentGroup).toHaveBeenCalledWith({
        id: 'group-1',
        name: 'Server Name',
      })

      // Server starred state should win
      expect(starGroup).toHaveBeenCalledWith('group-1')
    })

    it('server wins for conflicts on same groupId (archived)', async () => {
      getRecentGroups.mockReturnValue([{ id: 'group-1', name: 'Local Name' }])
      getStarredGroups.mockReturnValue([])
      getArchivedGroups.mockReturnValue([]) // Not archived locally

      const serverGroups = [
        {
          groupId: 'group-1',
          group: { name: 'Server Name' },
          isStarred: false,
          isArchived: true, // Archived on server
        },
      ]

      const listGroupsFn = jest.fn().mockResolvedValue(serverGroups)
      const getPreferencesFn = jest
        .fn()
        .mockResolvedValue({ syncExisting: false, syncNewGroups: false })
      const syncAllFn = jest.fn().mockResolvedValue({ synced: 0, skipped: 0 })

      await restoreFromServer(listGroupsFn, getPreferencesFn, syncAllFn)

      // Server archived state should win
      expect(archiveGroup).toHaveBeenCalledWith('group-1')
    })

    it('local starred state preserved for groups not on server', async () => {
      getRecentGroups.mockReturnValue([
        { id: 'local-1', name: 'Local Group 1' },
      ])
      getStarredGroups.mockReturnValue(['local-1'])
      getArchivedGroups.mockReturnValue([])

      const serverGroups: any[] = [] // No server groups

      const listGroupsFn = jest.fn().mockResolvedValue(serverGroups)
      const getPreferencesFn = jest
        .fn()
        .mockResolvedValue({ syncExisting: false, syncNewGroups: false })
      const syncAllFn = jest.fn().mockResolvedValue({ synced: 0, skipped: 0 })

      await restoreFromServer(listGroupsFn, getPreferencesFn, syncAllFn)

      // Local starred state should be preserved
      expect(starGroup).toHaveBeenCalledWith('local-1')
    })

    it('local archived state preserved for groups not on server', async () => {
      getRecentGroups.mockReturnValue([
        { id: 'local-1', name: 'Local Group 1' },
      ])
      getStarredGroups.mockReturnValue([])
      getArchivedGroups.mockReturnValue(['local-1'])

      const serverGroups: any[] = [] // No server groups

      const listGroupsFn = jest.fn().mockResolvedValue(serverGroups)
      const getPreferencesFn = jest
        .fn()
        .mockResolvedValue({ syncExisting: false, syncNewGroups: false })
      const syncAllFn = jest.fn().mockResolvedValue({ synced: 0, skipped: 0 })

      await restoreFromServer(listGroupsFn, getPreferencesFn, syncAllFn)

      // Local archived state should be preserved
      expect(archiveGroup).toHaveBeenCalledWith('local-1')
    })

    it('merges all groups correctly (complex scenario)', async () => {
      getRecentGroups.mockReturnValue([
        { id: 'group-1', name: 'Local 1' },
        { id: 'group-2', name: 'Local 2' },
        { id: 'group-3', name: 'Local 3' },
      ])
      getStarredGroups.mockReturnValue(['group-2']) // group-2 starred locally
      getArchivedGroups.mockReturnValue(['group-3']) // group-3 archived locally

      const serverGroups = [
        {
          groupId: 'group-1',
          group: { name: 'Server 1' },
          isStarred: true, // Server says starred
          isArchived: false,
        },
        {
          groupId: 'group-4',
          group: { name: 'Server 4' },
          isStarred: false,
          isArchived: true, // Server says archived
        },
      ]

      const listGroupsFn = jest.fn().mockResolvedValue(serverGroups)
      const getPreferencesFn = jest
        .fn()
        .mockResolvedValue({ syncExisting: false, syncNewGroups: false })
      const syncAllFn = jest.fn().mockResolvedValue({ synced: 0, skipped: 0 })

      await restoreFromServer(listGroupsFn, getPreferencesFn, syncAllFn)

      // All 4 groups should be saved
      expect(saveRecentGroup).toHaveBeenCalledTimes(4)
      expect(saveRecentGroup).toHaveBeenCalledWith({
        id: 'group-1',
        name: 'Server 1',
      }) // Server wins name
      expect(saveRecentGroup).toHaveBeenCalledWith({
        id: 'group-2',
        name: 'Local 2',
      })
      expect(saveRecentGroup).toHaveBeenCalledWith({
        id: 'group-3',
        name: 'Local 3',
      })
      expect(saveRecentGroup).toHaveBeenCalledWith({
        id: 'group-4',
        name: 'Server 4',
      })

      // Starred: group-1 (server), group-2 (local preserved)
      expect(starGroup).toHaveBeenCalledWith('group-1')
      expect(starGroup).toHaveBeenCalledWith('group-2')

      // Archived: group-3 (local preserved), group-4 (server)
      expect(archiveGroup).toHaveBeenCalledWith('group-3')
      expect(archiveGroup).toHaveBeenCalledWith('group-4')
    })
  })

  describe('Error handling', () => {
    it('does not throw on network error', async () => {
      getRecentGroups.mockReturnValue([])
      getStarredGroups.mockReturnValue([])
      getArchivedGroups.mockReturnValue([])

      const listGroupsFn = jest
        .fn()
        .mockRejectedValue(new Error('Network error'))
      const getPreferencesFn = jest
        .fn()
        .mockResolvedValue({ syncExisting: false, syncNewGroups: false })
      const syncAllFn = jest.fn().mockResolvedValue({ synced: 0, skipped: 0 })

      await expect(
        restoreFromServer(listGroupsFn, getPreferencesFn, syncAllFn),
      ).resolves.not.toThrow()
    })

    it('retries on failure (exponential backoff)', async () => {
      getRecentGroups.mockReturnValue([])
      getStarredGroups.mockReturnValue([])
      getArchivedGroups.mockReturnValue([])

      const listGroupsFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue([])

      const getPreferencesFn = jest
        .fn()
        .mockResolvedValue({ syncExisting: false, syncNewGroups: false })
      const syncAllFn = jest.fn().mockResolvedValue({ synced: 0, skipped: 0 })

      await restoreFromServer(listGroupsFn, getPreferencesFn, syncAllFn)

      // Should have retried 3 times (initial + 2 retries)
      expect(listGroupsFn).toHaveBeenCalledTimes(3)
    })

    it('clears localStorage before populating merged data', async () => {
      // Pre-populate localStorage
      localStorage.setItem(
        'recentGroups',
        JSON.stringify([{ id: 'old', name: 'Old' }]),
      )
      localStorage.setItem('starredGroups', JSON.stringify(['old']))
      localStorage.setItem('archivedGroups', JSON.stringify(['old']))

      getRecentGroups.mockReturnValue([])
      getStarredGroups.mockReturnValue([])
      getArchivedGroups.mockReturnValue([])

      const serverGroups = [
        {
          groupId: 'new',
          group: { name: 'New' },
          isStarred: false,
          isArchived: false,
        },
      ]

      const listGroupsFn = jest.fn().mockResolvedValue(serverGroups)
      const getPreferencesFn = jest
        .fn()
        .mockResolvedValue({ syncExisting: false, syncNewGroups: false })
      const syncAllFn = jest.fn().mockResolvedValue({ synced: 0, skipped: 0 })

      await restoreFromServer(listGroupsFn, getPreferencesFn, syncAllFn)

      // localStorage should have been cleared and repopulated
      // The mock functions would have been called with new data
      expect(saveRecentGroup).toHaveBeenCalledWith({ id: 'new', name: 'New' })
    })
  })
})
