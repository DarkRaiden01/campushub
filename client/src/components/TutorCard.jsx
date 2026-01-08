import React from 'react'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api/bazaar'

function borderClass(category){
  if(category === 'Creative') return 'border-purple-500'
  if(category === 'Academic') return 'border-blue-500'
  if(category === 'Tech') return 'border-green-500'
  return 'border-gray-300'
}

export default function TutorCard({ post, isTop, onRequest }){
  const user = post.user || {}

  return (
    <div className={`rounded-lg p-4 bg-white shadow-sm border-2 ${borderClass(post.category)} transform hover:scale-[1.01] transition` }>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-400 to-teal-300 rounded-full flex items-center justify-center text-white font-bold">{(user.name||'U').charAt(0)}</div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">{user.name || 'Unknown'}</h3>
              {isTop && <span title="Top-ranked" className="text-yellow-500">🏆</span>}
            </div>
            <div className="text-sm text-gray-500">{post.skillName} • <span className="font-medium">{post.category}</span></div>
          </div>
        </div>
        <div className="text-center">
          <div className="bg-indigo-600 text-white px-3 py-1 rounded-full text-sm font-bold">{user.skillPoints || 0} pts</div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-gray-600">{post.type}</div>
        <div>
          <button onClick={() => onRequest(post)} className="px-3 py-1 bg-amber-400 rounded-md font-semibold">Request Help</button>
        </div>
      </div>
    </div>
  )
}
