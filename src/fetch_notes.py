import sys
import json
import requests
from pathlib import Path
from typing import List, Optional
import typer
from rich.console import Console
import re

# --- CONFIGURATION (embedded) ---
ANKI_URL = "http://localhost:8765"  # AnkiConnect URL
OUTPUT_DIR = Path("./data/input")   # Existing output directory
OUTPUT_FILENAME = "input.json"      # Default output filename
ANKI_DEFAULT_DECK = "_Others"  # Default deck name

# --- NEW CONFIGURATION ---
OUTPUT_BLANK_DIR = Path("./data/output")  # Directory for blank output files
OUTPUT_BLANK_FILENAME = "output.json"     # Default blank output file name
MAX_NOTES_PER_PART = 25                   # Default constant: Maximum notes per part file

# Create directories if they don't exist
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_BLANK_DIR.mkdir(parents=True, exist_ok=True)

# --- Logging Helpers (ASCII-safe) ---
console = Console()

def log_success(message): console.print(f"[+] {message}", style="bold green")
def log_warn(message): console.print(f"[?] {message}", style="bold yellow")
def log_error(error): console.print(f"[-] {str(error)}", style="bold red")
def log_info(message): console.print(f"[i] {message}", style="cyan")
def log_task(message): console.print(f"[*] {message}", style="magenta")

# --- AnkiConnect helpers ---
def anki_request(action: str, params: Optional[dict] = None):
    try:
        if params is None:
            params = {}
        response = requests.post(ANKI_URL, json={'action': action, 'version': 6, 'params': params})
        response.raise_for_status()
        result = response.json()
        if 'error' in result and result['error']:
            raise Exception(result['error'])
        return result['result']
    except Exception as e:
        raise e

def fetch_note_ids(deck_name: str) -> List[int]:
    return anki_request('findNotes', {'query': f'deck:"{deck_name}"'})

def fetch_note_details(note_ids: List[int]) -> List[dict]:
    return anki_request('notesInfo', {'notes': note_ids})

def process_notes(notes: List[dict], exclude_fields: Optional[List[str]] = None) -> List[dict]:
    if exclude_fields is None:
        exclude_fields = []

    processed = []
    for note in notes:
        fields = note.get('fields', {})
        potential_fields = {
            'noteId': note.get('noteId'),
            'SL': fields.get('SL', {}).get('value', ''),
            'Question': fields.get('Question', {}).get('value', ''),
            'OP1': fields.get('OP1', {}).get('value', ''),
            'OP2': fields.get('OP2', {}).get('value', ''),
            'OP3': fields.get('OP3', {}).get('value', ''),
            'OP4': fields.get('OP4', {}).get('value', ''),
            'Answer': fields.get('Answer', {}).get('value', ''),  # RAW VALUE
            'Solution': fields.get('Solution', {}).get('value', ''),
            'Video': fields.get('Video', {}).get('value', ''),
            'Tags': note.get('tags', [])
        }

        processed_note = {
            key: value for key, value in potential_fields.items() if key not in exclude_fields
        }
        processed.append(processed_note)
    return processed

# --- FUNCTION FOR CLEANING INPUT DIRECTORY ---
def clean_input_directory():
    """Delete all .json files in the OUTPUT_DIR."""
    try:
        log_task(f"Cleaning all *.json files in {OUTPUT_DIR}...")
        deleted_count = 0
        for file_path in OUTPUT_DIR.glob("*.json"):
            file_path.unlink()
            deleted_count += 1
        log_info(f"Successfully deleted {deleted_count} old input .json file(s).")
    except Exception as e:
        log_error(f"Failed to clean input directory: {e}")
# --- END CLEAN INPUT FUNCTION ---

# --- FUNCTION FOR CLEANING OUTPUT DIRECTORY ---
def clean_output_directory():
    """Delete all .json files in the OUTPUT_BLANK_DIR."""
    try:
        log_task(f"Cleaning all *.json files in {OUTPUT_BLANK_DIR}...")
        deleted_count = 0
        for file_path in OUTPUT_BLANK_DIR.glob("*.json"):
            file_path.unlink()
            deleted_count += 1
        log_info(f"Successfully deleted {deleted_count} old output .json file(s).")
    except Exception as e:
        log_error(f"Failed to clean output directory: {e}")
# --- END CLEAN OUTPUT FUNCTION ---

# MODIFIED: Removed the internal call to clean_output_directory()
def create_blank_output_files(num_parts: int = 1):
    """Create blank JSON files in ./data/output directory based on the number of input parts."""
    try:
        OUTPUT_BLANK_DIR.mkdir(parents=True, exist_ok=True)
        # Note: clean_output_directory() has been removed here and moved to run_fetch_notes

        if num_parts > 1:
            for i in range(1, num_parts + 1):
                blank_path = OUTPUT_BLANK_DIR / f"output-{i}.json"
                with open(blank_path, "w", encoding="utf-8") as f:
                    json.dump([], f, ensure_ascii=False, indent=2)
                log_info(f"Blank file created → {blank_path}")
        else:
            blank_path = OUTPUT_BLANK_DIR / OUTPUT_BLANK_FILENAME
            with open(blank_path, "w", encoding="utf-8") as f:
                json.dump([], f, ensure_ascii=False, indent=2)
            log_info(f"Blank file created → {blank_path}")
    except Exception as e:
        log_error(f"Failed to create blank output files: {e}")

def save_noteid_list(note_ids: List[int]):
    """Save note IDs to data/input/noteid_list.txt in 'nid:<id> OR nid:<id>' format."""
    try:
        noteid_path = OUTPUT_DIR / "noteid_list.txt"
        content = " OR ".join([f"nid:{nid}" for nid in note_ids])
        with open(noteid_path, "w", encoding="utf-8") as f:
            f.write(content)
        log_success(f"Note ID list saved → {noteid_path}")
    except Exception as e:
        log_error(f"Failed to save note ID list: {e}")

# MODIFIED: Added max_notes_per_part argument
def run_fetch_notes(deck: str, exclude: Optional[List[str]] = None, max_notes_per_part: int = MAX_NOTES_PER_PART):
    try:
        # --- 1. CLEAN INPUT AND OUTPUT DIRECTORIES ---
        clean_input_directory()
        clean_output_directory()

        # --- 2. FETCH DATA FROM ANKI ---
        log_task(f'Fetching note IDs from deck "{deck}"...')
        note_ids = fetch_note_ids(deck)
        total_notes = len(note_ids)

        if not note_ids:
            log_warn(f'No notes found in deck "{deck}".')
            # Create a single blank output file (cleaning is already done)
            create_blank_output_files(num_parts=1)
            return

        log_info(f'Found {total_notes} note(s).')

        # --- Save note ID list ---
        save_noteid_list(note_ids)

        log_task('Fetching full details for all notes...')
        notes_info = fetch_note_details(note_ids)

        # --- Apply Default Exclusion (Solution and Video) ---
        final_exclude = set(exclude or [])
        final_exclude.add('Solution') # DEFAULT EXCLUSION ADDED
        final_exclude.add('Video')    # NEW DEFAULT EXCLUSION ADDED
        final_exclude_list = list(final_exclude)
        # ------------------------------------------

        log_task(f'Processing note data (excluding: {final_exclude_list or "None"})...')
        processed_notes = process_notes(notes_info, final_exclude_list)
        log_success('Note details processed successfully.')
        
        # --- 3. SAVE INPUT AND BLANK OUTPUT FILES ---

        # Splitting into parts with the provided limit (max_notes_per_part)
        chunks = [processed_notes[i:i + max_notes_per_part] 
                  for i in range(0, total_notes, max_notes_per_part)]
        
        num_parts = len(chunks)

        if num_parts > 1:
            # MODIFIED: Used max_notes_per_part for logging
            log_info(f"Splitting notes into {num_parts} parts (max {max_notes_per_part} notes per part).")
            for i, chunk in enumerate(chunks, start=1):
                output_path = OUTPUT_DIR / f"input-{i}.json"
                log_task(f'Saving part {i}/{num_parts} to "{output_path}"...')
                with open(output_path, 'w', encoding='utf-8') as f:
                    json.dump(chunk, f, ensure_ascii=False, indent=2)
                log_success(f'Part {i} exported to → "{output_path}"')
        else:
            # Case: 0 to limit notes (saved as a single file: input.json)
            output_path = OUTPUT_DIR / OUTPUT_FILENAME
            log_task(f'Saving notes to "{output_path}"...')
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(processed_notes, f, ensure_ascii=False, indent=2)
            log_success(f'Notes exported to → "{output_path}"')

        # Create blank output files in data/output (cleaning was done in step 1)
        create_blank_output_files(num_parts)

    except Exception as e:
        log_error(f"An error occurred during the fetch process: {e}")

# --- Typer CLI App ---
app = typer.Typer(
    help="Fetches notes from Anki, cleans all old .json files in both './data/input/' and './data/output/', and saves new data to input/ and blank files to output/.",
    add_completion=False
)

@app.command()
# MODIFIED: Added limit option
def main(
    deck: str = typer.Option(
        ANKI_DEFAULT_DECK,
        "--deck", "-d",
        help="Name of the Anki deck to fetch notes from."
    ),
    exclude: Optional[List[str]] = typer.Option(
        None,
        "--exclude",
        help="Fields to exclude from output *in addition to 'Solution' and 'Video'* (which are excluded by default). Case-sensitive. Separate multiple with commas or repeat flag. E.g., --exclude SL OR --exclude SL,OP1"
    ),
    limit: int = typer.Option(
        MAX_NOTES_PER_PART, # Use the global constant as the default value
        "--limit", "-l",
        help=f"Maximum number of notes to include in a single part file (default: {MAX_NOTES_PER_PART})."
    )
):
    """
    Fetch Anki notes, clean existing .json files in data/input and data/output, and export to new files.
    'Solution' and 'Video' are excluded by default.
    Notes are automatically split into files with a maximum set by --limit (default 25) notes per file (e.g., input-1.json, input-2.json, ...).
    Also saves a note ID list to ./data/input/noteid_list.txt in 'nid:<id> OR nid:<id>' format.
    """
    if exclude:
        split_exclude = []
        for item in exclude:
            parts_list = [part.strip() for part in item.split(',')]
            split_exclude.extend(parts_list)
        exclude = split_exclude

    # MODIFIED: Passed the new limit argument
    run_fetch_notes(deck, exclude, limit)

if __name__ == "__main__":
    app()