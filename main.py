from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
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

# Alternative CORS configuration - uncomment if the wildcard approach doesn't work
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=[
#         "http://localhost:5173",
#         "https://melody-generator-mkugvk5mz-derek-brimleys-projects.vercel.app",
#         "https://melody-generator-two.vercel.app",
#         "https://*.vercel.app"
#     ],
#     allow_credentials=True,
#     allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
#     allow_headers=["*"],
# )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=False,  # Must be False when using "*"
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/health")
async def health_check():
    return {"status": "healthy", "message": "Melody Generator API is running"}

@app.options("/{full_path:path}")
async def preflight_handler(full_path: str):
    return {"message": "OK"}

@app.post("/generate-progression/")
async def generate_progression(
    key: str = "C",
    scale: str = "major",
    num_chords: int = 4,
    genre: str = "none"
):
    try:
        # Validate and normalize inputs
        if num_chords < 2:
            num_chords = 2
        elif num_chords > 8:
            num_chords = 8
            
        # Define scale degrees and chord types for major and minor scales
        scales = {
            "major": {
                "degrees": ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
                "types": ["", "m", "m", "", "", "m", "dim"]
            },
            "minor": {
                "degrees": ["i", "ii°", "III", "iv", "v", "VI", "VII"],
                "types": ["m", "dim", "", "m", "m", "", ""]
            }
        }
        
        # Define chord extensions based on genre
        chord_extensions = {
            "none": {
                "frequency": 0.1,  # 10% chance of extensions
                "options": ["7", "maj7", "6", "9"]
            },
            "pop": {
                "frequency": 0.2,
                "options": ["7", "maj7", "add9", "sus4"]
            },
            "rock": {
                "frequency": 0.3,
                "options": ["7", "5", "sus4", "add9"]
            },
            "jazz": {
                "frequency": 0.7,
                "options": ["7", "9", "11", "13", "maj7", "maj9", "6/9", "7b9", "7#11", "7b13"]
            },
            "classical": {
                "frequency": 0.1,
                "options": ["7", "maj7", "sus4", "6"]
            },
            "blues": {
                "frequency": 0.5,
                "options": ["7", "9", "13", "7#9"]
            },
            "folk": {
                "frequency": 0.15,
                "options": ["7", "sus2", "sus4", "add9"]
            },
            "electronic": {
                "frequency": 0.3,
                "options": ["sus4", "add9", "maj7", "6/9"]
            }
        }
        
        # Define common chord progressions by genre
        common_progressions = {
            "none": [
                ["I", "IV", "V", "I"],
                ["I", "vi", "IV", "V"],
                ["I", "V", "vi", "IV"],
                ["ii", "V", "I", "IV"],
                ["I", "IV", "I", "V"]
            ],
            "pop": [
                ["I", "V", "vi", "IV"],
                ["I", "IV", "V", "IV"],
                ["vi", "IV", "I", "V"],
                ["I", "V", "IV", "I"],
                ["IV", "I", "V", "vi"]
            ],
            "rock": [
                ["I", "IV", "V", "I"],
                ["I", "V", "IV", "I"],
                ["ii", "IV", "V", "I"],
                ["I", "iii", "IV", "I"],
                ["I", "VII", "IV", "I"]  # Borrowed chord from mixolydian
            ],
            "jazz": [
                ["ii", "V", "I", "vi"],
                ["I", "vi", "ii", "V"],
                ["I", "IV", "iii", "VI"],
                ["i", "IV", "VII", "III"],
                ["ii", "V", "I", "IV"]
            ],
            "classical": [
                ["I", "IV", "V", "I"],
                ["I", "V", "vi", "iii"],
                ["ii", "V", "I", "IV"],
                ["I", "vi", "IV", "II"],
                ["I", "IV", "I", "V"]
            ],
            "blues": [
                ["I", "I", "I", "I", "IV", "IV", "I", "I", "V", "IV", "I", "V"],  # 12-bar blues
                ["i", "iv", "i", "V"],
                ["i", "VI", "VII", "i"],
                ["i", "VI", "iv", "V"],
                ["i", "iv", "VII", "III"]
            ],
            "folk": [
                ["I", "V", "IV", "I"],
                ["I", "IV", "I", "V"],
                ["I", "vi", "IV", "V"],
                ["ii", "IV", "I", "V"],
                ["I", "iii", "IV", "V"]
            ],
            "electronic": [
                ["I", "V", "vi", "IV"],
                ["vi", "V", "IV", "V"],
                ["I", "IV", "vi", "V"],
                ["ii", "V", "I", "vi"],
                ["vi", "IV", "I", "V"]
            ]
        }
        
        # Get the proper scale degrees and chord types based on the selected scale
        current_scale = scales.get(scale, scales["major"])
        scale_degrees = current_scale["degrees"]
        chord_types = current_scale["types"]
        
        # Map between Roman numerals and array indices
        numeral_to_index = {
            # Major
            "I": 0, "ii": 1, "iii": 2, "IV": 3, "V": 4, "vi": 5, "vii°": 6,
            # Minor
            "i": 0, "ii°": 1, "III": 2, "iv": 3, "v": 4, "VI": 5, "VII": 6,
            # Borrowed/other
            "VII": 6, "VI": 5, "III": 2, "II": 1
        }
        
        # Define note names based on key
        note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        key_index = note_names.index(key.upper())
        notes_in_key = [note_names[(key_index + i) % 12] for i in range(12)]
        
        # Choose a progression based on genre and number of chords
        if genre in common_progressions and num_chords == 4:
            # Use a common progression for this genre
            if genre == "blues" and random.random() < 0.3:
                # For blues, maybe use the 12-bar blues progression
                chosen_progression = common_progressions["blues"][0]
                # Truncate to requested number of chords
                if num_chords < len(chosen_progression):
                    chosen_progression = chosen_progression[:num_chords]
            else:
                # Choose a random common progression for this genre
                chosen_progression = random.choice(common_progressions[genre])
                # If we need more chords, repeat the progression
                while len(chosen_progression) < num_chords:
                    chosen_progression.extend(chosen_progression[:num_chords - len(chosen_progression)])
                # Truncate to the requested number of chords
                chosen_progression = chosen_progression[:num_chords]
        else:
            # Generate a progression based on common chord movements
            if scale == "major":
                # Major key common movements: I -> IV, I -> V, V -> I, IV -> I, etc.
                first_chord = random.choice(["I", "vi"])
                chosen_progression = [first_chord]
                
                common_follows = {
                    "I": ["IV", "V", "vi", "ii"],
                    "ii": ["V", "IV", "vii°"],
                    "iii": ["vi", "IV", "ii"],
                    "IV": ["I", "V", "ii", "vii°"],
                    "V": ["I", "vi", "IV"],
                    "vi": ["IV", "ii", "V"],
                    "vii°": ["I", "iii"]
                }
                
                for _ in range(num_chords - 1):
                    last_chord = chosen_progression[-1]
                    next_chord = random.choice(common_follows.get(last_chord, ["I", "IV", "V"]))
                    chosen_progression.append(next_chord)
            else:
                # Minor key common movements
                first_chord = random.choice(["i", "VI"])
                chosen_progression = [first_chord]
                
                common_follows = {
                    "i": ["iv", "v", "VI", "VII"],
                    "ii°": ["V", "i", "VII"],
                    "III": ["VI", "iv", "ii°"],
                    "iv": ["i", "V", "ii°", "VII"],
                    "v": ["i", "VI", "iv"],
                    "VI": ["iv", "ii°", "III", "VII"],
                    "VII": ["i", "VI", "III"]
                }
                
                for _ in range(num_chords - 1):
                    last_chord = chosen_progression[-1]
                    next_chord = random.choice(common_follows.get(last_chord, ["i", "iv", "v"]))
                    chosen_progression.append(next_chord)
        
        # Convert Roman numerals to actual chord names with appropriate extensions
        chord_names = []
        for numeral in chosen_progression:
            # Get the index for this numeral
            idx = numeral_to_index.get(numeral, 0)
            
            # Get the root note
            root_note = notes_in_key[idx]
            
            # Get the chord type
            chord_type = chord_types[idx]
            
            # Decide if we add an extension based on genre
            extension = ""
            if genre in chord_extensions:
                extension_info = chord_extensions[genre]
                if random.random() < extension_info["frequency"]:
                    extension = random.choice(extension_info["options"])
            
            # Build the chord name
            chord_name = root_note + chord_type + extension
            chord_names.append(chord_name)
        
        # Generate a description for the progression
        descriptions = {
            "none": "A standard chord progression.",
            "pop": "A catchy pop progression with good flow.",
            "rock": "A strong, energetic rock progression.",
            "jazz": "A sophisticated jazz progression with rich harmonies.",
            "classical": "An elegant classical-style progression.",
            "blues": "A soulful blues progression with emotional depth.",
            "folk": "A simple, melodic folk progression.",
            "electronic": "A modern electronic progression with atmosphere."
        }
        description = descriptions.get(genre, "A custom chord progression.")
        
        # Special descriptions for well-known progressions
        if chosen_progression == ["I", "V", "vi", "IV"]:
            description = "The 'Axis of Awesome' progression - used in countless pop hits!"
        elif chosen_progression == ["I", "IV", "V", "I"]:
            description = "The classic 'Doo-wop' progression - a timeless classic rock and roll sequence."
        elif chosen_progression == ["ii", "V", "I"]:
            description = "The quintessential jazz '2-5-1' progression - the backbone of jazz harmony."
        elif "blues" in genre.lower() and len(chosen_progression) >= 12:
            description = "The 12-bar blues - the foundation of blues, jazz, and rock and roll."
        
        return {
            "chords": chord_names,
            "numerals": chosen_progression,
            "description": description
        }
        
    except Exception as e:
        import traceback
        print(f"Error generating chord progression: {str(e)}")
        print(traceback.format_exc())
        raise

@app.post("/generate-melody/")
async def generate_melody(
    key: str = "C", 
    scale: str = "major", 
    length: int = 8, 
    coherence: float = 0.7, 
    tempo: int = 120,
    time_signature: str = "4/4",
    genre: str = "none"
):
    try:
        # Create a PrettyMIDI object with the specified tempo
        midi = PrettyMIDI(initial_tempo=tempo)
        instrument = Instrument(program=0, name="Piano")

        # Define scale notes
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
        
        # Define genre-specific rhythm patterns and characteristics
        genre_patterns = {
            "classical": {
                "rhythm_patterns": [
                    [0.5, 0.5, 0.5, 0.5],                      # Elegant quarter notes
                    [0.25, 0.25, 0.25, 0.25, 0.5, 0.5],        # Classical ornamental pattern
                    [1.0, 0.5, 0.5],                           # Half note followed by quarters (common in Classical)
                    [0.75, 0.25, 1.0],                         # Dotted quarter, eighth, half (melodic)
                    [0.5, 0.25, 0.25, 1.0],                    # Quarter, eighth, eighth, half (classical cadence)
                ],
                "velocity_range": (65, 90),                     # More dynamic range
                "octave_range": (-1, 1),                        # Wider pitch range
                "pitch_tendencies": "stepwise",                 # Favor stepwise motion
                "coherence_boost": 0.1                          # More structured
            },
            "jazz": {
                "rhythm_patterns": [
                    [0.33, 0.33, 0.34, 0.5, 0.5],              # Triplet followed by quarter notes
                    [0.75, 0.25, 0.5, 0.5],                    # Swing rhythm
                    [0.66, 0.34, 0.5, 0.5],                    # Shuffle feel
                    [0.5, 0.33, 0.33, 0.34, 0.5],              # Syncopated jazz pattern
                    [0.25, 0.25, 0.25, 0.25, 0.5, 0.25, 0.25], # Bebop-like pattern
                ],
                "velocity_range": (70, 95),                     # Medium-high intensity
                "octave_range": (-1, 1),                        # Various registers
                "pitch_tendencies": "intervals",                # More interval jumps
                "coherence_boost": -0.1                         # More improvisation
            },
            "rock": {
                "rhythm_patterns": [
                    [0.25, 0.25, 0.25, 0.25, 0.5, 0.5],        # Driving eighth notes
                    [0.5, 0.5, 0.5, 0.5],                      # Steady quarter notes
                    [0.25, 0.25, 0.5, 0.25, 0.25, 0.5],        # Rock rhythm pattern
                    [0.75, 0.25, 0.5, 0.25, 0.25],             # Rock feel with syncopation
                ],
                "velocity_range": (75, 100),                    # Powerful, consistent
                "octave_range": (-1, 0),                        # Mid to low register
                "pitch_tendencies": "pentatonic",               # Favor pentatonic-like motion
                "coherence_boost": 0                            # Neutral
            },
            "pop": {
                "rhythm_patterns": [
                    [0.25, 0.25, 0.5, 0.25, 0.25, 0.5],        # Pop rhythm
                    [0.25, 0.25, 0.25, 0.25, 0.5, 0.5],        # Catchy pattern
                    [0.5, 0.25, 0.25, 0.25, 0.25, 0.5],        # Dance-pop feel
                ],
                "velocity_range": (70, 90),                     # Consistent, not too dynamic
                "octave_range": (0, 1),                         # Higher register for catchiness
                "pitch_tendencies": "intervals",                # Singable intervals
                "coherence_boost": 0.2                          # Very structured
            },
            "folk": {
                "rhythm_patterns": [
                    [0.5, 0.5, 0.5, 0.5],                      # Simple folk pattern
                    [0.25, 0.25, 0.5, 0.25, 0.25, 0.5],        # Folk strumming pattern
                    [0.75, 0.25, 0.5, 0.5],                    # Dotted folk rhythm
                ],
                "velocity_range": (60, 85),                     # Gentle intensity
                "octave_range": (0, 0),                         # Mid register
                "pitch_tendencies": "stepwise",                 # Stepwise folk melodies
                "coherence_boost": 0.1                          # Structured
            },
            "blues": {
                "rhythm_patterns": [
                    [0.33, 0.33, 0.34, 0.5, 0.5],              # Blues triplet feel
                    [0.75, 0.25, 0.5, 0.5],                    # Blues swing
                    [0.5, 0.5, 0.75, 0.25],                    # Blues pattern
                ],
                "velocity_range": (65, 90),                     # Expressive
                "octave_range": (-1, 0),                        # Lower register
                "pitch_tendencies": "blues_scale",              # Blues-scale like motion
                "coherence_boost": -0.05                        # Some freedom
            },
            "electronic": {
                "rhythm_patterns": [
                    [0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25], # Electronic 16th notes
                    [0.125, 0.125, 0.125, 0.125, 0.25, 0.25],         # Fast electronic pattern
                    [0.5, 0.25, 0.25, 0.5, 0.5],                      # Electronic groove
                ],
                "velocity_range": (80, 100),                    # Strong, consistent
                "octave_range": (0, 1),                         # Mid to high
                "pitch_tendencies": "intervals",                # Electronic jumps
                "coherence_boost": 0.15                         # Repetitive structure
            },
            "punk": {
                "rhythm_patterns": [
                    [0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25], # Fast punk eighths
                    [0.125, 0.125, 0.125, 0.125, 0.25, 0.25],         # Fast punk 16ths
                    [0.25, 0.25, 0.5, 0.25, 0.25, 0.5],               # Punk pattern
                ],
                "velocity_range": (85, 100),                    # Always intense
                "octave_range": (0, 0),                         # Mid register
                "pitch_tendencies": "limited",                  # Simple, limited range
                "coherence_boost": -0.2                         # Less structured
            },
            "metal": {
                "rhythm_patterns": [
                    [0.125, 0.125, 0.125, 0.125, 0.25, 0.25],  # Fast metal 16ths
                    [0.25, 0.125, 0.125, 0.25, 0.25],          # Metal gallop rhythm
                    [0.125, 0.125, 0.25, 0.125, 0.125, 0.25],  # Metal pattern
                ],
                "velocity_range": (85, 100),                    # Aggressive
                "octave_range": (-1, 0),                        # Lower register
                "pitch_tendencies": "power",                    # Power chord-like motion
                "coherence_boost": 0.05                         # Somewhat structured
            },
            "hiphop": {
                "rhythm_patterns": [
                    [0.25, 0.5, 0.25, 0.5, 0.5],               # Hip hop groove
                    [0.25, 0.25, 0.75, 0.75],                  # Hip hop pattern
                    [0.33, 0.33, 0.34, 0.5, 0.5],              # Triplet hip hop feel
                ],
                "velocity_range": (70, 90),                     # Steady intensity
                "octave_range": (-1, 0),                        # Lower register
                "pitch_tendencies": "intervals",                # Sample-like jumps
                "coherence_boost": 0.1                          # Loop-based structure
            },
            "country": {
                "rhythm_patterns": [
                    [0.5, 0.25, 0.25, 0.5, 0.5],               # Country rhythm
                    [0.25, 0.25, 0.5, 0.5, 0.5],               # Country pattern
                    [0.5, 0.5, 0.25, 0.25, 0.5],               # Country groove
                ],
                "velocity_range": (65, 85),                     # Not too intense
                "octave_range": (0, 0),                         # Mid register
                "pitch_tendencies": "stepwise",                 # Melodic country style
                "coherence_boost": 0.05                         # Somewhat structured
            }
        }
        
        # Apply genre-specific settings if a genre is selected
        genre_settings = genre_patterns.get(genre, None)
        if genre_settings:
            # Replace or extend rhythm patterns based on genre
            if random.random() < 0.8:  # 80% chance to use genre-specific patterns
                rhythm_patterns = genre_settings["rhythm_patterns"]
            else:
                # Add some genre patterns to the general patterns
                rhythm_patterns.extend(genre_settings["rhythm_patterns"])
            
            # Adjust coherence based on genre
            coherence = min(1.0, max(0.0, coherence + genre_settings["coherence_boost"]))
            
            print(f"Using genre: {genre}, adjusted coherence to {coherence}")

        # Parse the time signature
        try:
            numerator, denominator = map(int, time_signature.split('/'))
            # Add the time signature to the MIDI file
            midi.time_signature_changes.append(TimeSignature(numerator=numerator, denominator=denominator, time=0))
            
            # Calculate beats per bar based on time signature
            # In MIDI, the beats per bar is always interpreted in quarter notes
            if denominator == 4:
                # Simple meters (2/4, 3/4, 4/4): numerator = number of quarter notes per bar
                beats_per_bar = numerator
            elif denominator == 8:
                # Compound meters (6/8, 9/8): convert eighth notes to quarter notes
                beats_per_bar = numerator / 2
            elif denominator == 2:
                # Cut time (2/2, 3/2): each beat is a half note = 2 quarter notes
                beats_per_bar = numerator * 2
            else:
                # Default fallback for unusual time signatures
                beats_per_bar = (numerator * 4) / denominator
                
            print(f"Using time signature {time_signature} with {beats_per_bar} quarter-note beats per bar")
        except ValueError:
            # Default to 4/4 if there's an issue with the time signature format
            print(f"Invalid time signature format: {time_signature}. Using 4/4 as default.")
            midi.time_signature_changes.append(TimeSignature(numerator=4, denominator=4, time=0))
            beats_per_bar = 4
        
        # Add key signature
        key_number = 0
        try:
            key_to_fifths = {
                'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7,
                'F': -1, 'Bb': -2, 'Eb': -3, 'Ab': -4, 'Db': -5, 'Gb': -6, 'Cb': -7
            }
            
            key_number = key_to_fifths.get(key, 0)
            if scale == 'minor':
                # Minor keys have the same key signature as their relative major
                relative_major = (root_offset + 3) % 12
                for k, v in key_offsets.items():
                    if v == relative_major:
                        key_number = key_to_fifths.get(k, 0)
                        break
                
            midi.key_signature_changes.append(KeySignature(key_number=key_number, time=0))
        except ValueError:
            # Fallback for F major which sometimes fails
            midi.key_signature_changes.append(KeySignature(key_number=0, time=0))
        
        # Generate the melody with varied rhythms and motifs
        # Calculate total beats needed for the requested number of bars
        total_beats_needed = length * beats_per_bar
        
        print(f"Generating melody with {length} bars, {beats_per_bar} beats per bar, total {total_beats_needed} beats")
        beats_completed = 0
        
        # Select a rhythmic motif (pattern) that will serve as the basis
        base_rhythm_motif = random.choice(rhythm_patterns)
        
        # Create a melodic motif (sequence of scale degrees)
        melodic_motif = []
        for _ in range(len(base_rhythm_motif)):
            melodic_motif.append(random.randint(0, len(chosen_scale) - 1))
        
        # Keep track of the previous pitches to create more coherent melodies
        previous_pitches = []
        
        # Initialize the start position for notes
        start = 0
        
        while beats_completed < total_beats_needed:
            # Decide whether to use the motif or a variation
            if random.random() < coherence and beats_completed > 0:  # Higher coherence = more motif usage
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
                    if len(current_rhythm) >= 2:
                        swap_index = random.randint(0, len(current_rhythm) - 2)
                        current_rhythm[swap_index], current_rhythm[swap_index + 1] = current_rhythm[swap_index + 1], current_rhythm[swap_index]
                elif variation_type == "invert":
                    # Invert the melodic contour (if it goes up, make it go down and vice versa)
                    motif_range = max(melodic_motif) - min(melodic_motif)
                    middle = (max(melodic_motif) + min(melodic_motif)) / 2
                    current_melody = [int(middle + (middle - m)) % len(chosen_scale) for m in current_melody]
                elif variation_type == "augment":
                    # Augment or diminish the rhythm
                    if random.random() < 0.5 and all(r >= 0.25 for r in current_rhythm):
                        current_rhythm = [r * 0.75 for r in current_rhythm]
                    else:
                        current_rhythm = [r * 1.25 for r in current_rhythm]
            else:
                # Create a new motif entirely
                current_rhythm = random.choice(rhythm_patterns)
                current_melody = [random.randint(0, len(chosen_scale) - 1) for _ in range(len(current_rhythm))]
                    
            # Calculate total pattern length in beats
            total_pattern_beats = sum(current_rhythm)
            if total_pattern_beats > (total_beats_needed - beats_completed):
                # If it doesn't fit, truncate it to fit
                while sum(current_rhythm) > (total_beats_needed - beats_completed) and len(current_rhythm) > 1:
                    current_rhythm.pop()
                    current_melody.pop()
                
                if sum(current_rhythm) > (total_beats_needed - beats_completed):
                    # If we're still over, just use a single note to finish
                    current_rhythm = [total_beats_needed - beats_completed]
                    current_melody = [random.randint(0, len(chosen_scale) - 1)]
            
            # Set up genre-specific velocity range and octave range
            velocity_range = (70, 100)  # Default
            octave_range = (-1, 1)      # Default
            pitch_tendency = "random"   # Default
            
            if genre_settings:
                velocity_range = genre_settings["velocity_range"]
                octave_range = genre_settings["octave_range"]
                pitch_tendency = genre_settings["pitch_tendencies"]
            
            # Apply the current motif
            for i, (duration, scale_degree) in enumerate(zip(current_rhythm, current_melody)):
                # Get the actual MIDI pitch from the scale degree
                pitch_index = scale_degree % len(chosen_scale)
                base_pitch = chosen_scale[pitch_index] + root_offset + 60  # MIDI note around middle C
                
                # Apply genre-specific octave adjustments
                octave_shift = random.randint(octave_range[0] * 12, octave_range[1] * 12)
                pitch = base_pitch + octave_shift
                
                # Ensure pitch is in a reasonable range (36-84 = C2 to C6)
                pitch = max(36, min(84, pitch))
                
                # For more musicality, apply genre-specific pitch tendencies
                if previous_pitches and pitch_tendency != "random":
                    last_pitch = previous_pitches[-1]
                    
                    if pitch_tendency == "stepwise" and random.random() < 0.7:
                        # Favor stepwise motion (up or down by 1-2 semitones)
                        step = random.choice([-2, -1, 1, 2])
                        pitch = last_pitch + step
                    elif pitch_tendency == "intervals" and random.random() < 0.6:
                        # Favor specific intervals common in the genre
                        if genre == "jazz":
                            intervals = [-4, -3, 3, 4, 7]  # 3rds, 4ths, 5ths
                        elif genre == "pop":
                            intervals = [-5, -3, 2, 3, 5, 7]  # 2nds, 3rds, 4ths, 5ths
                        else:
                            intervals = [-5, -3, -2, 2, 3, 5]  # Generic intervals
                        pitch = last_pitch + random.choice(intervals)
                    elif pitch_tendency == "pentatonic" and random.random() < 0.7:
                        # Pentatonic-like motion (common in rock, blues)
                        intervals = [-7, -5, -4, 0, 2, 3, 5, 7]
                        pitch = last_pitch + random.choice(intervals)
                    elif pitch_tendency == "blues_scale" and random.random() < 0.7:
                        # Blues-like intervals
                        intervals = [-5, -3, 0, 3, 5, 6]
                        pitch = last_pitch + random.choice(intervals)
                    elif pitch_tendency == "power" and random.random() < 0.7:
                        # Power chord-like motion for metal
                        intervals = [-12, -7, -5, 0, 5, 7, 12]
                        pitch = last_pitch + random.choice(intervals)
                    elif pitch_tendency == "limited" and random.random() < 0.8:
                        # Limited range for punk
                        intervals = [-2, -1, 0, 1, 2]
                        pitch = last_pitch + random.choice(intervals)
                    
                    # Ensure the resulting pitch is in the scale
                    while (pitch - root_offset - 60) % 12 not in chosen_scale:
                        pitch += 1  # Move up to the next scale note
                
                # Ensure pitch is in a reasonable range after all adjustments
                pitch = max(36, min(84, pitch))
                
                # Apply genre-specific velocity (dynamics)
                velocity = random.randint(velocity_range[0], velocity_range[1])
                
                # Create the note
                note = Note(velocity=velocity, pitch=pitch, start=start, end=start+duration)
                instrument.notes.append(note)
                
                # Keep track of this pitch for future reference
                previous_pitches.append(pitch)
                if len(previous_pitches) > 5:  # Only keep track of the last 5 notes
                    previous_pitches.pop(0)
                    
                start += duration
            
            beats_completed += total_pattern_beats

        # Add the instrument to the MIDI
        midi.instruments.append(instrument)
        
        # Save temporary MIDI file
        tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".mid")
        midi.write(tmp_file.name)
        
        # Return binary data directly
        with open(tmp_file.name, "rb") as file:
            midi_data = file.read()
        
        # Encode to base64 for embedding in JSON
        midi_base64 = base64.b64encode(midi_data).decode('utf-8')
        
        # Clean up temporary file
        try:
            os.unlink(tmp_file.name)
        except:
            pass
        
        # Return just the data for playback
        return {
            "midi_base64": midi_base64
        }
        
    except Exception as e:
        import traceback
        print(f"Error generating melody: {str(e)}")
        print(traceback.format_exc())
        raise
