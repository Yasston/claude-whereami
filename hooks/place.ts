// Pure helpers: where the session runs, and the command that brings a cloud
// session back to your machine. No engine calls, so tests can use them alone.

export type Place = {
  isCloud: boolean
  machine: string
  /** The cloud session's claude.ai id (session_...), when there is one. */
  sessionId: string | null
}

export type Repo = { slug: string; cloneUrl: string }

export const label = (p: Place): string =>
  p.isCloud ? `☁ CLOUD container (${p.machine})` : `💻 LOCAL on ${p.machine}`

/** owner/repo from a remote URL: GitHub, SSH, or the cloud's git proxy. */
export const repoFromRemote = (remote: string | null): Repo | null => {
  if (remote === null) return null
  const cleaned = remote.trim().replace(/\.git$/, '').replace(/\/+$/, '')
  const parts = cleaned.split(/[/:]/).filter(part => part !== '')
  const name = parts.at(-1)
  const owner = parts.at(-2)
  if (name === undefined || owner === undefined) return null
  const slug = `${owner}/${name}`
  return { slug, cloneUrl: `https://github.com/${slug}.git` }
}

/** Parses "owner/repo=folder, owner2/repo2=folder2"; malformed pairs are skipped. */
export const parseWorkspaces = (text: string): Map<string, string> => {
  const map = new Map<string, string>()
  for (const pair of text.split(',')) {
    const at = pair.indexOf('=')
    if (at <= 0) continue
    const slug = pair.slice(0, at).trim().toLowerCase()
    const folder = pair.slice(at + 1).trim()
    if (slug !== '' && folder !== '') map.set(slug, folder)
  }
  return map
}

export const localFolder = (repo: Repo, root: string, workspaces: string): string => {
  const listed = parseWorkspaces(workspaces).get(repo.slug.toLowerCase())
  if (listed !== undefined) return listed
  const name = repo.slug.split('/').at(-1) ?? repo.slug
  return `${root.replace(/\/+$/, '')}/${name}`
}

// Double quotes keep $HOME working while spaces stay safe; ", \, ` and $( are refused.
const isShellSafe = (text: string): boolean => !/["\\`]|\$\(/.test(text)

/** One line to paste in a terminal on your machine. */
export const goLocalCommand = (
  repo: Repo,
  folder: string,
  sessionId: string | null,
): string | null => {
  if (!isShellSafe(folder)) return null
  if (sessionId !== null && !/^[A-Za-z0-9_-]+$/.test(sessionId)) return null
  const teleport = sessionId === null ? 'claude --teleport' : `claude --teleport ${sessionId}`
  return (
    `D="${folder}"; ` +
    `[ -d "$D/.git" ] || git clone ${repo.cloneUrl} "$D"; ` +
    `cd "$D" && ${teleport}`
  )
}

/** The mark a cloud thread's title starts with, so the thread list shows it. */
export const CLOUD_MARK = '☁'

/** The title with the cloud mark in front, once. */
export const cloudTitle = (title: string): string => {
  const trimmed = title.trim()
  return trimmed.startsWith(CLOUD_MARK) ? trimmed : `${CLOUD_MARK} ${trimmed}`
}

/** A project's rename-thread tool, whatever its server's prefix. */
export const isRenameThread = (tool: string): boolean => /^mcp__.+__rename_thread$/.test(tool)
