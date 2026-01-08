import React from 'react'
import Bazaar from './pages/Bazaar'

export default function App(){
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-teal-50 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-extrabold text-gray-800">Skill-Swap Bazaar</h1>
          <p className="text-gray-600">Peer-to-peer learning — teach, learn, and earn skill points.</p>
        </header>

        <Bazaar />
      </div>
    </div>
  )
}
