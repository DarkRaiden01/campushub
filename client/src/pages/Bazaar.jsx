import React, { useEffect, useState } from 'react'
import axios from 'axios'
import TutorCard from '../components/TutorCard'
import RequestModal from '../components/RequestModal'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api/bazaar'

export default function Bazaar(){
  const [type, setType] = useState('Offering')
  const [posts, setPosts] = useState([])
  const [selected, setSelected] = useState(null)

  useEffect(()=>{ fetchPosts() }, [type])

  async function fetchPosts(){
    const res = await axios.get(`${API_BASE}/posts`, { params: { type } })
    if(res.data && res.data.data) setPosts(res.data.data)
  }

  const topId = posts.length ? posts[0].user?._id : null

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setType('Offering')} className={`px-4 py-2 rounded ${type==='Offering' ? 'bg-indigo-600 text-white' : 'bg-white'}`}>People Teaching</button>
          <button onClick={() => setType('Requesting')} className={`px-4 py-2 rounded ${type==='Requesting' ? 'bg-indigo-600 text-white' : 'bg-white'}`}>People Learning</button>
        </div>
        <div className="text-sm text-gray-600">Showing: <strong>{type}</strong></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {posts.map(p => (
          <TutorCard key={p._id}
            post={p}
            isTop={p.user && p.user._id === topId}
            onRequest={() => setSelected(p)} />
        ))}
      </div>

      {selected && <RequestModal post={selected} onClose={() => setSelected(null)} onSent={() => { setSelected(null); }} />}
    </div>
  )
}
