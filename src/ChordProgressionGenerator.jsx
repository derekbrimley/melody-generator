import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

function ChordProgressionGenerator() {
  const [key, setKey] = useState('C');
  const [scale, setScale] = useState('major');
  const [numChords, setNumChords] = useState(4);
  const [genre, setGenre] = useState('none');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [progression, setProgression] = useState(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Store the settings that were used for the generated progression
  const [generatedKey, setGeneratedKey] = useState('');
  const [generatedScale, setGeneratedScale] = useState('');
  const [generatedNumChords, setGeneratedNumChords] = useState(0);
  const [generatedGenre, setGeneratedGenre] = useState('');
  
  // References for audio playback
  const audioContext = useRef(null);
  const soundfont = useRef(null);
  const playbackTimer = useRef(null);
  const currentChordIndex = useRef(0);

  // Set up audio context and load soundfont
  useEffect(() => {
    const loadScript = (src) => {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };
    
    const initAudio = async () => {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/soundfont-player@0.12.0/dist/soundfont-player.min.js');
        
        // Initialize audio context
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext.current = new AudioContext();
        
        // Load piano soundfont
        if (window.Soundfont) {
          soundfont.current = await window.Soundfont.instrument(audioContext.current, 'acoustic_grand_piano');
        }
      } catch (error) {
        console.error('Error loading audio libraries:', error);
        setErrorMessage('Failed to load audio playback libraries. Please refresh the page.');
      }
    };
    
    initAudio();
    
    // Cleanup
    return () => {
      if (audioContext.current) {
        audioContext.current.close();
      }
      if (playbackTimer.current) {
        clearTimeout(playbackTimer.current);
      }
    };
  }, []);

  const generateProgression = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      // Store the current settings as the ones used for generation
      setGeneratedKey(key);
      setGeneratedScale(scale);
      setGeneratedNumChords(numChords);
      setGeneratedGenre(genre);

      // Call the backend to generate a chord progression
      const response = await axios.post(
        'http://localhost:8000/generate-progression/',
        null,
        { params: { key, scale, num_chords: numChords, genre } }
      );

      setProgression(response.data);
      setHasGenerated(true);
      setIsLoading(false);
    } catch (error) {
      console.error('Error generating chord progression:', error);
      setIsLoading(false);
      setErrorMessage(
        error.response
          ? `Server error: ${error.response.status} ${error.response.statusText}`
          : 'Could not connect to the progression generation server. Please check your connection.'
      );
    }
  };

  // Function to parse chord notation into playable notes
  const parseChord = (chordName) => {
    try {
      // Extract root note and chord type
      const match = chordName.match(/([A-G][#b]?)(.+)?/);
      if (!match) return [];
      
      const [_, root, type = ''] = match;
      
      // Define the note indices
      const noteIndices = {
        'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
        'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 
        'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
      };
      
      const rootIndex = noteIndices[root];
      if (rootIndex === undefined) return [];
      
      // Base MIDI note number (middle C = 60)
      const rootNote = 60 + rootIndex;
      
      // Define intervals for different chord types
      let intervals = [0, 4, 7]; // Major triad by default
      
      if (type === 'm' || type === 'min') intervals = [0, 3, 7]; // Minor triad
      else if (type === 'dim') intervals = [0, 3, 6]; // Diminished triad
      else if (type === 'aug') intervals = [0, 4, 8]; // Augmented triad
      else if (type === '7') intervals = [0, 4, 7, 10]; // Dominant 7th
      else if (type === 'maj7') intervals = [0, 4, 7, 11]; // Major 7th
      else if (type === 'm7' || type === 'min7') intervals = [0, 3, 7, 10]; // Minor 7th
      else if (type === 'dim7') intervals = [0, 3, 6, 9]; // Diminished 7th
      else if (type === 'm7b5' || type === 'half-dim') intervals = [0, 3, 6, 10]; // Half-diminished
      else if (type === 'sus4') intervals = [0, 5, 7]; // Suspended 4th
      else if (type === 'sus2') intervals = [0, 2, 7]; // Suspended 2nd
      else if (type === '6') intervals = [0, 4, 7, 9]; // Major 6th
      else if (type === 'm6' || type === 'min6') intervals = [0, 3, 7, 9]; // Minor 6th
      else if (type === '9') intervals = [0, 4, 7, 10, 14]; // Dominant 9th
      else if (type === 'maj9') intervals = [0, 4, 7, 11, 14]; // Major 9th
      else if (type === 'add9') intervals = [0, 4, 7, 14]; // Add9

      // Map intervals to actual MIDI note numbers
      return intervals.map(interval => rootNote + interval);
    } catch (error) {
      console.error('Error parsing chord:', error);
      return [];
    }
  };

  // Function to play a single chord
  const playChord = (chordName, duration = 1.0) => {
    if (!audioContext.current || !soundfont.current) {
      setErrorMessage('Audio playback is not available. Please refresh the page.');
      return;
    }
    
    // Resume audio context if suspended
    if (audioContext.current.state === 'suspended') {
      audioContext.current.resume();
    }
    
    // Parse the chord into individual notes
    const notes = parseChord(chordName);
    
    // Play each note in the chord
    if (notes.length > 0) {
      notes.forEach(note => {
        soundfont.current.play(note, audioContext.current.currentTime, {
          duration: duration,
          gain: 0.7
        });
      });
    }
  };

  // Function to play all chords in sequence
  const playProgression = () => {
    if (!progression || !progression.chords || progression.chords.length === 0) {
      return;
    }
    
    // Stop any ongoing playback
    if (isPlaying) {
      stopPlayback();
      return;
    }
    
    setIsPlaying(true);
    currentChordIndex.current = 0;
    
    // Play the first chord and set up a timer to play the rest
    const playNextChord = () => {
      if (currentChordIndex.current < progression.chords.length) {
        const chord = progression.chords[currentChordIndex.current];
        playChord(chord, 1.0); // Play each chord for 1 second
        
        currentChordIndex.current++;
        
        // Schedule the next chord
        playbackTimer.current = setTimeout(playNextChord, 1000); // 1 second per chord
      } else {
        // Finished playing all chords
        setIsPlaying(false);
        currentChordIndex.current = 0;
      }
    };
    
    // Start the sequence
    playNextChord();
  };

  // Function to stop playback
  const stopPlayback = () => {
    if (playbackTimer.current) {
      clearTimeout(playbackTimer.current);
      playbackTimer.current = null;
    }
    
    // Stop any currently playing sounds
    if (soundfont.current && typeof soundfont.current.stop === 'function') {
      soundfont.current.stop();
    }
    
    setIsPlaying(false);
    currentChordIndex.current = 0;
  };

  // Function to render chord notation with proper formatting
  const renderChord = (chord) => {
    // Split chord into root and type (e.g., "Cmaj7" -> "C" and "maj7")
    const match = chord.match(/([A-G][#b]?)(.+)?/);
    if (!match) return chord;

    const [_, root, type = ''] = match;
    return (
      <span className="font-medium">
        {root}
        <span className="text-indigo-600">{type}</span>
      </span>
    );
  };

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="p-8">
          <h1 className="text-3xl font-bold text-center text-indigo-800 mb-8">Chord Progression Generator</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="block text-indigo-800 font-medium">Key:</label>
                <select 
                  value={key} 
                  onChange={(e) => setKey(e.target.value)} 
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map(k => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              
              <div className="space-y-2">
                <label className="block text-indigo-800 font-medium">Scale:</label>
                <select 
                  value={scale} 
                  onChange={(e) => setScale(e.target.value)} 
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="major">Major</option>
                  <option value="minor">Minor</option>
                </select>
              </div>
              
              <div className="space-y-2">
                <label className="block text-indigo-800 font-medium">Genre:</label>
                <select 
                  value={genre} 
                  onChange={(e) => setGenre(e.target.value)} 
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="none">No specific genre</option>
                  <option value="pop">Pop</option>
                  <option value="rock">Rock</option>
                  <option value="jazz">Jazz</option>
                  <option value="classical">Classical</option>
                  <option value="blues">Blues</option>
                  <option value="folk">Folk</option>
                  <option value="electronic">Electronic</option>
                </select>
                <p className="text-sm text-gray-500 mt-1">
                  Influences the progression to follow patterns common in the selected genre.
                </p>
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="block text-indigo-800 font-medium">Number of Chords:</label>
                <input 
                  type="number" 
                  value={numChords} 
                  onChange={(e) => setNumChords(parseInt(e.target.value))} 
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  min="2"
                  max="8"
                />
                <div className="flex items-center mt-2">
                  <span className="text-sm text-gray-500">Shorter</span>
                  <input 
                    type="range" 
                    min="2" 
                    max="8" 
                    step="1" 
                    value={numChords} 
                    onChange={(e) => setNumChords(parseInt(e.target.value))} 
                    className="flex-1 mx-4 h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-sm text-gray-500">Longer</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex justify-center mt-6 mb-8">
            <button 
              onClick={generateProgression} 
              className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating...
                </span>
              ) : hasGenerated ? 'Generate New Progression' : 'Generate Progression'}
            </button>
          </div>
          
          {/* Error message display */}
          {errorMessage && (
            <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
              <p className="text-indigo-700 text-center">{errorMessage}</p>
            </div>
          )}
          
          {/* Show settings have changed message */}
          {hasGenerated && 
           (key !== generatedKey || 
            scale !== generatedScale || 
            numChords !== generatedNumChords ||
            genre !== generatedGenre) && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-600 text-center">
                <span className="font-semibold">Note:</span> Settings have changed. Click "Generate New Progression" to apply the new settings.
              </p>
            </div>
          )}
          
          {!hasGenerated && !isLoading && (
            <div className="p-8 bg-indigo-50 rounded-xl text-center">
              <h3 className="text-xl font-semibold text-indigo-700 mb-4">Ready to Create Chord Progressions</h3>
              <p className="text-indigo-600">
                Adjust the settings above and click "Generate Progression" to create your custom chord progression.
              </p>
            </div>
          )}
          
          {progression && hasGenerated && (
            <div className="bg-white rounded-xl p-6 shadow-inner">
              <div className="mb-4">
                <h2 className="text-xl text-indigo-800 font-semibold mb-2">Your Chord Progression</h2>
                <p className="text-indigo-600">
                  Generated in {generatedKey} {generatedScale}
                  {generatedGenre !== 'none' ? ` (${generatedGenre} style)` : ''}
                </p>
              </div>
              
              <div className="mt-6">
                <div className="flex flex-wrap gap-4 justify-center items-center">
                  {progression.chords.map((chord, index) => (
                    <div key={index} className="text-center">
                      <div className={`bg-indigo-100 px-4 py-3 flex items-center justify-center rounded-lg shadow-md ${
                        isPlaying && index === currentChordIndex.current - 1 ? 'bg-indigo-300' : ''
                      }`}>
                        <span className="text-xl font-semibold text-indigo-800">
                          {renderChord(chord)}
                        </span>
                        <span className="text-sm text-gray-600 ml-2 border-l border-indigo-200 pl-2">
                          {progression.numerals[index]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={playProgression}
                    className={`px-5 py-2 rounded-lg shadow-md font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${
                      isPlaying 
                        ? 'bg-red-500 hover:bg-red-600 focus:ring-red-500 text-white' 
                        : 'bg-green-500 hover:bg-green-600 focus:ring-green-500 text-white'
                    }`}
                    disabled={!progression || !soundfont.current}
                  >
                    <span className="flex items-center">
                      {isPlaying ? (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                          </svg>
                          Stop
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                          </svg>
                          Play Progression
                        </>
                      )}
                    </span>
                  </button>
                </div>
                
                {progression.description && (
                  <div className="mt-6 text-center text-indigo-700">
                    <p>{progression.description}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChordProgressionGenerator; 