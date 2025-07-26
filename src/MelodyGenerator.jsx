import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

// Main application component
function MelodyGenerator() {
  const [key, setKey] = useState('C');
  const [scale, setScale] = useState('major');
  const [length, setLength] = useState(8);
  const [tempo, setTempo] = useState(120); // Default tempo in BPM
  const [coherence, setCoherence] = useState(0.7); // Default coherence value
  const [timeSignature, setTimeSignature] = useState('4/4'); // Add time signature state
  const [genre, setGenre] = useState('none'); // Add genre state with default "none"
  
  // Store the settings that were used for the generated melody
  const [generatedKey, setGeneratedKey] = useState('');
  const [generatedScale, setGeneratedScale] = useState('');
  const [generatedLength, setGeneratedLength] = useState(0);
  const [generatedTempo, setGeneratedTempo] = useState(0);
  const [generatedCoherence, setGeneratedCoherence] = useState(0);
  const [generatedTimeSignature, setGeneratedTimeSignature] = useState(''); // Add generated time signature state
  const [generatedGenre, setGeneratedGenre] = useState(''); // Add generated genre state
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [melody, setMelody] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingError, setLoadingError] = useState(null);
  const [noteData, setNoteData] = useState([]);
  const [hasGenerated, setHasGenerated] = useState(false); // Track if the user has generated a melody
  
  // References for audio playback
  const audioContext = useRef(null);
  const soundfont = useRef(null);
  const player = useRef(null);
  
  // Load the necessary libraries on component mount
  useEffect(() => {
    // Load scripts dynamically
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
        await loadScript('https://cdn.jsdelivr.net/npm/midi-player-js@2.0.16/browser/midiplayer.min.js');
        await loadScript('https://cdn.jsdelivr.net/npm/soundfont-player@0.12.0/dist/soundfont-player.min.js');
        
        // Initialize audio context
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext.current = new AudioContext();
        
        // Load piano soundfont
        if (window.Soundfont) {
          soundfont.current = await window.Soundfont.instrument(audioContext.current, 'acoustic_grand_piano');
        }
      } catch (error) {
        console.error('Error loading libraries:', error);
        setLoadingError('Failed to load audio playback libraries. Please refresh the page.');
      }
    };
    
    initAudio();
    
    // Cleanup
    return () => {
      if (audioContext.current) {
        audioContext.current.close();
      }
    };
  }, []);

  // Function to parse MIDI data and extract notes
  const parseMidiNotes = (midiBase64) => {
    try {
      // Convert Base64 string to ArrayBuffer
      const binary = atob(midiBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      
      // Create a temporary player to extract note data
      const tempPlayer = new window.MidiPlayer.Player();
      tempPlayer.loadArrayBuffer(bytes.buffer);
      
      // Get all events from the player
      const allTracks = tempPlayer.getEvents();
      if (!allTracks || allTracks.length <= 1) { // First item is header, not a track
        console.error("No tracks found in the MIDI file");
        return [];
      }
      
      // Find all note events across all tracks
      const noteOnEvents = [];
      const noteOffEvents = [];
      
      // Skip the first item which is the header, not a track
      for (let i = 1; i < allTracks.length; i++) {
        const trackEvents = allTracks[i];
        if (!trackEvents || trackEvents.length === 0) continue;
        
        console.log(`Checking MIDI track ${i} with ${trackEvents.length} events`);
        
        trackEvents.forEach(event => {
          if (event.name === 'Note on' && event.velocity > 0) {
            noteOnEvents.push({
              noteNumber: event.noteNumber,
              noteName: event.noteName,
              tick: event.tick,
              velocity: event.velocity
            });
          } else if ((event.name === 'Note off') || (event.name === 'Note on' && event.velocity === 0)) {
            noteOffEvents.push({
              noteNumber: event.noteNumber,
              tick: event.tick
            });
          }
        });
      }
      
      if (noteOnEvents.length === 0) {
        console.error("No note events found in any MIDI track");
        return [];
      }
      
      console.log(`Found ${noteOnEvents.length} note-on events and ${noteOffEvents.length} note-off events`);
      
      // Match note on/off events to create complete notes with durations
      const notes = [];
      for (const noteOn of noteOnEvents) {
        // Find the corresponding note off event
        const noteOff = noteOffEvents.find(off => 
          off.noteNumber === noteOn.noteNumber && off.tick > noteOn.tick
        );
        
        if (noteOff) {
          notes.push({
            noteName: noteOn.noteName,
            noteNumber: noteOn.noteNumber,
            startTick: noteOn.tick,
            endTick: noteOff.tick,
            durationTicks: noteOff.tick - noteOn.tick,
            velocity: noteOn.velocity
          });
          
          // Remove the used note off event to avoid reusing it
          const index = noteOffEvents.indexOf(noteOff);
          if (index > -1) {
            noteOffEvents.splice(index, 1);
          }
        }
      }
      
      // Sort notes by start time
      notes.sort((a, b) => a.startTick - b.startTick);
      
      // Calculate ticks per quarter note (division)
      const ticksPerQuarter = tempPlayer.division;
      
      // Convert tick durations to beat durations
      const notesWithBeats = notes.map(note => ({
        ...note,
        durationBeats: note.durationTicks / ticksPerQuarter
      }));
      
      // Clean up the temporary player
      tempPlayer.stop();
      
      return notesWithBeats;
    } catch (error) {
      console.error("Error parsing MIDI notes:", error);
      return [];
    }
  };

  const generateMelody = async () => {
    try {
      setIsLoading(true);
      setLoadingError(null); // Reset any previous errors
      
      // Store the current settings as the ones used for generation
      setGeneratedKey(key);
      setGeneratedScale(scale);
      setGeneratedLength(length);
      setGeneratedTempo(tempo);
      setGeneratedCoherence(coherence);
      setGeneratedTimeSignature(timeSignature);
      setGeneratedGenre(genre); // Store the genre used for generation
      
      // Get both the MIDI data and the download URL
      const response = await axios.post(
        'http://localhost:8000/generate-melody/',
        null,
        { params: { key, scale, length, coherence, tempo, time_signature: timeSignature, genre } }
      );
      
      setMelody(response.data);
      setIsLoading(false);
      setHasGenerated(true); // Mark that the user has generated a melody
      
      // If we have the necessary libraries, set up the player
      if (window.MidiPlayer && soundfont.current && response.data.midi_base64) {
        setupMidiPlayer(response.data.midi_base64);
        
        // Parse MIDI data to extract notes
        const parsedNotes = parseMidiNotes(response.data.midi_base64);
        setNoteData(parsedNotes);
      } else {
        console.warn('Missing dependencies for MIDI playback');
        if (!window.MidiPlayer) {
          setLoadingError('MIDI player library could not be loaded. Playback may not work.');
        }
      }
    } catch (error) {
      console.error('Error generating melody:', error);
      setIsLoading(false);
      
      // Check for specific error messages in the response
      if (error.response && error.response.data && 
          (error.response.data.detail || '').includes('key_number')) {
        setLoadingError(
          'There was an error with the selected key. This key may not be supported by the backend. ' + 
          'Please try another key like C, G, or D major.'
        );
      } else {
        setLoadingError(
          error.response 
            ? `Server error: ${error.response.status} ${error.response.statusText}`
            : 'Could not connect to the melody generation server. Please check your connection.'
        );
      }
    }
  };
  
  const setupMidiPlayer = (midiBase64) => {
    try {
      // Convert Base64 string to ArrayBuffer
      const binary = atob(midiBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      
      // Stop any existing player
      if (player.current) {
        player.current.stop();
      }
      
      // Create a new player with the current tempo
      player.current = new window.MidiPlayer.Player((event) => {
        if (event.name === 'Note on' && event.velocity > 0) {
          // Calculate actual duration based on tempo to prevent notes from being cut off
          const duration = event.duration ? (60 / generatedTempo) * event.duration : 3;
          
          soundfont.current.play(event.noteName, audioContext.current.currentTime, { 
            gain: event.velocity / 100,
            duration: duration // Dynamic duration based on tempo and note length
          });
        }
      });
      
      // Configure player
      player.current.loadArrayBuffer(bytes.buffer);
      
      // Adjust playback speed - critical for tempo to take effect
      player.current.timeToEvent = function(time) {
        const msPerTick = (60000 / (generatedTempo * this.division)); 
        return Math.round(time / msPerTick);
      };
      
      // Log tempo settings for debugging
      console.log(`Setting tempo to ${generatedTempo} BPM`);
      console.log(`MIDI division: ${player.current.division} ticks per quarter note`);
      
      // Convert BPM to microseconds per beat (standard MIDI tempo unit)
      const microsecondsPerBeat = Math.floor(60000000 / generatedTempo);
      
      // Apply tempo in multiple ways to ensure it takes effect
      player.current.setTempo(generatedTempo);
      
      // Custom playback speed control
      player.current.speed = 1.0; // Reset speed first
      
      // Direct MIDI tempo modification - find and modify all tempo events
      try {
        const tracks = player.current.getEvents();
        let tempoEventsFound = 0;
        
        // Look through all tracks for tempo events
        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i];
          if (!Array.isArray(track)) continue;
          
          // Find tempo events in this track
          for (let j = 0; j < track.length; j++) {
            const event = track[j];
            if (event.name === 'Set Tempo' || event.type === 0x51) {
              // Found a tempo event, modify it
              event.microsecondsPerBeat = microsecondsPerBeat;
              tempoEventsFound++;
              console.log(`Modified tempo event #${tempoEventsFound}`);
            }
          }
        }
        
        // If no tempo events found, create one
        if (tempoEventsFound === 0) {
          console.log("No tempo events found in MIDI, custom tempo handling will be used");
          
          // Apply tempo through alternative means
          if (player.current.tempo) {
            player.current.tempo = microsecondsPerBeat;
            console.log("Applied tempo via player.tempo property");
          }
          
          // Override the tick calculation to force tempo
          const originalGetTick = player.current.getTick.bind(player.current);
          player.current.getTick = function() {
            const tick = originalGetTick();
            return tick;
          };
        }
      } catch (err) {
        console.log('Error modifying MIDI tempo events:', err);
      }
      
      // When playback ends
      player.current.on('endOfFile', () => {
        console.log('Playback ended');
        setIsPlaying(false);
      });
    } catch (error) {
      console.error('Error setting up MIDI player:', error);
      setLoadingError('Failed to set up MIDI player. Please try again.');
    }
  };
  
  const playMelody = () => {
    if (!player.current) return;
    
    // Resume audio context if it's suspended (browser policy requires user interaction)
    if (audioContext.current.state === 'suspended') {
      audioContext.current.resume();
    }
    
    // Ensure player is at the beginning before playing
    if (player.current.isPlaying()) {
      player.current.stop();
    }
    
    // Reset position to the beginning
    player.current.skipToSeconds(0);
    
    // Debug output to confirm tempo
    console.log(`Playing at ${generatedTempo} BPM`);
    console.log(`MIDI division: ${player.current.division} ticks per quarter note`);
    
    // Convert BPM to microseconds per beat (standard MIDI tempo unit)
    const microsecondsPerBeat = Math.floor(60000000 / generatedTempo);
    
    // Apply tempo through multiple mechanisms to ensure it takes effect
    player.current.setTempo(generatedTempo);
    
    // Custom playback speed calculation
    // Override tick-to-time calculations to force tempo
    player.current.timeToEvent = function(time) {
      const msPerTick = (60000 / (generatedTempo * this.division)); 
      return Math.round(time / msPerTick);
    };
    
    // Apply tempo to all tempo events again
    try {
      const tracks = player.current.getEvents();
      
      // Look through all tracks for tempo events
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        if (!Array.isArray(track)) continue;
        
        // Find tempo events in this track
        for (let j = 0; j < track.length; j++) {
          const event = track[j];
          if (event.name === 'Set Tempo' || event.type === 0x51) {
            // Found a tempo event, modify it
            event.microsecondsPerBeat = microsecondsPerBeat;
          }
        }
      }
    } catch (err) {
      console.log('Error modifying MIDI tempo events during playback:', err);
    }
    
    player.current.play();
    setIsPlaying(true);
  };
  
  const stopMelody = () => {
    if (!player.current) return;
    
    // Log that we're trying to stop the melody
    console.log('Stopping melody playback');
    
    // Need to explicitly stop the player
    player.current.stop();
    
    // Stop all currently playing notes
    if (soundfont.current) {
      // Try multiple methods to stop all notes
      if (typeof soundfont.current.stop === 'function') {
        console.log('Using soundfont.stop() method');
        soundfont.current.stop();
      } else if (typeof soundfont.current.stopAll === 'function') {
        console.log('Using soundfont.stopAll() method');
        soundfont.current.stopAll();
      } else {
        console.log('No direct stop method found, stopping individual notes');
        // Some soundfont implementations don't have a stop method
        // Try to stop any potentially playing notes (common piano range)
        for (let noteNum = 21; noteNum <= 108; noteNum++) {
          if (typeof soundfont.current.stop === 'function') {
            try {
              // Some implementations let you stop by MIDI number
              soundfont.current.stop(noteNum);
            } catch (e) {
              // Ignore errors
            }
          }
        }
      }
    }
    
    // Hard reset approach - create a new audio context if sounds are still playing
    if (audioContext.current && audioContext.current.state === 'running') {
      try {
        // Suspend the context temporarily
        audioContext.current.suspend().then(() => {
          // Safely recreate the soundfont after suspension
          if (window.Soundfont) {
            window.Soundfont.instrument(audioContext.current, 'acoustic_grand_piano')
              .then(instrument => {
                soundfont.current = instrument;
                // Resume the context after soundfont is loaded
                audioContext.current.resume();
              });
          } else {
            // Just resume if we can't reload the soundfont
            audioContext.current.resume();
          }
        });
      } catch (e) {
        console.error('Error handling audio context during stop:', e);
      }
    }
    
    setIsPlaying(false);
  };
  
  // Function to render the note data table
  const renderNoteTable = () => {
    if (noteData.length === 0) return null;
    
    // Organize notes by measures (assuming 4 beats per measure)
    const beatsPerMeasure = 4;
    const notesByMeasure = {};
    
    noteData.forEach(note => {
      const startBeat = note.startTick / player.current.division;
      const measureIndex = Math.floor(startBeat / beatsPerMeasure);
      
      if (!notesByMeasure[measureIndex]) {
        notesByMeasure[measureIndex] = [];
      }
      
      notesByMeasure[measureIndex].push(note);
    });
    
    // Create an array of measure indices for rendering
    const measures = Object.keys(notesByMeasure).sort((a, b) => parseInt(a) - parseInt(b));
    
    // Format duration to remove trailing zeros
    const formatDuration = (duration) => {
      const formatted = duration.toFixed(2);
      return formatted.endsWith('.00') ? formatted.slice(0, -3) : 
             formatted.endsWith('0') ? formatted.slice(0, -1) : 
             formatted;
    };

    const tableStyle = {
      borderCollapse: 'collapse',
      borderSpacing: 0,
      border: '2px solid #4F46E5',
      width: '100%'
    };

    const cellStyle = {
      border: '2px solid #4F46E5',
      padding: '8px',
      margin: 0
    };

    const headerCellStyle = {
      ...cellStyle,
      backgroundColor: '#EEF2FF',
      fontWeight: 'bold',
      color: '#4338CA'
    };

    const measureCellStyle = {
      ...cellStyle,
      backgroundColor: '#EEF2FF',
      fontWeight: 'bold',
      textAlign: 'center'
    };

    const labelCellStyle = {
      ...cellStyle,
      backgroundColor: '#EEF2FF',
      fontWeight: 'bold',
      textAlign: 'center',
      width: '100px' // Give a fixed width to the label cells for better alignment
    };
    
    return (
      <div className="overflow-x-auto mt-6 mb-8">
        <h3 className="text-lg font-semibold text-indigo-700 mb-4">Melody Notes</h3>
        
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={headerCellStyle}>Measure</th>
              <th style={headerCellStyle} colSpan={Math.max(...measures.map(m => notesByMeasure[m].length), 0)}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {measures.map((measureIndex) => {
              const measureNotes = notesByMeasure[measureIndex];
              
              // Sort notes by start time within the measure
              measureNotes.sort((a, b) => a.startTick - b.startTick);
              
              return (
                <React.Fragment key={measureIndex}>
                  {/* Notes row */}
                  <tr>
                    <td style={measureCellStyle}>
                      {parseInt(measureIndex) + 1}
                    </td>
                    {measureNotes.map((note, i) => (
                      <td key={i} style={cellStyle} className="font-mono text-center">
                        {note.noteName}
                      </td>
                    ))}
                    {/* Add empty cells if this measure has fewer notes than others */}
                    {Math.max(...measures.map(m => notesByMeasure[m].length)) - measureNotes.length > 0 && 
                      Array(Math.max(...measures.map(m => notesByMeasure[m].length)) - measureNotes.length)
                        .fill()
                        .map((_, i) => (
                          <td key={`empty-${i}`} style={{...cellStyle, backgroundColor: '#F9FAFB'}}>
                          </td>
                        ))
                    }
                  </tr>
                  
                  {/* Duration row */}
                  <tr>
                    <td style={labelCellStyle}>
                      Duration
                    </td>
                    {measureNotes.map((note, i) => (
                      <td key={i} style={cellStyle} className="font-mono text-center">
                        {formatDuration(note.durationBeats)}
                      </td>
                    ))}
                    {/* Add empty cells if this measure has fewer notes than others */}
                    {Math.max(...measures.map(m => notesByMeasure[m].length)) - measureNotes.length > 0 && 
                      Array(Math.max(...measures.map(m => notesByMeasure[m].length)) - measureNotes.length)
                        .fill()
                        .map((_, i) => (
                          <td key={`empty-${i}`} style={{...cellStyle, backgroundColor: '#F9FAFB'}}>
                          </td>
                        ))
                    }
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="p-8">
          <h1 className="text-3xl font-bold text-center text-indigo-800 mb-8">Melody Generator</h1>
          
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
                  <option value="classical">Classical</option>
                  <option value="jazz">Jazz</option>
                  <option value="rock">Rock</option>
                  <option value="pop">Pop</option>
                  <option value="folk">Folk</option>
                  <option value="blues">Blues</option>
                  <option value="electronic">Electronic</option>
                  <option value="punk">Punk</option>
                  <option value="metal">Metal</option>
                  <option value="hiphop">Hip Hop</option>
                  <option value="country">Country</option>
                </select>
                <p className="text-sm text-gray-500 mt-1">
                  Influences the melody to follow patterns and characteristics common in the selected genre.
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="block text-indigo-800 font-medium">Time Signature:</label>
                <select 
                  value={timeSignature} 
                  onChange={(e) => setTimeSignature(e.target.value)} 
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="4/4">4/4 (Common Time)</option>
                  <option value="3/4">3/4 (Waltz Time)</option>
                  <option value="2/4">2/4 (March Time)</option>
                  <option value="6/8">6/8 (Compound Duple)</option>
                  <option value="9/8">9/8 (Compound Triple)</option>
                  <option value="5/4">5/4 (Quintuple)</option>
                  <option value="7/8">7/8 (Septuple)</option>
                </select>
              </div>
              
              <div className="space-y-2">
                <label className="block text-indigo-800 font-medium">Tempo (BPM):</label>
                <div className="flex items-center">
                  <input 
                    type="number" 
                    value={tempo} 
                    onChange={(e) => setTempo(parseInt(e.target.value))} 
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    min="40"
                    max="240"
                  />
                  <span className="ml-2 text-gray-500">BPM</span>
                </div>
                <div className="flex items-center mt-2">
                  <span className="text-sm text-gray-500">Slow</span>
                  <input 
                    type="range" 
                    min="40" 
                    max="240" 
                    step="1" 
                    value={tempo} 
                    onChange={(e) => setTempo(parseInt(e.target.value))} 
                    className="flex-1 mx-4 h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-sm text-gray-500">Fast</span>
                </div>
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="block text-indigo-800 font-medium">Length (bars):</label>
                <input 
                  type="number" 
                  value={length} 
                  onChange={(e) => setLength(parseInt(e.target.value))} 
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  min="1"
                  max="32"
                />
              </div>
              
              <div className="space-y-2">
                <label className="block text-indigo-800 font-medium">
                  Motif Coherence: <span className="font-bold">{(coherence * 100).toFixed(0)}%</span>
                </label>
                <div className="flex items-center">
                  <span className="text-sm text-gray-500">Random</span>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.1" 
                    value={coherence} 
                    onChange={(e) => setCoherence(parseFloat(e.target.value))} 
                    className="flex-1 mx-4 h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-sm text-gray-500">Structured</span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Controls how much the melody uses motifs and melodic patterns. Higher values create more structured, thematic melodies.
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex justify-center mt-6 mb-8">
            <button 
              onClick={generateMelody} 
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
              ) : hasGenerated ? 'Generate New Melody' : 'Generate Melody'}
            </button>
          </div>
          
          {/* Error message display */}
          {loadingError && (
            <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
              {typeof loadingError === 'string' 
                ? <p className="text-indigo-700 text-center">{loadingError}</p>
                : loadingError /* Render JSX content directly */
              }
            </div>
          )}
          
          {/* Show settings have changed message if they're different from generation settings */}
          {hasGenerated && 
           (key !== generatedKey || 
            scale !== generatedScale || 
            length !== generatedLength || 
            tempo !== generatedTempo || 
            timeSignature !== generatedTimeSignature ||
            genre !== generatedGenre ||
            coherence !== generatedCoherence) && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-600 text-center">
                <span className="font-semibold">Note:</span> Settings have changed. Click "Generate New Melody" to apply the new settings.
              </p>
            </div>
          )}
          
          {!hasGenerated && !isLoading && (
            <div className="p-8 bg-indigo-50 rounded-xl text-center">
              <h3 className="text-xl font-semibold text-indigo-700 mb-4">Ready to Create Music</h3>
              <p className="text-indigo-600">
                Adjust the settings above and click "Generate Melody" to create your custom melody.
              </p>
            </div>
          )}
          
          {melody && hasGenerated && (
            <div className="bg-white rounded-xl p-6 shadow-inner">
              <div className="mb-4">
                <h2 className="text-xl text-indigo-800 font-semibold mb-2">Your Melody</h2>
                <p className="text-indigo-600">
                  Generated in {generatedKey} {generatedScale} ({generatedLength} bars, {generatedTimeSignature}) at {generatedTempo} BPM 
                  {generatedGenre !== 'none' ? ` in ${generatedGenre} style ` : ' '}
                  with {(generatedCoherence * 100).toFixed(0)}% coherence
                </p>
              </div>
              <div className="mt-6 flex flex-wrap gap-3 justify-center">
                <button 
                  onClick={isPlaying ? stopMelody : playMelody} 
                  className={`px-5 py-2 rounded-lg shadow-md font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${
                    isPlaying 
                      ? 'bg-red-500 hover:bg-red-600 focus:ring-red-500 text-white' 
                      : 'bg-green-500 hover:bg-green-600 focus:ring-green-500 text-white'
                  }`}
                  disabled={!player.current}
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
                        Play
                      </>
                    )}
                  </span>
                </button>
              </div>
              
              {/* Note data table */}
              {renderNoteTable()}
              
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MelodyGenerator;
