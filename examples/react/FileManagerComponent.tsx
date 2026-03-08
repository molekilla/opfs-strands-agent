/**
 * FileManagerComponent — React 19 file manager UI
 *
 * Demonstrates the useFileAgent hook in a self-contained chat-style component.
 * Type a natural-language command and press Enter / click "Run" to execute it.
 *
 * Example commands
 * ──────────────────────────────────────────────────────────────────────
 *   Write a file at /notes.txt with content "Hello, OPFS!"
 *   Read /notes.txt
 *   List the files in /
 *   Create a directory at /projects
 *   Get file info for /notes.txt
 *   Copy /notes.txt to /notes-backup.txt
 *   Delete /notes-backup.txt
 * ──────────────────────────────────────────────────────────────────────
 *
 * Usage in a React 19 app
 * ───────────────────────
 *   import { FileManagerComponent } from './examples/react/FileManagerComponent'
 *
 *   export default function App() {
 *     return <FileManagerComponent />
 *   }
 */

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useFileAgent } from './useFileAgent.ts'

// ─── sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    idle:          '#64748b',
    initialising:  '#f59e0b',
    ready:         '#22c55e',
    busy:          '#6366f1',
    error:         '#ef4444',
  }
  const colour = colours[status] ?? '#64748b'
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '999px',
        background: colour,
        color: '#fff',
        fontSize: '0.75rem',
        fontWeight: 600,
        textTransform: 'capitalize',
      }}
    >
      {status}
    </span>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export function FileManagerComponent() {
  const { status, lines, error, invoke, clearLines } = useFileAgent()
  const [prompt, setPrompt] = useState('')
  const outputRef = useRef<HTMLPreElement>(null)

  // Auto-scroll output as new lines arrive
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [lines])

  async function handleRun() {
    const trimmed = prompt.trim()
    if (!trimmed || status !== 'ready') return
    setPrompt('')
    await invoke(trimmed)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleRun()
    }
  }

  return (
    <div
      style={{
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        background: '#0f1117',
        color: '#e2e8f0',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '2rem 1rem',
        gap: '1.5rem',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <h1
          style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: 0,
          }}
        >
          OPFS File Agent
        </h1>
        <p style={{ color: '#94a3b8', marginTop: '0.4rem', fontSize: '0.9rem' }}>
          Powered by Strands Agents + opfs-worker (React&nbsp;19)
        </p>
      </div>

      {/* Status */}
      <StatusBadge status={status} />

      {/* Error banner */}
      {error && (
        <div
          style={{
            width: '100%',
            maxWidth: 760,
            background: '#450a0a',
            border: '1px solid #ef4444',
            borderRadius: '0.5rem',
            padding: '0.75rem 1rem',
            color: '#fca5a5',
            fontSize: '0.85rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Output */}
      <div
        style={{
          width: '100%',
          maxWidth: 760,
          background: '#1e2130',
          border: '1px solid #2d3148',
          borderRadius: '0.75rem',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: '#252840',
            padding: '0.6rem 1rem',
            fontSize: '0.78rem',
            color: '#6366f1',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            borderBottom: '1px solid #2d3148',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>Agent Output</span>
          <button
            onClick={clearLines}
            style={{
              background: 'none',
              border: '1px solid #4b5180',
              borderRadius: '0.25rem',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '0.72rem',
              padding: '2px 8px',
            }}
          >
            Clear
          </button>
        </div>
        <pre
          ref={outputRef}
          style={{
            margin: 0,
            padding: '1rem',
            whiteSpace: 'pre-wrap',
            fontFamily: "'Cascadia Code','Fira Code','Courier New',monospace",
            fontSize: '0.82rem',
            lineHeight: 1.7,
            color: '#a5f3fc',
            minHeight: 200,
            maxHeight: '50vh',
            overflowY: 'auto',
          }}
        >
          {lines.length
            ? lines.join('\n')
            : status === 'initialising'
              ? 'Initialising agent…'
              : 'Agent ready. Type a command below.'}
        </pre>
      </div>

      {/* Input */}
      <div style={{ width: '100%', maxWidth: 760, display: 'flex', gap: '0.5rem' }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='e.g. "Write a file at /hello.txt with content Hello!"'
          rows={2}
          disabled={status !== 'ready'}
          style={{
            flex: 1,
            background: '#1e2130',
            border: '1px solid #2d3148',
            borderRadius: '0.5rem',
            color: '#e2e8f0',
            fontSize: '0.9rem',
            padding: '0.6rem 0.9rem',
            resize: 'vertical',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={handleRun}
          disabled={status !== 'ready' || !prompt.trim()}
          style={{
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            border: 'none',
            borderRadius: '0.5rem',
            color: '#fff',
            cursor: status === 'ready' ? 'pointer' : 'not-allowed',
            fontWeight: 600,
            fontSize: '0.9rem',
            padding: '0 1.25rem',
            opacity: status === 'ready' && prompt.trim() ? 1 : 0.5,
            transition: 'opacity 0.2s',
          }}
        >
          Run
        </button>
      </div>

      <p style={{ color: '#475569', fontSize: '0.78rem', margin: 0 }}>
        Press <kbd style={{ background: '#1e2130', padding: '1px 5px', borderRadius: 3 }}>Enter</kbd> to run &nbsp;·&nbsp;
        <kbd style={{ background: '#1e2130', padding: '1px 5px', borderRadius: 3 }}>Shift+Enter</kbd> for newline
      </p>
    </div>
  )
}
