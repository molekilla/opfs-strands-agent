/**
 * FileMemory — file-backed key/value agent memory
 *
 * Implements the core thesis from:
 *   "Files Are All You Need" (LlamaIndex)
 *   https://www.llamaindex.ai/blog/files-are-all-you-need
 *
 *   "How to Build Agents with Filesystems and Bash" (Vercel)
 *   https://vercel.com/blog/how-to-build-agents-with-filesystems-and-bash
 *
 *   "Why Everyone is Talking About Filesystems" (madalitso.me)
 *   https://madalitso.me/notes/why-everyone-is-talking-about-filesystems/
 *
 * ─── Philosophy ──────────────────────────────────────────────────────────────
 * Instead of an in-memory Map, a Redis cache, or a vector database, every
 * memory entry is a plain JSON file inside OPFS.  This gives you:
 *
 *   • Persistence across page reloads (OPFS survives browser restarts)
 *   • Human-readable state — open DevTools → OPFS explorer to inspect
 *   • Zero-cost search — just scan the files (no embeddings needed)
 *   • Pipelines — downstream agents read the same files
 *   • Portability — export the OPFS directory, email it, import it elsewhere
 *
 * ─── Storage layout ──────────────────────────────────────────────────────────
 *   <memoryRoot>/
 *     <key>.json      ← one file per memory entry
 *     _index.json     ← manifest with key list + timestamps
 *
 * ─── Usage ───────────────────────────────────────────────────────────────────
 *   const mem = new FileMemory(fs)
 *   await mem.remember('user-prefs', { theme: 'dark', lang: 'en' })
 *   const prefs = await mem.recall('user-prefs')   // { theme: 'dark', … }
 *   const hits  = await mem.search('dark')          // [{ key, value, excerpt }]
 *   await mem.forget('user-prefs')
 */

import type { OPFSFileSystem } from 'opfs-worker'

// ─── types ────────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  key: string
  value: unknown
  createdAt: string
  updatedAt: string
}

export interface SearchHit {
  key: string
  value: unknown
  excerpt: string
}

interface MemoryIndex {
  keys: string[]
  updatedAt: string
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function sanitiseKey(key: string): string {
  // Replace path separators and any characters that would be invalid in a
  // filename with underscores so every key maps to a safe filename.
  return key.replace(/[/\\:*?"<>|]/g, '_')
}

// ─── class ────────────────────────────────────────────────────────────────────

export class FileMemory {
  private readonly root: string
  private readonly indexPath: string

  /**
   * @param fs         An initialised OPFSFileSystem from opfs-worker
   * @param memoryRoot Directory where memory files are stored (default: '/memory')
   */
  constructor(
    private readonly fs: OPFSFileSystem,
    memoryRoot = '/memory',
  ) {
    this.root = memoryRoot
    this.indexPath = `${memoryRoot}/_index.json`
  }

  // ── private helpers ─────────────────────────────────────────────────────────

  private filePath(key: string): string {
    return `${this.root}/${sanitiseKey(key)}.json`
  }

  private async readIndex(): Promise<MemoryIndex> {
    try {
      const raw = await this.fs.readFile(this.indexPath, 'utf-8')
      return JSON.parse(raw) as MemoryIndex
    } catch {
      return { keys: [], updatedAt: new Date().toISOString() }
    }
  }

  private async writeIndex(index: MemoryIndex): Promise<void> {
    await this.fs.mkdir(this.root, { recursive: true })
    await this.fs.writeFile(this.indexPath, JSON.stringify(index, null, 2))
  }

  // ── public API ──────────────────────────────────────────────────────────────

  /**
   * Store a value under `key`.  Overwrites any existing entry.
   *
   * The value can be any JSON-serialisable type: string, number, object, array.
   */
  async remember(key: string, value: unknown): Promise<void> {
    await this.fs.mkdir(this.root, { recursive: true })

    const now = new Date().toISOString()
    let createdAt = now

    // Preserve original createdAt if the key already exists
    try {
      const existing = JSON.parse(
        await this.fs.readFile(this.filePath(key), 'utf-8'),
      ) as MemoryEntry
      createdAt = existing.createdAt
    } catch {
      // new entry — createdAt stays as `now`
    }

    const entry: MemoryEntry = { key, value, createdAt, updatedAt: now }
    await this.fs.writeFile(this.filePath(key), JSON.stringify(entry, null, 2))

    const index = await this.readIndex()
    if (!index.keys.includes(key)) {
      index.keys.push(key)
      index.updatedAt = now
      await this.writeIndex(index)
    }
  }

  /**
   * Retrieve the value stored under `key`.
   * Returns `undefined` if the key does not exist.
   */
  async recall(key: string): Promise<unknown> {
    try {
      const raw = await this.fs.readFile(this.filePath(key), 'utf-8')
      const entry = JSON.parse(raw) as MemoryEntry
      return entry.value
    } catch {
      return undefined
    }
  }

  /**
   * Return the full `MemoryEntry` (with timestamps) for `key`.
   * Returns `undefined` if the key does not exist.
   */
  async recallEntry(key: string): Promise<MemoryEntry | undefined> {
    try {
      const raw = await this.fs.readFile(this.filePath(key), 'utf-8')
      return JSON.parse(raw) as MemoryEntry
    } catch {
      return undefined
    }
  }

  /**
   * Delete the memory entry for `key`.
   * No-op if the key does not exist.
   */
  async forget(key: string): Promise<void> {
    try {
      await this.fs.remove(this.filePath(key))
    } catch {
      // already gone
    }
    const index = await this.readIndex()
    const filtered = index.keys.filter((k) => k !== key)
    if (filtered.length !== index.keys.length) {
      index.keys = filtered
      index.updatedAt = new Date().toISOString()
      await this.writeIndex(index)
    }
  }

  /**
   * Return every key currently stored in memory.
   */
  async list(): Promise<string[]> {
    const index = await this.readIndex()
    return [...index.keys]
  }

  /**
   * Full-text search across all memory values.
   *
   * Converts each stored value to its JSON representation and checks whether
   * it contains `query` (case-insensitive).  Returns matching entries with a
   * short excerpt showing where the match was found.
   *
   * This is intentionally simple — no embeddings, no vector store.
   * As the referenced articles argue: for many agent use-cases plain text
   * search over a handful of files is entirely sufficient.
   */
  async search(query: string): Promise<SearchHit[]> {
    const keys = await this.list()
    const lowerQuery = query.toLowerCase()
    const hits: SearchHit[] = []

    for (const key of keys) {
      const entry = await this.recallEntry(key)
      if (!entry) continue

      const serialised = JSON.stringify(entry.value)
      const lower = serialised.toLowerCase()
      const idx = lower.indexOf(lowerQuery)
      if (idx === -1) continue

      const start = Math.max(0, idx - 40)
      const end = Math.min(serialised.length, idx + query.length + 40)
      const excerpt = `…${serialised.slice(start, end)}…`

      hits.push({ key, value: entry.value, excerpt })
    }

    return hits
  }

  /**
   * Remove all memory entries and reset the index.
   */
  async clear(): Promise<void> {
    await this.fs.remove(this.root, { recursive: true })
  }
}
