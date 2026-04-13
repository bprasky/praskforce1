'use client'
import { useState, useEffect, useRef } from 'react'
import { getConfig } from '@/lib/config'
import { Zap, Send, Loader2, X, FileText, Pencil, Plus, Trash2 } from 'lucide-react'

const CHAT_KEY = 'pf1_config_chat'
const REFINED_KEY = 'pf1_refined_prompt'

export function getRefinedPrompt() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(REFINED_KEY) || ''
}

function loadChat() {
  try { return JSON.parse(localStorage.getItem(CHAT_KEY) || '[]') } catch { return [] }
}
function saveChat(msgs) {
  // Keep last 30 messages to avoid localStorage bloat
  localStorage.setItem(CHAT_KEY, JSON.stringify(msgs.slice(-30)))
}

const SYSTEM_PROMPT = `You are the AI configuration manager for PraskForce1, a property lead intelligence and sales automation platform for luxury building materials (natural stone, porcelain, hardwoods).

You have DIRECT CONTROL over the instruction documents that govern how the system operates. When the user asks you to change something, you DO it — you don't just suggest.

AVAILABLE ACTIONS (output these as JSON blocks when you need to modify docs):

To CREATE a new instruction doc:
\`\`\`action
{"action": "create", "name": "Doc Name", "content": "Full content of the new instruction document..."}
\`\`\`

To UPDATE an existing doc (by name):
\`\`\`action
{"action": "update", "name": "Exact Name of Existing Doc", "content": "Full replacement content..."}
\`\`\`

To DELETE a doc:
\`\`\`action
{"action": "delete", "name": "Exact Name of Doc to Delete"}
\`\`\`

To MERGE multiple docs into one:
\`\`\`action
{"action": "merge", "delete_names": ["Doc 1", "Doc 2"], "name": "New Merged Doc Name", "content": "Merged content..."}
\`\`\`

RULES:
- When the user says something like "emails should follow a strict format" — you create or update the relevant doc immediately, then confirm what you did
- When the user says "that's too wordy" or "simplify the quote process" — you update the doc with a cleaner version
- You can take multiple actions in one response (multiple action blocks)
- Always show the user a brief summary of what you changed, not the full doc content
- Keep instruction docs focused — one doc per concern, not mega-docs
- Use clear, imperative language in instruction docs (DO this, NEVER that, ALWAYS include)
- After making changes, the system auto-recompiles. You don't need to do anything extra.
- Be conversational. This is a dialogue, not a form.

CURRENT INSTRUCTIONS:
`

export default function AIConfigChat({ instructions, onInstructionsChanged, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [changes, setChanges] = useState([]) // track recent changes for display
  const chatRef = useRef(null)

  useEffect(() => {
    const saved = loadChat()
    if (saved.length > 0) setMessages(saved)
  }, [])

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages, loading])

  function buildSystemPrompt() {
    const docSummary = instructions.map(doc =>
      `[${doc.name}]${doc.task_id ? ` (${doc.task_id})` : ''}${doc.systems ? ` | Systems: ${doc.systems}` : ''}\n${doc.content.slice(0, 600)}${doc.content.length > 600 ? '...' : ''}`
    ).join('\n\n---\n\n')
    return SYSTEM_PROMPT + docSummary
  }

  function executeActions(text) {
    const actionBlocks = []
    const regex = /```action\s*([\s\S]*?)```/g
    let match
    while ((match = regex.exec(text)) !== null) {
      try {
        actionBlocks.push(JSON.parse(match[1].trim()))
      } catch {}
    }
    if (actionBlocks.length === 0) return []

    const executed = []
    actionBlocks.forEach(action => {
      if (action.action === 'create') {
        executed.push({ type: 'create', name: action.name })
        onInstructionsChanged({
          type: 'create',
          doc: {
            id: `inst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: action.name,
            task_id: null,
            category: null,
            systems: null,
            required_credentials: [],
            content: action.content,
            created_at: new Date().toISOString(),
          }
        })
      } else if (action.action === 'update') {
        executed.push({ type: 'update', name: action.name })
        onInstructionsChanged({ type: 'update', name: action.name, content: action.content })
      } else if (action.action === 'delete') {
        executed.push({ type: 'delete', name: action.name })
        onInstructionsChanged({ type: 'delete', name: action.name })
      } else if (action.action === 'merge') {
        executed.push({ type: 'merge', name: action.name, deleted: action.delete_names })
        ;(action.delete_names || []).forEach(n => onInstructionsChanged({ type: 'delete', name: n }))
        onInstructionsChanged({
          type: 'create',
          doc: {
            id: `inst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: action.name,
            content: action.content,
            created_at: new Date().toISOString(),
          }
        })
      }
    })
    return executed
  }

  // Strip action blocks from display text
  function cleanForDisplay(text) {
    return text.replace(/```action[\s\S]*?```/g, '').trim()
  }

  async function handleSend() {
    if (!input.trim() || loading) return
    const config = getConfig()
    if (!config.ai?.api_key) {
      setMessages(prev => [...prev, { role: 'user', content: input }, { role: 'assistant', content: 'Add your Claude API key in Settings → AI & Outreach first.' }])
      setInput('')
      return
    }

    const userMsg = { role: 'user', content: input }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)
    setInput('')
    setLoading(true)

    try {
      // Only send last 10 messages for context window efficiency
      const recentMsgs = newMsgs.slice(-10).map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.ai.api_key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: config.ai.model || 'claude-sonnet-4-20250514',
          max_tokens: 3000,
          system: buildSystemPrompt(),
          messages: recentMsgs,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error.message)
      const responseText = data.content?.[0]?.text || ''

      // Execute any actions in the response
      const executed = executeActions(responseText)
      if (executed.length > 0) setChanges(executed)

      const withResponse = [...newMsgs, { role: 'assistant', content: responseText, _actions: executed }]
      setMessages(withResponse)
      saveChat(withResponse)
    } catch (e) {
      const withError = [...newMsgs, { role: 'assistant', content: `Error: ${e.message}` }]
      setMessages(withError)
    } finally {
      setLoading(false)
    }
  }

  function handleClearChat() {
    setMessages([])
    localStorage.removeItem(CHAT_KEY)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col" style={{ height: '550px' }}>
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-white">
          <Zap size={16} />
          <div>
            <div className="text-sm font-semibold">AI Configuration</div>
            <div className="text-[10px] text-amber-100">Tell me how you want things done — I'll update the instructions</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleClearChat} className="text-[10px] text-white/60 hover:text-white/90">Clear</button>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X size={16} /></button>
        </div>
      </div>

      {/* Chat */}
      <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Zap size={24} className="mx-auto text-amber-300 mb-2" />
            <p className="text-sm text-gray-500 mb-1">Tell me what to change</p>
            <div className="space-y-1.5 mt-4 text-xs text-gray-400">
              <p>"Emails should always open with the property address and owner name"</p>
              <p>"Merge the follow-up and email docs into one outreach playbook"</p>
              <p>"Create a strict format for quote follow-ups — 3 days, 7 days, 14 days"</p>
              <p>"The Trello instructions are obsolete, delete them"</p>
              <p>"I want a warmer tone in cold outreach to individual buyers"</p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-amber-500 text-white'
                : 'bg-gray-50 text-gray-800 border border-gray-200'
            }`}>
              {msg.role === 'assistant' ? (
                <>
                  {cleanForDisplay(msg.content).split('\n').map((line, j) => (
                    <p key={j} className={j > 0 ? 'mt-1.5' : ''}>{line}</p>
                  ))}
                  {msg._actions?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                      {msg._actions.map((a, j) => (
                        <div key={j} className="flex items-center gap-1.5 text-[10px]">
                          {a.type === 'create' && <><Plus size={10} className="text-green-500" /><span className="text-green-700">Created: {a.name}</span></>}
                          {a.type === 'update' && <><Pencil size={10} className="text-amber-500" /><span className="text-amber-700">Updated: {a.name}</span></>}
                          {a.type === 'delete' && <><Trash2 size={10} className="text-red-500" /><span className="text-red-600">Deleted: {a.name}</span></>}
                          {a.type === 'merge' && <><FileText size={10} className="text-blue-500" /><span className="text-blue-700">Merged → {a.name}</span></>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-gray-500">
              <Loader2 size={14} className="animate-spin" /> Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-3 shrink-0">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Tell me what to change, create, or fix..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400"
            disabled={loading}
          />
          <button onClick={handleSend} disabled={loading || !input.trim()} className="px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
