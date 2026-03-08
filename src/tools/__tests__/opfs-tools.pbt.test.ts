/**
 * Property-Based Tests for OPFS Strands Tools
 *
 * Uses fast-check to verify that the 11 OPFS tools in src/tools/opfs-tools.ts
 * satisfy invariants across a wide range of randomly generated inputs.
 *
 * Each `fc.assert(fc.asyncProperty(…))` call is one property. Tests run in a
 * pure Node.js environment thanks to the MockOPFSFileSystem in mock-fs.ts.
 *
 * References:
 *   fast-check: https://fast-check.io/
 *   Property-Based Testing overview: https://fast-check.io/docs/introduction/what-is-property-based-testing/
 */

import { describe, it } from 'vitest'
import * as fc from 'fast-check'
import { createOpfsTools } from '../opfs-tools.ts'
import { MockOPFSFileSystem } from './mock-fs.ts'

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/**
 * A single path-segment: lowercase letters and digits, 1–12 chars.
 * Kept simple so paths are easy to reason about in failure messages.
 */
const segmentArb = fc.stringMatching(/^[a-z][a-z0-9]{0,11}$/)

/**
 * An absolute path of 1–3 segments, e.g. "/notes", "/docs/readme".
 */
const pathArb = fc
  .array(segmentArb, { minLength: 1, maxLength: 3 })
  .map((segs) => '/' + segs.join('/'))

/**
 * An absolute DIRECTORY path (same shape as pathArb — directories and files
 * share the same path space in the mock).
 */
const dirArb = pathArb

/**
 * Arbitrary text content: any Unicode string, including the empty string.
 * This is intentionally broad to surface encoding / concatenation edge cases.
 */
const contentArb = fc.string()

/**
 * A pair of DISTINCT absolute paths — used for copy/rename properties so
 * source and destination are never the same path.
 */
const distinctPathsArb = fc
  .tuple(pathArb, pathArb)
  .filter(([a, b]) => a !== b)

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Invoke a named tool from the array by name, returning the string result. */
async function call(
  tools: ReturnType<typeof createOpfsTools>,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  const t = tools.find((t) => t.name === name)!
  return (await t.invoke(input as never)) as string
}

/** Build a fresh mock + tool set for every property invocation (isolation). */
function freshTools(): {
  mock: MockOPFSFileSystem
  tools: ReturnType<typeof createOpfsTools>
} {
  const sharedMock = new MockOPFSFileSystem()
  const sharedTools = createOpfsTools(sharedMock as unknown as import('opfs-worker').OPFSFileSystem)
  return { mock: sharedMock, tools: sharedTools }
}

// ─── Properties ──────────────────────────────────────────────────────────────

describe('OPFS Tools – Property-Based Tests', () => {
  // ── 1. write → read round-trip ───────────────────────────────────────────

  it('P1: reading back a written file always returns the exact content', async () => {
    await fc.assert(
      fc.asyncProperty(pathArb, contentArb, async (path, content) => {
        const { tools } = freshTools()

        await call(tools, 'write_file', { path, content })
        const result = await call(tools, 'read_file', { path })

        fc.pre(result === content)
      }),
      { numRuns: 200 },
    )
  })

  // ── 2. append = initial + suffix ─────────────────────────────────────────

  it('P2: appending a suffix produces initial + suffix on read', async () => {
    await fc.assert(
      fc.asyncProperty(pathArb, contentArb, contentArb, async (path, initial, suffix) => {
        const { tools } = freshTools()

        await call(tools, 'write_file', { path, content: initial })
        await call(tools, 'append_to_file', { path, content: suffix })
        const result = await call(tools, 'read_file', { path })

        fc.pre(result === initial + suffix)
      }),
      { numRuns: 200 },
    )
  })

  // ── 3. append empty string is identity ───────────────────────────────────

  it('P3: appending an empty string does not change file content', async () => {
    await fc.assert(
      fc.asyncProperty(pathArb, contentArb, async (path, content) => {
        const { tools } = freshTools()

        await call(tools, 'write_file', { path, content })
        await call(tools, 'append_to_file', { path, content: '' })
        const result = await call(tools, 'read_file', { path })

        fc.pre(result === content)
      }),
      { numRuns: 200 },
    )
  })

  // ── 4. overwrite replaces content ────────────────────────────────────────

  it('P4: the second write overwrites the first — read returns the latest content', async () => {
    await fc.assert(
      fc.asyncProperty(pathArb, contentArb, contentArb, async (path, first, second) => {
        const { tools } = freshTools()

        await call(tools, 'write_file', { path, content: first })
        await call(tools, 'write_file', { path, content: second })
        const result = await call(tools, 'read_file', { path })

        fc.pre(result === second)
      }),
      { numRuns: 200 },
    )
  })

  // ── 5. file_exists → true after write ────────────────────────────────────

  it('P5: file_exists reports the path exists after a write', async () => {
    await fc.assert(
      fc.asyncProperty(pathArb, contentArb, async (path, content) => {
        const { tools } = freshTools()

        await call(tools, 'write_file', { path, content })
        const result = await call(tools, 'file_exists', { path })

        fc.pre(result.toLowerCase().includes('exists'))
        fc.pre(!result.toLowerCase().includes('does not'))
      }),
      { numRuns: 200 },
    )
  })

  // ── 6. file_exists → false on a fresh filesystem ─────────────────────────

  it('P6: file_exists reports the path does not exist on a fresh filesystem', async () => {
    await fc.assert(
      fc.asyncProperty(pathArb, async (path) => {
        const { tools } = freshTools() // new fs — nothing written yet

        const result = await call(tools, 'file_exists', { path })

        fc.pre(result.toLowerCase().includes('does not exist'))
      }),
      { numRuns: 200 },
    )
  })

  // ── 7. delete → file_exists returns false ────────────────────────────────

  it('P7: file_exists returns "does not exist" after deleting the file', async () => {
    await fc.assert(
      fc.asyncProperty(pathArb, contentArb, async (path, content) => {
        const { tools } = freshTools()

        await call(tools, 'write_file', { path, content })
        await call(tools, 'delete_file', { path })
        const result = await call(tools, 'file_exists', { path })

        fc.pre(result.toLowerCase().includes('does not exist'))
      }),
      { numRuns: 200 },
    )
  })

  // ── 8. list_files contains the written filename ───────────────────────────

  it('P8: after writing a file the parent directory listing contains its name', async () => {
    await fc.assert(
      fc.asyncProperty(dirArb, segmentArb, contentArb, async (dir, filename, content) => {
        const { tools } = freshTools()
        const filePath = dir + '/' + filename

        await call(tools, 'write_file', { path: filePath, content })
        const listing = await call(tools, 'list_files', { path: dir })

        fc.pre(listing.includes(filename))
      }),
      { numRuns: 200 },
    )
  })

  // ── 9. stat size matches TextEncoder byte length ──────────────────────────

  it('P9: file_info size matches the byte length of the written content', async () => {
    await fc.assert(
      fc.asyncProperty(pathArb, contentArb, async (path, content) => {
        const { tools } = freshTools()

        await call(tools, 'write_file', { path, content })
        const infoJson = await call(tools, 'file_info', { path })
        const info = JSON.parse(infoJson) as { size: number }
        const expectedBytes = new TextEncoder().encode(content).byteLength

        fc.pre(info.size === expectedBytes)
      }),
      { numRuns: 200 },
    )
  })

  // ── 10. copy: source and destination both hold the content ───────────────

  it('P10: after copy both source and destination hold the original content', async () => {
    await fc.assert(
      fc.asyncProperty(distinctPathsArb, contentArb, async ([srcPath, destPath], content) => {
        const { tools } = freshTools()

        await call(tools, 'write_file', { path: srcPath, content })
        await call(tools, 'copy_file', { sourcePath: srcPath, destinationPath: destPath })

        const srcRead = await call(tools, 'read_file', { path: srcPath })
        const dstRead = await call(tools, 'read_file', { path: destPath })

        fc.pre(srcRead === content && dstRead === content)
      }),
      { numRuns: 200 },
    )
  })

  // ── 11. rename: only destination exists afterwards ───────────────────────

  it('P11: after rename the destination exists and the source does not', async () => {
    await fc.assert(
      fc.asyncProperty(distinctPathsArb, contentArb, async ([srcPath, destPath], content) => {
        const { tools } = freshTools()

        await call(tools, 'write_file', { path: srcPath, content })
        await call(tools, 'rename_file', { sourcePath: srcPath, destinationPath: destPath })

        const srcExists = await call(tools, 'file_exists', { path: srcPath })
        const dstExists = await call(tools, 'file_exists', { path: destPath })

        fc.pre(
          srcExists.toLowerCase().includes('does not exist') &&
          dstExists.toLowerCase().includes('exists') &&
          !dstExists.toLowerCase().includes('does not'),
        )
      }),
      { numRuns: 200 },
    )
  })

  // ── 12. rename: content is preserved ─────────────────────────────────────

  it('P12: after rename the destination file holds the original content', async () => {
    await fc.assert(
      fc.asyncProperty(distinctPathsArb, contentArb, async ([srcPath, destPath], content) => {
        const { tools } = freshTools()

        await call(tools, 'write_file', { path: srcPath, content })
        await call(tools, 'rename_file', { sourcePath: srcPath, destinationPath: destPath })
        const result = await call(tools, 'read_file', { path: destPath })

        fc.pre(result === content)
      }),
      { numRuns: 200 },
    )
  })

  // ── 13. index_file_system lists written path ──────────────────────────────

  it('P13: index_file_system contains every written file path', async () => {
    await fc.assert(
      fc.asyncProperty(pathArb, contentArb, async (path, content) => {
        const { tools } = freshTools()

        await call(tools, 'write_file', { path, content })
        const index = await call(tools, 'index_file_system', {})

        fc.pre(index.includes(path))
      }),
      { numRuns: 200 },
    )
  })

  // ── 14. create_directory → list parent shows [DIR] entry ─────────────────

  it('P14: after create_directory the parent listing contains the new directory name', async () => {
    await fc.assert(
      fc.asyncProperty(dirArb, segmentArb, async (parent, dirName) => {
        const { tools } = freshTools()
        const newDir = parent + '/' + dirName

        await call(tools, 'create_directory', { path: newDir })
        const listing = await call(tools, 'list_files', { path: parent })

        fc.pre(listing.includes('[DIR]') && listing.includes(dirName))
      }),
      { numRuns: 200 },
    )
  })

  // ── 15. all tool callbacks return strings ─────────────────────────────────

  it('P15: every tool callback returns a string for any valid input', async () => {
    await fc.assert(
      fc.asyncProperty(
        pathArb,
        contentArb,
        distinctPathsArb,
        dirArb,
        segmentArb,
        async (path, content, [src, dst], dir, seg) => {
          const { tools } = freshTools()

          // Pre-populate so read/stat/list/rename/copy don't throw
          await call(tools, 'write_file', { path, content })
          await call(tools, 'write_file', { path: src, content })

          const results = await Promise.all([
            call(tools, 'write_file', { path, content }),
            call(tools, 'read_file', { path }),
            call(tools, 'append_to_file', { path, content }),
            call(tools, 'list_files', { path: '/' }),
            call(tools, 'file_exists', { path }),
            call(tools, 'file_info', { path }),
            call(tools, 'create_directory', { path: dir + '/' + seg }),
            call(tools, 'copy_file', { sourcePath: src, destinationPath: dst }),
            call(tools, 'index_file_system', {}),
          ])

          fc.pre(results.every((r) => typeof r === 'string'))
        },
      ),
      { numRuns: 100 },
    )
  })
})
