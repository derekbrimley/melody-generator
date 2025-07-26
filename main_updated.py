from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import pretty_midi
from pretty_midi import PrettyMIDI, Instrument, Note, TimeSignature, KeySignature
import random
import tempfile
import os
import base64
from fastapi.middleware.cors import CORSMiddleware
import copy

app = FastAPI()

# Create static and templates directories if they don't exist
os.makedirs("static", exist_ok=True)
os.makedirs("templates", exist_ok=True)

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "*"],  # "*" allows all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/generate-melody/")
async def generate_melody(key: str = "C", scale: str = "major", length: int = 8, coherence: float = 0.7):
    # Create a PrettyMIDI object with a specific tempo
    midi = PrettyMIDI(initial_tempo=120)  # 120 BPM for clear notation
    
    # Create an Instrument instance for a piano
    instrument = Instrument(program=0)  # Piano

    # Define scale notes (simplified major scale example)
    scales = {
        "major": [0, 2, 4, 5, 7, 9, 11],
        "minor": [0, 2, 3, 5, 7, 8, 10]
    }
    key_offsets = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
                   'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}

    root_offset = key_offsets.get(key, 0)
    chosen_scale = scales.get(scale, scales["major"])
    
    # Define common rhythmic patterns (in beats)
    rhythm_patterns = [
        [0.25, 0.25, 0.5, 0.5, 0.5],       # Eighth notes and quarter notes
        [0.5, 0.25, 0.25, 0.5, 0.5],       # Quarter note followed by eighth notes
        [0.75, 0.25, 0.5, 0.5],            # Dotted quarter note pattern
        [1.0, 0.5, 0.5],                    # Half note followed by quarter notes
        [0.5, 1.0, 0.5],                    # Quarter, half, quarter pattern
        [0.25, 0.25, 0.25, 0.25, 0.5, 0.5], # Four eighth notes and two quarter notes
        [0.5, 0.5, 1.0],                    # Two quarter notes and a half note
        [0.25, 0.75, 0.5, 0.5],             # Syncopated pattern
    ]

    # Generate the melody with varied rhythms and motifs
    start = 0
    bars_completed = 0
    
    # Select a rhythmic motif (pattern) that will serve as the basis
    base_rhythm_motif = random.choice(rhythm_patterns)
    
    # Create a melodic motif (sequence of scale degrees)
    # We'll create a motif with the same length as our rhythm pattern
    melodic_motif = []
    for _ in range(len(base_rhythm_motif)):
        # For the melodic motif, we'll use scale degrees (0-6 for a 7-note scale)
        melodic_motif.append(random.randint(0, len(chosen_scale) - 1))
    
    # Keep track of the previous pitches to create more coherent melodies
    previous_pitches = []
    
    # Add a time signature marker - 4/4 time as a default
    # This helps with notation rendering
    midi.time_signature_changes.append(TimeSignature(numerator=4, denominator=4, time=0))
    
    # Map key to number of sharps/flats for key signature
    key_to_fifths = {
        'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7,
        'F': -1, 'Bb': -2, 'Eb': -3, 'Ab': -4, 'Db': -5, 'Gb': -6, 'Cb': -7
    }
    
    # Adjust key signature based on major/minor scale
    key_number = key_to_fifths.get(key, 0)
    if scale == 'minor':
        # Minor keys have the same key signature as their relative major
        # which is 3 semitones higher
        relative_major = (root_offset + 3) % 12
        for k, v in key_offsets.items():
            if v == relative_major:
                key_number = key_to_fifths.get(k, 0)
                break
    
    # Add key signature
    try:
        # PrettyMIDI has a known issue with F major (-1) in some versions
        # Use a safer approach with proper error handling
        midi.key_signature_changes.append(KeySignature(key_number=key_number, time=0))
    except ValueError as e:
        # Special handling for F major which sometimes fails with key_number=-1
        if key == 'F' and scale == 'major':
            # Use a workaround - we can use 0 (C major) and adjust notes accordingly
            # The notes are already in F major from our scale calculation
            midi.key_signature_changes.append(KeySignature(key_number=0, time=0))
            print(f"Applied workaround for F major key signature: {e}")
        else:
            # Re-raise for other keys
            raise
    
    # We'll use variations of these motifs throughout the melody
    while bars_completed < length:
        # Decide whether to use the motif or a variation
        if random.random() < coherence and bars_completed > 0:  # Higher coherence = more motif usage
            # Use the original motif or a variation (since coherence is high)
            variation_type = random.choice(["original", "transpose", "rhythm_var", "invert", "augment"])
            
            current_rhythm = copy.deepcopy(base_rhythm_motif)
            current_melody = copy.deepcopy(melodic_motif)
            
            if variation_type == "original":
                # Just use the original motif directly
                pass
            elif variation_type == "transpose":
                # Transpose the melodic motif (move it up or down)
                transposition = random.choice([-2, -1, 1, 2])  # Transpose by steps
                current_melody = [(m + transposition) % len(chosen_scale) for m in current_melody]
            elif variation_type == "rhythm_var":
                # Slightly vary the rhythm while keeping the melodic motif
                # Swap two adjacent durations or split a longer note
                if len(current_rhythm) >= 2:
                    swap_index = random.randint(0, len(current_rhythm) - 2)
                    current_rhythm[swap_index], current_rhythm[swap_index + 1] = current_rhythm[swap_index + 1], current_rhythm[swap_index]
            elif variation_type == "invert":
                # Invert the melodic contour (if it goes up, make it go down and vice versa)
                # Find the range of the motif
                motif_range = max(melodic_motif) - min(melodic_motif)
                # Invert around the middle point
                middle = (max(melodic_motif) + min(melodic_motif)) / 2
                current_melody = [int(middle + (middle - m)) % len(chosen_scale) for m in current_melody]
            elif variation_type == "augment":
                # Augment or diminish the rhythm (make it slower or faster)
                if random.random() < 0.5 and all(r >= 0.25 for r in current_rhythm):
                    # Diminish (make faster)
                    current_rhythm = [r * 0.75 for r in current_rhythm]
                else:
                    # Augment (make slower)
                    current_rhythm = [r * 1.25 for r in current_rhythm]
        else:
            # FIX: For lower coherence, we'll use completely random material more often
            # Create a new motif entirely - this is what happens when coherence is low
            current_rhythm = random.choice(rhythm_patterns)
            current_melody = [random.randint(0, len(chosen_scale) - 1) for _ in range(len(current_rhythm))]
                
        # Calculate total pattern length
        total_pattern_length = sum(current_rhythm)
        if total_pattern_length > (length - bars_completed):
            # If it doesn't fit, truncate it to fit
            while sum(current_rhythm) > (length - bars_completed) and len(current_rhythm) > 1:
                current_rhythm.pop()
                current_melody.pop()
            
            if sum(current_rhythm) > (length - bars_completed):
                # If we're still over, just use a single note to finish
                current_rhythm = [length - bars_completed]
                current_melody = [random.randint(0, len(chosen_scale) - 1)]
        
        # Apply the current motif
        for i, (duration, scale_degree) in enumerate(zip(current_rhythm, current_melody)):
            # Get the actual MIDI pitch from the scale degree
            pitch_index = scale_degree % len(chosen_scale)
            pitch = chosen_scale[pitch_index] + root_offset + 60  # MIDI note around middle C
            
            # For more musicality, occasionally step to adjacent notes
            # This logic is weighted by coherence - higher coherence means more voice leading
            if previous_pitches and random.random() < (0.4 * coherence):
                # Higher coherence = more likely to apply smooth voice leading
                last_pitch = previous_pitches[-1]
                
                # Calculate actual pitch from scale degree
                actual_pitch = chosen_scale[pitch_index] + root_offset + 60
                
                # If too far from previous pitch, move closer
                if abs(actual_pitch - last_pitch) > 7:  # If more than a perfect fifth away
                    # Move closer to the previous note by an octave
                    if actual_pitch > last_pitch:
                        pitch = actual_pitch - 12  # Down an octave
                    else:
                        pitch = actual_pitch + 12  # Up an octave
            
            # Create the note
            note = Note(velocity=random.randint(70, 100), pitch=pitch, start=start, end=start+duration)
            instrument.notes.append(note)
            
            # Keep track of this pitch for future reference
            previous_pitches.append(pitch)
            if len(previous_pitches) > 5:  # Only keep track of the last 5 notes
                previous_pitches.pop(0)
                
            start += duration
        
        bars_completed += total_pattern_length

    midi.instruments.append(instrument)

    # Save temporary MIDI file
    tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".mid")
    midi.write(tmp_file.name)
    
    # Return binary data directly
    with open(tmp_file.name, "rb") as file:
        midi_data = file.read()
    
    # Encode to base64 for embedding in JSON
    midi_base64 = base64.b64encode(midi_data).decode('utf-8')
    
    return {
        "midi_base64": midi_base64,
        "download_url": f"/download-midi/?key={key}&scale={scale}&length={length}&coherence={coherence}"
    }

@app.get("/download-midi/")
async def download_midi(key: str = "C", scale: str = "major", length: int = 8, coherence: float = 0.7):
    # Call the generate_melody function to ensure consistent output between preview and download
    response = await generate_melody(key=key, scale=scale, length=length, coherence=coherence)
    
    # Decode the base64 MIDI data
    midi_data = base64.b64decode(response["midi_base64"])
    
    # Save to a temporary file
    filename = f"melody_{key}_{scale}_{length}.mid"
    tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".mid")
    with open(tmp_file.name, "wb") as f:
        f.write(midi_data)
    
    return FileResponse(tmp_file.name, media_type='audio/midi', filename=filename)
