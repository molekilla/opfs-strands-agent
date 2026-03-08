/**
 * In-memory mock of OPFSFileSystem for use in unit / property-based tests.
 *
 * The real OPFSFileSystem requires a browser with Web Worker + OPFS support.
 * This mock faithfully reproduces the behaviour that the OPFS tools rely on
 * so that tests can run in a pure Node.js environment via Vitest.
 *
 * Only the methods actually called by src/tools/opfs-tools.ts are implemented.
 */

import type { DirentData, FileStat, OPFSOptions, PathLike } from 'opfs-worker'

// ─── helpers ──────────────────────────────────────────────────────────────────

function normPath(path: PathLike): string {
  const s = String(path)
  // strip trailing slash unless it is the root itself
  return s.length > 1 && s.endsWith('/') ? s.slice(0, -1) : s
}

function parentDir(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx <= 0 ? '/' : path.slice(0, idx)
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

const encoder = new TextEncoder()

// ─── mock class ───────────────────────────────────────────────────────────────

export class MockOPFSFileSystem {
  /** path → text content */
  private readonly files = new Map<string, string>()
  /** set of known directory paths (root is always present) */
  private readonly dirs = new Set<string>(['/'])

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_options?: OPFSOptions) {}

  // ── internal helpers ────────────────────────────────────────────────────────

  /** Ensure every ancestor directory of `path` is registered. */
  private ensureParents(path: string): void {
    let d = parentDir(path)
    while (d && !this.dirs.has(d)) {
      this.dirs.add(d)
      d = parentDir(d)
    }
  }

  // ── OPFSFileSystem methods used by opfs-tools ───────────────────────────────

  async writeFile(
    path: PathLike,
    data: string | Uint8Array | ArrayBuffer,
  ): Promise<void> {
    const p = normPath(path)
    const content = typeof data === 'string' ? data : new TextDecoder().decode(data as Uint8Array)
    this.files.set(p, content)
    this.ensureParents(p)
  }

  /** Overloaded the same way OPFSFileSystem is — returning string for utf-8. */
  async readFile(path: PathLike, encoding?: string): Promise<string> {
    const p = normPath(path)
    const content = this.files.get(p)
    if (content === undefined) throw new Error(`ENOENT: no such file: ${p}`)
    void encoding
    return content
  }

  async appendFile(
    path: PathLike,
    data: string | Uint8Array | ArrayBuffer,
  ): Promise<void> {
    const p = normPath(path)
    const suffix = typeof data === 'string' ? data : new TextDecoder().decode(data as Uint8Array)
    const existing = this.files.get(p) ?? ''
    this.files.set(p, existing + suffix)
    this.ensureParents(p)
  }

  async mkdir(path: PathLike, _opts?: unknown): Promise<void> {
    const p = normPath(path)
    this.dirs.add(p)
    this.ensureParents(p)
  }

  async exists(path: PathLike): Promise<boolean> {
    const p = normPath(path)
    return this.files.has(p) || this.dirs.has(p)
  }

  async stat(path: PathLike): Promise<FileStat> {
    const p = normPath(path)
    const isDir = this.dirs.has(p)
    const isFile = this.files.has(p)
    if (!isFile && !isDir) throw new Error(`ENOENT: no such file or directory: ${p}`)
    const content = this.files.get(p) ?? ''
    const now = new Date().toISOString()
    return {
      kind: isDir && !isFile ? 'directory' : 'file',
      size: encoder.encode(content).byteLength,
      mtime: now,
      ctime: now,
      isFile: isFile || (!isDir),
      isDirectory: isDir && !isFile,
    }
  }

  async readDir(path: PathLike): Promise<DirentData[]> {
    const p = normPath(path)
    const prefix = p === '/' ? '/' : p + '/'
    const children = new Map<string, boolean>() // name → isDirectory

    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(prefix)) {
        const rest = filePath.slice(prefix.length)
        const slash = rest.indexOf('/')
        if (slash === -1) {
          // direct file child
          children.set(rest, false)
        } else {
          // descendant in subdirectory — record the immediate child dir name
          children.set(rest.slice(0, slash), true)
        }
      }
    }

    for (const dirPath of this.dirs) {
      if (dirPath === p) continue
      if (dirPath.startsWith(prefix)) {
        const rest = dirPath.slice(prefix.length)
        if (rest && !rest.includes('/')) {
          children.set(rest, true)
        }
      }
    }

    return Array.from(children.entries()).map(([name, isDirectory]) => ({
      name,
      kind: (isDirectory ? 'directory' : 'file') as 'file' | 'directory',
      isFile: !isDirectory,
      isDirectory,
    }))
  }

  async remove(path: PathLike, _opts?: unknown): Promise<void> {
    const p = normPath(path)
    for (const fp of [...this.files.keys()]) {
      if (fp === p || fp.startsWith(p + '/')) this.files.delete(fp)
    }
    for (const dp of [...this.dirs]) {
      if (dp === p || dp.startsWith(p + '/')) this.dirs.delete(dp)
    }
  }

  async rename(
    oldPath: PathLike,
    newPath: PathLike,
    _opts?: unknown,
  ): Promise<void> {
    const src = normPath(oldPath)
    const dst = normPath(newPath)

    if (this.files.has(src)) {
      this.files.set(dst, this.files.get(src)!)
      this.files.delete(src)
      this.ensureParents(dst)
    } else if (this.dirs.has(src)) {
      for (const fp of [...this.files.keys()]) {
        if (fp.startsWith(src + '/')) {
          this.files.set(dst + fp.slice(src.length), this.files.get(fp)!)
          this.files.delete(fp)
        }
      }
      this.dirs.delete(src)
      this.dirs.add(dst)
      this.ensureParents(dst)
    }
  }

  async copy(
    srcPath: PathLike,
    destPath: PathLike,
    _opts?: unknown,
  ): Promise<void> {
    const src = normPath(srcPath)
    const dst = normPath(destPath)

    if (this.files.has(src)) {
      this.files.set(dst, this.files.get(src)!)
      this.ensureParents(dst)
    } else if (this.dirs.has(src)) {
      this.dirs.add(dst)
      this.ensureParents(dst)
      for (const fp of this.files.keys()) {
        if (fp.startsWith(src + '/')) {
          this.files.set(dst + fp.slice(src.length), this.files.get(fp)!)
        }
      }
    }
  }

  async index(): Promise<Map<string, FileStat>> {
    const result = new Map<string, FileStat>()
    const now = new Date().toISOString()

    for (const [fp, content] of this.files) {
      result.set(fp, {
        kind: 'file',
        size: encoder.encode(content).byteLength,
        mtime: now,
        ctime: now,
        isFile: true,
        isDirectory: false,
      })
    }

    for (const dp of this.dirs) {
      if (dp === '/') continue
      result.set(dp, {
        kind: 'directory',
        size: 0,
        mtime: now,
        ctime: now,
        isFile: false,
        isDirectory: true,
      })
    }

    return result
  }

  // ── helpers exposed for test assertions ─────────────────────────────────────

  /** Raw access used by tests to inspect internal state. */
  getRawContent(path: string): string | undefined {
    return this.files.get(normPath(path))
  }

  hasDir(path: string): boolean {
    return this.dirs.has(normPath(path))
  }
}

/** Cast the mock as the real OPFSFileSystem so it can be passed to createOpfsTools. */
export function buildMockFs(options?: OPFSOptions): ReturnType<typeof _mockAs> {
  return _mockAs(new MockOPFSFileSystem(options))
}

import type { OPFSFileSystem } from 'opfs-worker'

function _mockAs(mock: MockOPFSFileSystem): OPFSFileSystem {
  return mock as unknown as OPFSFileSystem
}

export { baseName, parentDir, normPath }
