import { useState } from 'react'
import './App.css'
import MelodyGenerator from './MelodyGenerator'
import ChordProgressionGenerator from './ChordProgressionGenerator'

function App() {
  const [activeTab, setActiveTab] = useState('melody'); // Default to melody tab

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100">
      {/* Tab navigation */}
      <div className="max-w-4xl mx-auto pt-6 px-4">
        <div className="flex border-b border-indigo-200">
          <button
            className={`px-6 py-3 font-medium text-lg rounded-t-lg ${
              activeTab === 'melody'
                ? 'bg-white text-indigo-700 border-t border-l border-r border-indigo-200'
                : 'bg-indigo-100 text-indigo-500 hover:bg-indigo-50 transition-colors'
            }`}
            onClick={() => setActiveTab('melody')}
          >
            Melody Generator
          </button>
          <button
            className={`px-6 py-3 font-medium text-lg rounded-t-lg ${
              activeTab === 'chords'
                ? 'bg-white text-indigo-700 border-t border-l border-r border-indigo-200'
                : 'bg-indigo-100 text-indigo-500 hover:bg-indigo-50 transition-colors'
            }`}
            onClick={() => setActiveTab('chords')}
          >
            Chord Progression
          </button>
        </div>
      </div>
      
      {/* Tab content */}
      <div className="tab-content">
        {activeTab === 'melody' ? (
          <MelodyGenerator />
        ) : (
          <ChordProgressionGenerator />
        )}
      </div>
    </div>
  )
}

export default App
