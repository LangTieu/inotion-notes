import type { Folder } from './types'

export interface FolderNode {
  folder: Folder
  depth: number
  children: FolderNode[]
}

const byPositionThenName = (a: Folder, b: Folder) =>
  (a.position ?? 0) - (b.position ?? 0) ||
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })

export function buildFolderTree(folders: Folder[]): FolderNode[] {
  const ids = new Set(folders.map((f) => String(f.id)))
  const children = new Map<string, Folder[]>()
  for (const f of folders) {
    const parent =
      f.parent_id != null && ids.has(String(f.parent_id))
        ? String(f.parent_id)
        : 'root'
    const list = children.get(parent) ?? []
    list.push(f)
    children.set(parent, list)
  }
  const build = (key: string, depth: number, seen: Set<string>): FolderNode[] =>
    (children.get(key) ?? [])
      .sort(byPositionThenName)
      .filter((f) => !seen.has(String(f.id)))
      .map((folder) => {
        const nextSeen = new Set(seen).add(String(folder.id))
        return {
          folder,
          depth,
          children: build(String(folder.id), depth + 1, nextSeen),
        }
      })
  return build('root', 0, new Set())
}

export function flattenFolderTree(nodes: FolderNode[]): FolderNode[] {
  return nodes.flatMap((n) => [n, ...flattenFolderTree(n.children)])
}

export function flattenFolders(folders: Folder[]): FolderNode[] {
  return flattenFolderTree(buildFolderTree(folders))
}

/** Ids of a folder and everything nested under it. */
export function folderAndDescendantIds(
  folders: Folder[],
  id: string,
): Set<string> {
  const result = new Set<string>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const f of folders) {
      if (
        f.parent_id != null &&
        result.has(String(f.parent_id)) &&
        !result.has(String(f.id))
      ) {
        result.add(String(f.id))
        grew = true
      }
    }
  }
  return result
}

export function folderPath(folders: Folder[], id: string): string {
  const byId = new Map(folders.map((f) => [String(f.id), f]))
  const parts: string[] = []
  let cursor = byId.get(id)
  let guard = 0
  while (cursor && guard++ < 101) {
    parts.unshift(cursor.name)
    cursor = cursor.parent_id != null ? byId.get(String(cursor.parent_id)) : undefined
  }
  return parts.join(' / ')
}
