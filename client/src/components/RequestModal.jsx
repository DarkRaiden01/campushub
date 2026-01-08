import React, { useState } from 'react'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api/bazaar'

export default function RequestModal({ post, onClose, onSent }){
  const [message, setMessage] = useState('Hi! I\'d like some help with this skill.')
  const [sending, setSending] = useState(false)

  async function send(){
    try{
      setSending(true)
      await axios.post(`${API_BASE}/request/${post._id}`, { message, fromName: 'Student' })
      setSending(false)
      onSent && onSent()
    }catch(err){
      console.error(err)
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-md p-6">
        <h3 className="text-xl font-semibold">Request help for {post.skillName}</h3>
        <p className="text-sm text-gray-500">To: {post.user?.name || 'Tutor'}</p>

        <textarea value={message} onChange={e=>setMessage(e.target.value)} className="w-full mt-4 p-2 border rounded" rows={4}></textarea>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 rounded">Cancel</button>
          <button onClick={send} disabled={sending} className="px-4 py-1 bg-indigo-600 text-white rounded">{sending ? 'Sending...' : 'Send Request'}</button>
        </div>
      </div>
    </div>
  )
}
