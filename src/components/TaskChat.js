'use client'
// PraskForce1 — Per-Task Collaborative Chat
//
// Brad opens this on a specific task to explain a resolution in natural
// language, ask for guidance, or describe what happened. Claude reads the
// task context + matched history + the conversation, and on each turn
// extracts: (1) any resolution data it can pull from the message, (2) any
// follow-up tasks Brad implied, and (3) a focused clarifying question if
// something important is missing.
//
// This is NOT the global AI Config chat — it's scoped to one task and
// every message is stored against that task so the learning system has
// the full why, not just the structured fields.

import { useState, useEffect, useRef } from 'react'
import { listChat, appendChat, findSimilarResolutions, buildContextSnapshot, createResolution } from '@/lib/task-learning'
import { addTask } from '@/lib/tasks'
import { buildTaskChatPrompt } from '@/lib/agent-prompts'
import { getConfig } from '@/lib/config'
import { Send, MessageCircle, X } from 'lucide-react'

export default function TaskChat({ task, onClose, onResolutionLogged, onTasksAdded }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    listChat(task.id).then(setMessages)
  }, [task.id])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  async function handleSend() {
    if (!input.trim() || sending) return
    const config = getConfig()
    if (!config.ai?.api_key) {
      setError('Add your Claude API key in Settings → AI & Outreach')
      return
    }
    setError(null)
    setSending(true)

    const userMsg = await appendChat(task.id, 'user', input.trim())
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')

    try {
      const snapshot = buildContextSnapshot(task)
      const matches = await findSimilarResolutions(task.type, snapshot, 3)
      const prompt = buildTaskChatPrompt({
        task,
        snapshot,
        matches,
        message: userMsg.content,
        history: messages,
      })

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
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error.message)
      const text = data.content?.[0]?.text || ''
      const cleaned = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)

      // Auto-log resolution if Claude extracted enough.
      let extracted = null
      if (parsed.extracted_resolution && parsed.extracted_resolution.resolution_action) {
        const er = parsed.extracted_resolution
        await createResolution({
          task_id: task.id,
          resolution_type: 'explained',
          resolution_action: er.resolution_action,
          resolution_channel: er.resolution_channel || null,
          resolution_outcome: er.resolution_outcome || null,
          resolution_notes: er.resolution_notes || userMsg.content,
          context_snapshot: snapshot,
          task_category: task.type,
        })
        extracted = er
        onResolutionLogged && onResolutionLogged()
      }

      // Auto-create follow-up tasks if any.
      if (Array.isArray(parsed.followup_tasks) && parsed.followup_tasks.length > 0) {
        for (const ft of parsed.followup_tasks) {
          addTask({
            type: ft.type || 'CUSTOM',
            description: ft.description || '',
            contact: task.contact,
            property: task.property,
            deadline: ft.deadline || null,
            priority: ft.priority || 'medium',
            status: 'pending',
            lifecycle: 'CREATED',
          })
        }
        onTasksAdded && onTasksAdded(parsed.followup_tasks.length)
      }

      const replyContent = parsed.needs_clarification
        ? `${parsed.reply}\n\n${parsed.needs_clarification}`
        : parsed.reply
      const assistantMsg = await appendChat(task.id, 'assistant', replyContent, {
        extracted_resolution: extracted,
        followup_tasks: parsed.followup_tasks || [],
      })
      setMessages([...next, assistantMsg])
    } catch (e) {
      setError('Chat failed: ' + e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="border border-blue-200 bg-blue-50/40 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-blue-100/60 flex items-center justify-between border-b border-blue-200">
        <div className="text-xs font-semibold text-blue-800 flex items-center gap-1.5">
          <MessageCircle size={12} /> Task Chat
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>

      <div ref={scrollRef} className="px-3 py-2 max-h-64 overflow-y-auto space-y-2">
        {messages.length === 0 && (
          <div className="text-[11px] text-gray-500 italic text-center py-4">
            Tell me what's happening with this task. I'll log the resolution and
            create any follow-ups automatically.
          </div>
        )}
        {messages.map(m => (
          <div
            key={m.id}
            className={`text-[11px] leading-relaxed rounded p-2 ${
              m.role === 'user'
                ? 'bg-white border border-gray-200 ml-6'
                : 'bg-blue-100/60 border border-blue-200 mr-6'
            }`}
          >
            <div className="text-[9px] font-semibold text-gray-500 uppercase mb-0.5">
              {m.role === 'user' ? 'You' : 'Assistant'}
            </div>
            <div className="whitespace-pre-wrap text-gray-800">{m.content}</div>
            {m.extracted_data?.extracted_resolution && (
              <div className="mt-1 text-[10px] text-green-700 italic">
                ✓ Logged as resolution
              </div>
            )}
            {m.extracted_data?.followup_tasks?.length > 0 && (
              <div className="text-[10px] text-amber-700 italic">
                + Created {m.extracted_data.followup_tasks.length} follow-up task(s)
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <div className="px-3 py-1 text-[10px] text-red-600 bg-red-50">{error}</div>}

      <div className="px-3 py-2 border-t border-blue-200 flex items-center gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="e.g. Called the architect, he's out until the 20th — push this back"
          disabled={sending}
          className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:border-blue-400 bg-white disabled:bg-gray-50"
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className={`p-1.5 rounded ${
            sending || !input.trim()
              ? 'bg-gray-200 text-gray-400'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  )
}
