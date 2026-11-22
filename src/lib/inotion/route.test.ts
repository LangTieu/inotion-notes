import { afterEach, describe, expect, it, vi } from 'vitest'
import { navigate, parseRoute } from './route'

afterEach(() => vi.unstubAllGlobals())

describe('pathname routes', () => {
  it('parses path, note, and search scope parameters', () => {
    expect(parseRoute('/folder/f%20one', '?note=n1')).toEqual({
      kind: 'folder', id: 'f one', noteId: 'n1',
    })
    expect(parseRoute('/search', '?q=hello+world&view=archived&tag=t1&note=n2')).toEqual({
      kind: 'search', q: 'hello world', noteId: 'n2',
      scope: { view: 'archived', folder: undefined, tag: 't1' },
    })
  })

  it('navigates to a clean URL and notifies popstate subscribers', () => {
    const pushState = vi.fn()
    const replaceState = vi.fn()
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', {
      history: { pushState, replaceState },
      dispatchEvent,
    })
    // PopStateEvent is a browser global; the node test env does not define it.
    vi.stubGlobal('PopStateEvent', class extends Event {
      constructor(type: string) {
        super(type)
      }
    })

    navigate({ kind: 'search', q: 'hello world', scope: { view: 'all', folder: 'f1' } })

    expect(pushState).toHaveBeenCalledWith(null, '', '/search?q=hello+world&folder=f1')
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'popstate' }))
    navigate({ kind: 'notes' }, { replace: true })
    expect(replaceState).toHaveBeenCalledWith(null, '', '/notes')
  })

  it('replaces legacy hash URLs with their clean equivalent on module load', async () => {
    const replaceState = vi.fn()
    vi.stubGlobal('window', {
      location: { hash: '#/search?q=hello+world&tag=t1' },
      history: { replaceState },
    })
    vi.resetModules()

    await import('./route')

    expect(replaceState).toHaveBeenCalledWith(null, '', '/search?q=hello+world&tag=t1')
  })
})
