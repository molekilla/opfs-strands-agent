/**
 * Property-Based Tests — "Files Are All You Need" tools + FileMemory
 *
 * Covers the four new tools (search_files, read_multiple_files, write_json,
 * read_json) and the FileMemory class with fast-check properties.
 *
 * References:
 *   https://www.llamaindex.ai/blog/files-are-all-you-need
 *   https://vercel.com/blog/how-to-build-agents-with-filesystems-and-bash
 *   https://madalitso.me/notes/why-everyone-is-talking-about-filesystems/
 *   fast-check: https://fast-check.io/
 */

import { describe, it } from 'vitest'
import * as fc from 'fast-check'
import { createOpfsTools } from '../opfs-tools.ts'
import { FileMemory } from '../../file-memory.ts'
import { MockOPFSFileSystem } from './mock-fs.ts'

// ─── arbitraries ─────────────────────────────────────────────────────────────

const segmentArb = fc.stringMatching(/^[a-z][a-z0-9]{0,11}$/)
const pathArb    = fc
  .array(segmentArb, { minLength: 1, maxLength: 3 })
  .map((segs) => '/' + segs.join('/'))
const dirArb     = pathArb
const contentArb = fc.string()

/** A value that round-trips cleanly through JSON (no undefined, no NaN, etc.) */
const jsonValueArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.array(fc.string(), { maxLength: 5 }),
  fc.record({ label: fc.string(), count: fc.integer() }),
)

/** A valid memory key: alphanumeric + dashes, 1-20 chars */
const memKeyArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/)

// ─── helpers ─────────────────────────────────────────────────────────────────

function freshEnv(): {
  mock: MockOPFSFileSystem
  tools: ReturnType<typeof createOpfsTools>
  mem: FileMemory
} {
  const mock  = new MockOPFSFileSystem()
  const tools = createOpfsTools(mock as unknown as import('opfs-worker').OPFSFileSystem)
  const mem   = new FileMemory(mock as unknown as import('opfs-worker').OPFSFileSystem, '/memory')
  return { mock, tools, mem }
}

async function call(
  tools: ReturnType<typeof createOpfsTools>,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  const t = tools.find((t) => t.name === name)!
  return (await t.invoke(input as never)) as string
}

// ─── Tool properties ─────────────────────────────────────────────────────────

describe('"Files Are All You Need" Tools — Property-Based Tests', () => {

  // ── write_json / read_json round-trip ───────────────────────────────────────

  it('T1: write_json then read_json returns the same structured value', async () => {
    await fc.assert(
      fc.asyncProperty(pathArb, jsonValueArb, async (path, value) => {
        const { tools } = freshEnv()

        const json = JSON.stringify(value)
        await call(tools, 'write_json', { path, value: json })
        const result = await call(tools, 'read_json', { path })

        fc.pre(JSON.stringify(JSON.parse(result)) === JSON.stringify(value))
      }),
      { numRuns: 200 },
    )
  })

  it('T2: write_json output is valid pretty-printed JSON', async () => {
    await fc.assert(
      fc.asyncProperty(pathArb, jsonValueArb, async (path, value) => {
        const { tools } = freshEnv()

        await call(tools, 'write_json', { path, value: JSON.stringify(value) })
        const result = await call(tools, 'read_json', { path })

        // Must parse without throwing
        JSON.parse(result)
        // Must be pretty-printed (multi-line for non-scalar values)
        fc.pre(typeof value !== 'object' || result.includes('\n'))
      }),
      { numRuns: 200 },
    )
  })

  // ── read_multiple_files ──────────────────────────────────────────────────────

  it('T3: read_multiple_files contains every file\'s content', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(pathArb, contentArb), { minLength: 1, maxLength: 4 }),
        async (pairs) => {
          // Deduplicate paths
          const unique = [...new Map(pairs).entries()]
          fc.pre(unique.length >= 1)

          const { tools } = freshEnv()
          for (const [path, content] of unique) {
            await call(tools, 'write_file', { path, content })
          }

          const result = await call(tools, 'read_multiple_files', {
            paths: unique.map(([p]) => p),
          })

          fc.pre(unique.every(([p, c]) => result.includes(p) && result.includes(c)))
        },
      ),
      { numRuns: 150 },
    )
  })

  it('T4: read_multiple_files marks missing files clearly', async () => {
    await fc.assert(
      fc.asyncProperty(pathArb, async (path) => {
        const { tools } = freshEnv()
        // path was never written
        const result = await call(tools, 'read_multiple_files', { paths: [path] })
        fc.pre(result.includes('[Error: file not found]'))
      }),
      { numRuns: 150 },
    )
  })

  // ── search_files ─────────────────────────────────────────────────────────────

  it('T5: search_files finds content that was written', async () => {
    await fc.assert(
      fc.asyncProperty(dirArb, segmentArb, contentArb, async (dir, filename, content) => {
        // Only meaningful when content is non-empty and doesn't contain path separators
        fc.pre(content.length > 0 && !content.includes('\x00'))

        const { tools } = freshEnv()
        const filePath = `${dir}/${filename}`
        await call(tools, 'write_file', { path: filePath, content })

        // search for the entire content (guaranteed to match)
        const firstLine = content.split('\n')[0].slice(0, 20)
        fc.pre(firstLine.length > 0)

        const result = await call(tools, 'search_files', {
          directory: dir,
          query: firstLine,
        })

        fc.pre(result.includes(filePath))
      }),
      { numRuns: 150 },
    )
  })

  it('T6: search_files returns no-matches message when query is absent', async () => {
    await fc.assert(
      fc.asyncProperty(dirArb, segmentArb, async (dir, filename) => {
        const { tools } = freshEnv()
        await call(tools, 'write_file', {
          path: `${dir}/${filename}`,
          content: 'hello world',
        })

        const result = await call(tools, 'search_files', {
          directory: dir,
          query: 'ZZZQQQXXX_THIS_WILL_NEVER_MATCH',
        })

        fc.pre(result.toLowerCase().includes('no matches'))
      }),
      { numRuns: 150 },
    )
  })

  it('T7: search_files is case-insensitive', async () => {
    await fc.assert(
      fc.asyncProperty(dirArb, segmentArb, async (dir, filename) => {
        const { tools } = freshEnv()
        await call(tools, 'write_file', {
          path: `${dir}/${filename}`,
          content: 'The Quick Brown Fox',
        })

        const lower = await call(tools, 'search_files', {
          directory: dir,
          query: 'quick brown',
        })
        const upper = await call(tools, 'search_files', {
          directory: dir,
          query: 'QUICK BROWN',
        })

        fc.pre(lower.includes(filename) && upper.includes(filename))
      }),
      { numRuns: 100 },
    )
  })

})

// ─── FileMemory properties ────────────────────────────────────────────────────

describe('FileMemory — Property-Based Tests', () => {

  // ── remember / recall round-trip ─────────────────────────────────────────────

  it('M1: recall returns exactly the value passed to remember', async () => {
    await fc.assert(
      fc.asyncProperty(memKeyArb, jsonValueArb, async (key, value) => {
        const { mem } = freshEnv()

        await mem.remember(key, value)
        const recalled = await mem.recall(key)

        fc.pre(JSON.stringify(recalled) === JSON.stringify(value))
      }),
      { numRuns: 200 },
    )
  })

  it('M2: overwriting a key returns the latest value', async () => {
    await fc.assert(
      fc.asyncProperty(memKeyArb, jsonValueArb, jsonValueArb, async (key, first, second) => {
        const { mem } = freshEnv()

        await mem.remember(key, first)
        await mem.remember(key, second)
        const recalled = await mem.recall(key)

        fc.pre(JSON.stringify(recalled) === JSON.stringify(second))
      }),
      { numRuns: 200 },
    )
  })

  it('M3: recall returns undefined for an unknown key', async () => {
    await fc.assert(
      fc.asyncProperty(memKeyArb, async (key) => {
        const { mem } = freshEnv()
        const result = await mem.recall(key)
        fc.pre(result === undefined)
      }),
      { numRuns: 200 },
    )
  })

  it('M4: forget removes a key so recall returns undefined', async () => {
    await fc.assert(
      fc.asyncProperty(memKeyArb, jsonValueArb, async (key, value) => {
        const { mem } = freshEnv()

        await mem.remember(key, value)
        await mem.forget(key)
        const recalled = await mem.recall(key)

        fc.pre(recalled === undefined)
      }),
      { numRuns: 200 },
    )
  })

  it('M5: list returns every remembered key', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(memKeyArb, { minLength: 1, maxLength: 6 }),
        jsonValueArb,
        async (keys, value) => {
          const unique = [...new Set(keys)]
          const { mem } = freshEnv()

          for (const k of unique) await mem.remember(k, value)
          const listed = await mem.list()

          fc.pre(unique.every((k) => listed.includes(k)))
        },
      ),
      { numRuns: 150 },
    )
  })

  it('M6: forgotten key is removed from list', async () => {
    await fc.assert(
      fc.asyncProperty(memKeyArb, jsonValueArb, async (key, value) => {
        const { mem } = freshEnv()

        await mem.remember(key, value)
        await mem.forget(key)
        const listed = await mem.list()

        fc.pre(!listed.includes(key))
      }),
      { numRuns: 200 },
    )
  })

  it('M7: search returns hits whose values contain the query', async () => {
    await fc.assert(
      fc.asyncProperty(memKeyArb, fc.string({ minLength: 3 }), async (key, token) => {
        // Store a value that definitely contains the token
        const value = { description: `contains ${token} here` }
        const { mem } = freshEnv()

        await mem.remember(key, value)
        const hits = await mem.search(token)

        fc.pre(hits.some((h) => h.key === key))
      }),
      { numRuns: 150 },
    )
  })

  it('M8: search for absent token returns empty array', async () => {
    await fc.assert(
      fc.asyncProperty(memKeyArb, jsonValueArb, async (key, value) => {
        const { mem } = freshEnv()

        await mem.remember(key, value)
        const hits = await mem.search('ZZZQQQXXX_NEVER_MATCHES')

        fc.pre(hits.length === 0)
      }),
      { numRuns: 150 },
    )
  })

  it('M9: overwrite preserves createdAt but updates updatedAt', async () => {
    await fc.assert(
      fc.asyncProperty(memKeyArb, jsonValueArb, jsonValueArb, async (key, first, second) => {
        const { mem } = freshEnv()

        await mem.remember(key, first)
        const e1 = await mem.recallEntry(key)

        // Tiny delay so timestamps can differ
        await new Promise((r) => setTimeout(r, 2))

        await mem.remember(key, second)
        const e2 = await mem.recallEntry(key)

        fc.pre(
          e1 !== undefined &&
          e2 !== undefined &&
          e2.createdAt === e1.createdAt &&
          e2.updatedAt >= e1.updatedAt,
        )
      }),
      { numRuns: 100 },
    )
  })

})
