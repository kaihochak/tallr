import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/tauri'
import { listen } from '@tauri-apps/api/event'
import { window as tauriWindow } from '@tauri-apps/api/window'

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

interface Timer {
  projectId: string
  isRunning: boolean
  startedAt?: number
  elapsedMsTotal: number
  softLimitMinutes?: number
}

interface Snapshot {
  projects: Project[]
  tasks: AgentTask[]
  updatedAt: number
}

const getStateColor = (state: TaskState) => {
  switch (state) {
    case 'WAITING_USER': return '#ff9500'
    case 'ERROR': return '#ff3b30'
    case 'RUNNING': return '#007aff'
    case 'DONE': return '#34c759'
    case 'BLOCKED': return '#ff9500'
    default: return '#8e8e93'
  }
}

const getTimeSince = (timestamp: number) => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export default function App() {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isQuickSwitcherOpen, setIsQuickSwitcherOpen] = useState(false)
  const [timers, setTimers] = useState<Record<string, Timer>>({})

  useEffect(() => {
    // Load initial snapshot
    invoke<Snapshot>('get_snapshot').then(setSnap)

    // Listen for state updates
    const unlisten = listen<Snapshot>('state-update', (event) => {
      setSnap(event.payload)
    })

    return () => {
      unlisten.then(fn => fn())
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K to open quick switcher
      if (e.metaKey && e.key === 'k') {
        e.preventDefault()
        setIsQuickSwitcherOpen(true)
        return
      }

      // Escape to close quick switcher
      if (e.key === 'Escape' && isQuickSwitcherOpen) {
        setIsQuickSwitcherOpen(false)
        setSearchTerm('')
        return
      }

      // Arrow navigation and Enter when not in input
      if (!isQuickSwitcherOpen && filteredTasks.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedIndex(prev => Math.min(prev + 1, filteredTasks.length - 1))
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedIndex(prev => Math.max(prev - 1, 0))
        } else if (e.key === 'Enter') {
          e.preventDefault()
          const task = filteredTasks[selectedIndex]
          if (task) handleJumpToContext(task.projectId)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isQuickSwitcherOpen, filteredTasks, selectedIndex])

  // Reset selection when filtered tasks change
  useEffect(() => {
    setSelectedIndex(0)
  }, [filteredTasks])

  // Timer tick for updating running timers
  useEffect(() => {
    const interval = setInterval(() => {
      // Force re-render for running timers
      setTimers(prev => ({ ...prev }))
    }, 1000)
    
    return () => clearInterval(interval)
  }, [])

  const handleJumpToContext = async (projectId: string) => {
    try {
      await invoke('jump_to_context', { projectId })
    } catch (err) {
      console.error('Failed to jump to context:', err)
    }
  }

  const toggleAlwaysOnTop = async () => {
    const newState = !alwaysOnTop
    await tauriWindow.getCurrent().setAlwaysOnTop(newState)
    setAlwaysOnTop(newState)
  }

  const startTimer = (projectId: string, limitMinutes: number = 25) => {
    setTimers(prev => ({
      ...prev,
      [projectId]: {
        projectId,
        isRunning: true,
        startedAt: Date.now(),
        elapsedMsTotal: prev[projectId]?.elapsedMsTotal || 0,
        softLimitMinutes: limitMinutes
      }
    }))
  }

  const stopTimer = (projectId: string) => {
    setTimers(prev => {
      const timer = prev[projectId]
      if (!timer || !timer.isRunning) return prev
      
      return {
        ...prev,
        [projectId]: {
          ...timer,
          isRunning: false,
          elapsedMsTotal: timer.elapsedMsTotal + (Date.now() - (timer.startedAt || Date.now())),
          startedAt: undefined
        }
      }
    })
  }

  const resetTimer = (projectId: string) => {
    setTimers(prev => {
      const updated = { ...prev }
      delete updated[projectId]
      return updated
    })
  }

  const getTimerDisplay = (projectId: string) => {
    const timer = timers[projectId]
    if (!timer) return '0:00'
    
    let totalMs = timer.elapsedMsTotal
    if (timer.isRunning && timer.startedAt) {
      totalMs += Date.now() - timer.startedAt
    }
    
    const minutes = Math.floor(totalMs / 60000)
    const seconds = Math.floor((totalMs % 60000) / 1000)
    
    // Check if we've hit the soft limit
    if (timer.softLimitMinutes && minutes >= timer.softLimitMinutes) {
      // Show alert (would normally be a notification)
      console.log(`Timer alert: ${minutes}m elapsed for project ${projectId}`)
    }
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const filteredTasks = snap?.tasks.filter(task => {
    if (!searchTerm) return true
    const project = snap.projects.find(p => p.id === task.projectId)
    const searchLower = searchTerm.toLowerCase()
    return (
      task.title.toLowerCase().includes(searchLower) ||
      task.agent.toLowerCase().includes(searchLower) ||
      task.state.toLowerCase().includes(searchLower) ||
      project?.name.toLowerCase().includes(searchLower) ||
      task.details?.toLowerCase().includes(searchLower)
    )
  }) || []

  return (
    <div style={{ 
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f5f5f7',
      color: '#1d1d1f'
    }}>
      {/* Header */}
      <header style={{ 
        padding: '16px 20px',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #d2d2d7',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        WebkitAppRegion: 'drag' as any
      }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Tally</h3>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', WebkitAppRegion: 'no-drag' as any }}>
          <button
            onClick={toggleAlwaysOnTop}
            style={{
              padding: '4px 8px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: alwaysOnTop ? '#007aff' : '#e8e8ed',
              color: alwaysOnTop ? '#fff' : '#1d1d1f',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            {alwaysOnTop ? '📌' : '📍'}
          </button>
          <small style={{ opacity: 0.6 }}>
            {snap ? new Date(snap.updatedAt).toLocaleTimeString() : '—'}
          </small>
        </div>
      </header>

      {/* Search Bar */}
      <div style={{ padding: '12px 20px', backgroundColor: '#ffffff' }}>
        <input
          ref={(input) => {
            if (isQuickSwitcherOpen && input) {
              input.focus()
            }
          }}
          type="text"
          placeholder={isQuickSwitcherOpen ? "⌘K Quick switcher - Type to search..." : "Search projects, tasks, agents..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filteredTasks.length > 0) {
              e.preventDefault()
              const task = filteredTasks[0]
              handleJumpToContext(task.projectId)
              setIsQuickSwitcherOpen(false)
              setSearchTerm('')
            }
          }}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: isQuickSwitcherOpen ? '2px solid #007aff' : '1px solid #d2d2d7',
            borderRadius: '8px',
            fontSize: '14px',
            outline: 'none',
            backgroundColor: isQuickSwitcherOpen ? '#f0f8ff' : '#ffffff'
          }}
        />
        {isQuickSwitcherOpen && (
          <div style={{ 
            fontSize: '11px', 
            marginTop: '4px', 
            color: '#86868b',
            textAlign: 'center'
          }}>
            ↑↓ navigate • Enter select • Esc close
          </div>
        )}
      </div>

      {/* Task List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {!snap || filteredTasks.length === 0 ? (
          <div style={{ 
            textAlign: 'center',
            padding: '40px 20px',
            opacity: 0.5
          }}>
            {searchTerm ? (
              <p>No tasks match your search.</p>
            ) : (
              <>
                <p style={{ marginBottom: '8px' }}>No active tasks</p>
                <p style={{ fontSize: '12px' }}>
                  Agents will appear here when they post to<br />
                  <code style={{ 
                    backgroundColor: '#e8e8ed',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>http://127.0.0.1:4317</code>
                </p>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredTasks
              .sort((a, b) => b.lastEventAt - a.lastEventAt)
              .map((task, index) => {
                const project = snap.projects.find(p => p.id === task.projectId)
                const isSelected = index === selectedIndex
                return (
                  <div
                    key={task.id}
                    onClick={() => handleJumpToContext(task.projectId)}
                    style={{
                      padding: '12px 16px',
                      backgroundColor: isSelected ? '#e3f2fd' : '#ffffff',
                      borderRadius: '12px',
                      border: isSelected ? '2px solid #007aff' : '1px solid #d2d2d7',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      ':hover': {
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                      }
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
                      }
                      setSelectedIndex(index)
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.boxShadow = 'none'
                      }
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, marginBottom: '4px' }}>
                          {project?.name || 'Unknown Project'}
                        </div>
                        <div style={{ fontSize: '13px', color: '#86868b', marginBottom: '4px' }}>
                          {task.title} • {task.agent}
                        </div>
                        {task.details && (
                          <div style={{ 
                            fontSize: '12px',
                            color: '#1d1d1f',
                            marginTop: '6px',
                            padding: '6px 10px',
                            backgroundColor: '#f5f5f7',
                            borderRadius: '6px',
                            fontFamily: 'SF Mono, Monaco, monospace'
                          }}>
                            {task.details}
                          </div>
                        )}
                        {/* Timer controls */}
                        <div style={{ 
                          marginTop: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <span style={{ 
                            fontSize: '12px',
                            fontFamily: 'SF Mono, Monaco, monospace',
                            color: timers[task.projectId]?.isRunning ? '#007aff' : '#86868b'
                          }}>
                            ⏱️ {getTimerDisplay(task.projectId)}
                          </span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {!timers[task.projectId]?.isRunning ? (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    startTimer(task.projectId, 25)
                                  }}
                                  style={{
                                    padding: '2px 6px',
                                    fontSize: '10px',
                                    border: 'none',
                                    borderRadius: '4px',
                                    backgroundColor: '#34c759',
                                    color: 'white',
                                    cursor: 'pointer'
                                  }}
                                >
                                  25m
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    startTimer(task.projectId, 45)
                                  }}
                                  style={{
                                    padding: '2px 6px',
                                    fontSize: '10px',
                                    border: 'none',
                                    borderRadius: '4px',
                                    backgroundColor: '#ff9500',
                                    color: 'white',
                                    cursor: 'pointer'
                                  }}
                                >
                                  45m
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    stopTimer(task.projectId)
                                  }}
                                  style={{
                                    padding: '2px 6px',
                                    fontSize: '10px',
                                    border: 'none',
                                    borderRadius: '4px',
                                    backgroundColor: '#ff3b30',
                                    color: 'white',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Stop
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    resetTimer(task.projectId)
                                  }}
                                  style={{
                                    padding: '2px 6px',
                                    fontSize: '10px',
                                    border: 'none',
                                    borderRadius: '4px',
                                    backgroundColor: '#8e8e93',
                                    color: 'white',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Reset
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{ 
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        gap: '4px'
                      }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 500,
                          padding: '3px 8px',
                          borderRadius: '12px',
                          backgroundColor: getStateColor(task.state),
                          color: '#ffffff'
                        }}>
                          {task.state.replace('_', ' ')}
                        </span>
                        <span style={{ fontSize: '11px', color: '#86868b' }}>
                          {getTimeSince(task.lastEventAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{ 
        padding: '12px 20px',
        backgroundColor: '#ffffff',
        borderTop: '1px solid #d2d2d7',
        fontSize: '11px',
        color: '#86868b',
        textAlign: 'center'
      }}>
        ⌘K quick switch • ↑↓ navigate • Enter jump • Click to jump to IDE + Terminal
      </footer>
    </div>
  )
}