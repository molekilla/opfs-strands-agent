/**
 * "Files Are All You Need" — end-to-end browser demo
 *
 * Demonstrates the complete philosophy from three key references:
 *
 *   LlamaIndex  — "Files Are All You Need"
 *   https://www.llamaindex.ai/blog/files-are-all-you-need
 *
 *   Vercel      — "How to Build Agents with Filesystems and Bash"
 *   https://vercel.com/blog/how-to-build-agents-with-filesystems-and-bash
 *
 *   madalitso   — "Why Everyone is Talking About Filesystems"
 *   https://madalitso.me/notes/why-everyone-is-talking-about-filesystems/
 *
 * ─── What this demo shows ────────────────────────────────────────────────────
 *
 *  Phase 1 · Ingest
 *    Write three source documents into OPFS (/docs/*).
 *    These represent "raw input" arriving from any external source.
 *
 *  Phase 2 · Summarise  (FilePipeline step)
 *    The agent reads each document, writes a one-paragraph summary to
 *    /summaries/*.txt, and appends a line to /summaries/_index.txt.
 *    No vector store — just files.
 *
 *  Phase 3 · FileMemory
 *    Key facts extracted from the documents are stored as JSON entries
 *    inside /memory/*.json via FileMemory.remember().
 *
 *  Phase 4 · Retrieve
 *    search_files scans /summaries for a keyword.
 *    FileMemory.search() does the same over /memory.
 *    Both demonstrate file-native retrieval without embeddings.
 *
 *  Phase 5 · Q&A
 *    read_multiple_files loads relevant summaries into the context window.
 *    The agent answers a question grounded in those files.
 *
 * ─── How to run ──────────────────────────────────────────────────────────────
 *   import { runFilesAreAllYouNeedDemo } from './src/demos/files-are-all-you-need'
 *   // Call from a browser entry point (e.g. src/main.ts) after the agent is
 *   // initialised.  Pass the agent and the OPFS fs instance.
 */

import { createWorker } from 'opfs-worker'
import { createFileAgent } from '../agent.ts'
import { FileMemory } from '../file-memory.ts'
import { FilePipeline } from '../file-pipeline.ts'
import { createOpfsTools } from '../tools/opfs-tools.ts'

// ─── sample documents ─────────────────────────────────────────────────────────

const DOCUMENTS = [
  {
    name: 'origin-private-file-system.txt',
    content: `The Origin Private File System (OPFS) is a storage endpoint private to the
origin of a page. It gives web applications a full sandboxed file system that
persists across page reloads, enabling offline-first applications, code editors,
database engines, and AI agent state — all without a server.
Key facts: introduced in Chrome 86, standardised by WHATWG, supports synchronous
access from Web Workers, and integrates with the File System Access API.`,
  },
  {
    name: 'strands-agents.txt',
    content: `Strands Agents is a model-driven SDK for building AI agents in TypeScript and
Python. The core loop is: receive a prompt → call the model → execute tool
calls → repeat until done. Tools are defined with Zod schemas which auto-generate
JSON Schema for the model. First-class support for Amazon Bedrock and OpenAI.
Key facts: TypeScript SDK v0.5.0, supports streaming, MCP integration, structured
output via Zod, and sliding-window conversation management.`,
  },
  {
    name: 'files-philosophy.txt',
    content: `Three influential articles argue that files are the ideal primitive for AI
agent state and memory:
1. LlamaIndex "Files Are All You Need": files replace vector databases for most
   agent use-cases; they are human-readable, debuggable, and portable.
2. Vercel "Agents with Filesystems and Bash": the filesystem is an agent's
   natural working memory; bash + file I/O unlocks powerful automation.
3. madalitso.me "Why Everyone is Talking About Filesystems": the Unix philosophy
   of everything-is-a-file is being rediscovered in the age of LLMs; simplicity
   wins over complex embedding pipelines for many real workloads.`,
  },
]

// ─── demo runner ─────────────────────────────────────────────────────────────

export async function runFilesAreAllYouNeedDemo(
  log: (msg: string) => void = console.log,
): Promise<void> {
  log('════════════════════════════════════════════════════')
  log(' "Files Are All You Need" — demo')
  log('════════════════════════════════════════════════════\n')

  // ── bootstrap ───────────────────────────────────────────────────────────────
  log('▶ Initialising OPFS worker and Strands Agent…')
  const fs    = await createWorker({ root: '/' })
  const agent = await createFileAgent()
  const tools = createOpfsTools(fs)
  const mem   = new FileMemory(fs, '/memory')

  log('  ✓ Agent ready\n')

  // helper: call a named tool by finding it in the tools array
  async function callTool(name: string, input: Record<string, unknown>): Promise<string> {
    const t = tools.find((t) => t.name === name)!
    return (await t.invoke(input as never)) as string
  }

  // ── phase 1: ingest ─────────────────────────────────────────────────────────
  log('─── Phase 1: Ingest source documents ───')
  await callTool('create_directory', { path: '/docs' })
  for (const doc of DOCUMENTS) {
    await callTool('write_file', { path: `/docs/${doc.name}`, content: doc.content })
    log(`  wrote /docs/${doc.name}`)
  }
  log('')

  // ── phase 2: summarise via FilePipeline ─────────────────────────────────────
  log('─── Phase 2: Summarise documents (FilePipeline) ───')
  const pipeline = new FilePipeline(fs, agent, '/pipelines')

  pipeline.step('summarise', async (ctx) => {
    await ctx.write('_start', 'pipeline started')
    const summaryLines: string[] = []

    for (const doc of DOCUMENTS) {
      const text = await ctx.read(`../../docs/${doc.name}`)  // relative to pipelineRoot
      const prompt =
        `Read the following document and write a single concise paragraph summarising ` +
        `its key points for future reference:\n\n${text}`
      const summary = await ctx.invoke(prompt)

      const summaryPath = doc.name.replace('.txt', '-summary.txt')
      await callTool('create_directory', { path: '/summaries' })
      await callTool('write_file', { path: `/summaries/${summaryPath}`, content: summary })
      await callTool('append_to_file', {
        path: '/summaries/_index.txt',
        content: `${summaryPath}\n`,
      })
      summaryLines.push(summaryPath)
      log(`  summarised → /summaries/${summaryPath}`)
    }

    return `Summarised ${summaryLines.length} documents`
  })

  const pipelineResult = await pipeline.run({ docsDir: '/docs' })
  log(`  Pipeline ${pipelineResult.ok ? 'succeeded' : 'failed'} in ${pipelineResult.durationMs}ms`)
  if (!pipelineResult.ok) log(`  Error: ${pipelineResult.error}`)
  log('')

  // ── phase 3: store key facts in FileMemory ──────────────────────────────────
  log('─── Phase 3: Store key facts in FileMemory ───')
  await mem.remember('opfs-key-facts', {
    standard: 'WHATWG',
    supportedSince: 'Chrome 86',
    webWorkerSync: true,
  })
  await mem.remember('strands-sdk-facts', {
    latestVersion: '0.5.0',
    language: 'TypeScript',
    defaultProvider: 'Amazon Bedrock',
  })
  await mem.remember('files-philosophy-sources', [
    'https://www.llamaindex.ai/blog/files-are-all-you-need',
    'https://vercel.com/blog/how-to-build-agents-with-filesystems-and-bash',
    'https://madalitso.me/notes/why-everyone-is-talking-about-filesystems/',
  ])
  log('  stored 3 memory entries')
  const allKeys = await mem.list()
  log(`  memory keys: ${allKeys.join(', ')}`)
  log('')

  // ── phase 4a: search files ──────────────────────────────────────────────────
  log('─── Phase 4a: search_files for "vector" ───')
  const fileSearchResult = await callTool('search_files', {
    directory: '/summaries',
    query: 'vector',
  })
  log(fileSearchResult || '  (no matches)')
  log('')

  // ── phase 4b: search memory ─────────────────────────────────────────────────
  log('─── Phase 4b: FileMemory.search for "Bedrock" ───')
  const memHits = await mem.search('Bedrock')
  if (memHits.length) {
    memHits.forEach((h) => log(`  key="${h.key}" excerpt: ${h.excerpt}`))
  } else {
    log('  (no matches)')
  }
  log('')

  // ── phase 5: grounded Q&A ───────────────────────────────────────────────────
  log('─── Phase 5: Grounded Q&A from files ───')
  const summaryFiles = DOCUMENTS.map((d) =>
    `/summaries/${d.name.replace('.txt', '-summary.txt')}`,
  )
  const context = await callTool('read_multiple_files', { paths: summaryFiles })

  const answer = await agent.invoke(
    `Using ONLY the following summaries, answer the question: ` +
    `"What are the main arguments for using files instead of vector databases for agent memory?"\n\n` +
    `SUMMARIES:\n${context}`,
  )
  log(`Agent answer:\n${String(answer)}\n`)

  // ── final index ─────────────────────────────────────────────────────────────
  log('─── Final filesystem index ───')
  const index = await callTool('index_file_system', {})
  log(index)

  log('\n════════════════════════════════════════════════════')
  log(' Demo complete — all state lives in OPFS files.')
  log(' Open browser DevTools → Application → Storage → OPFS to inspect.')
  log('════════════════════════════════════════════════════')
}
