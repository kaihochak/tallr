import React, { useEffect, useState } from 'react'

type TaskState = 'RUNNING'|'WAITING_USER'|'BLOCKED'|'ERROR'|'DONE'|'IDLE'

interface Project {
  id: string
  name: string
  repoPath: string
  preferredIDE: 'cursor' | 'vscode' | 'webstorm' | 'other'
  githubUrl?: string
  createdAt: number
  updatedAt: number
}

interface AgentTask {
  id: string
  projectId: string
  agent: 'claude'|'gemini'|'codecs'|'custom'
  title: string
  state: TaskState
  details?: string
  lastEventAt: number
  createdAt: number
  updatedAt: number
  snoozedUntil?: number
}

interface Snapshot {
  projects: Project[]
  tasks: AgentTask[]
  updatedAt: number
}

export default function App() {
  const [snap, setSnap] = useState<Snapshot | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/snapshot.json', { cache: 'no-store' })
        if (res.ok) setSnap(await res.json())
      } catch {}
    }
    load()
    const id = setInterval(load, 2000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui', padding: 12, width: 420 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Tally (Beta)</h3>
        <small>{snap ? new Date(snap.updatedAt).toLocaleTimeString() : '—'}</small>
      </header>
      {!snap || snap.tasks.length === 0 ? (
        <p style={{ opacity: 0.7 }}>No tasks yet. Post to <code>http://127.0.0.1:4317</code> or add a test task.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0' }}>
          {snap.tasks.sort((a,b)=>b.lastEventAt - a.lastEventAt).map(t => {
            const p = snap.projects.find(x => x.id === t.projectId)
            return (
              <li key={t.id} style={{ padding: 8, border: '1px solid #ddd', borderRadius: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <strong>{p?.name ?? 'Unknown Project'}</strong>
                    <div style={{ fontSize: 13, opacity: 0.8 }}>{t.title} — <em>{t.agent}</em></div>
                  </div>
                  <span style={{ fontSize: 12, padding: '2px 6px', borderRadius: 6, border: '1px solid #ccc' }}>{t.state}</span>
                </div>
                {t.details && <div style={{ marginTop: 6, fontSize: 13, whiteSpace: 'pre-wrap' }}>{t.details}</div>}
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>Last update: {new Date(t.lastEventAt).toLocaleTimeString()}</div>
              </li>
            )
          })}
        </ul>
      )}
      <footer style={{ fontSize: 12, opacity: 0.7 }}>© {new Date().getFullYear()} Tally (starter)</footer>
    </div>
  )
}
