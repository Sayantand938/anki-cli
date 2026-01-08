# # import os
# # import shutil
# # import requests
# # import typer
# # from typing import Annotated

# # # --- Configuration ---
# # ANKI_URL = 'http://localhost:8765'
# # TEMP_DIR = r"D:\Media\Recordings\temp"
# # BASE_RECORDINGS_DIR = r"D:\Media\Recordings"
# # DECK_NAME = "00-OTHERS"

# # app = typer.Typer()

# # def invoke(action, **params):
# #     """Helper to communicate with AnkiConnect."""
# #     payload = {"action": action, "version": 6, "params": params}
# #     try:
# #         response = requests.post(ANKI_URL, json=payload).json()
# #     except requests.exceptions.ConnectionError:
# #         typer.secho("Error: Anki is not running. Please open Anki with AnkiConnect installed.", fg=typer.colors.RED)
# #         raise typer.Exit(code=1)
    
# #     if response.get('error'):
# #         raise Exception(f"Anki Error: {response['error']}")
# #     return response['result']

# # @app.command()
# # def process(
# #     subject: Annotated[str, typer.Option("--subject", "-s", help="Subject folder (MATH or GI)")]
# # ):
# #     """
# #     Renames videos from temp folder based on NoteIDs and updates Anki fields.
# #     """
# #     subject_upper = subject.upper()
# #     dest_dir = os.path.join(BASE_RECORDINGS_DIR, subject_upper)

# #     # 1. Fetch Note IDs from Anki
# #     typer.echo(f"Searching for notes in deck: {DECK_NAME}...")
# #     note_ids = invoke('findNotes', query=f'deck:"{DECK_NAME}"')
    
# #     if not note_ids:
# #         typer.secho(f"No notes found in deck '{DECK_NAME}'.", fg=typer.colors.YELLOW)
# #         raise typer.Exit()

# #     # 2. Get Video Files and sort from OLDEST to NEWEST
# #     if not os.path.exists(TEMP_DIR):
# #         typer.secho(f"Error: Temp directory {TEMP_DIR} not found.", fg=typer.colors.RED)
# #         raise typer.Exit(code=1)

# #     video_files = [
# #         os.path.join(TEMP_DIR, f) 
# #         for f in os.listdir(TEMP_DIR) 
# #         if f.lower().endswith('.mp4')
# #     ]
# #     # Sort by creation time (Oldest first)
# #     video_files.sort(key=os.path.getctime)

# #     # 3. Validation
# #     num_notes = len(note_ids)
# #     num_files = len(video_files)

# #     if num_notes != num_files:
# #         typer.secho("CRITICAL: Count Mismatch!", fg=typer.colors.BRIGHT_RED, bold=True)
# #         typer.echo(f"Notes in Anki: {num_notes}")
# #         typer.echo(f"Videos in Temp: {num_files}")
# #         typer.echo("Aborting to prevent incorrect renaming.")
# #         raise typer.Exit(code=1)

# #     # 4. Fetch Note info (tags) in bulk for efficiency
# #     notes_data = invoke('notesInfo', notes=note_ids)
    
# #     # 5. Process loop
# #     os.makedirs(dest_dir, exist_ok=True)
# #     typer.echo(f"Starting processing for {num_notes} items...\n")

# #     for i, note_id in enumerate(note_ids, start=1):
# #         # A. File logic
# #         src_path = video_files[i-1] # index 0 based for list
# #         new_filename = f"{note_id}.mp4"
# #         dst_path = os.path.join(dest_dir, new_filename)

# #         # Overwrite logic
# #         if os.path.exists(dst_path):
# #             os.remove(dst_path)
# #         shutil.move(src_path, dst_path)

# #         # B. Anki Update logic
# #         note_info = notes_data[i-1]
# #         tags = note_info.get('tags', [])
# #         html_link = ""

# #         # Check tags (Case-insensitive)
# #         is_math = any(t.lower().startswith("math::") for t in tags)
# #         is_gi = any(t.lower().startswith("gi::") for t in tags)

# #         if is_math:
# #             html_link = f'<a href="http://127.0.0.1:8000/play/MATH/{note_id}.mp4">Solution</a>'
# #         elif is_gi:
# #             html_link = f'<a href="http://127.0.0.1:8000/play/GI/{note_id}.mp4">Solution</a>'

# #         if html_link:
# #             invoke('updateNoteFields', note={
# #                 "id": note_id,
# #                 "fields": {
# #                     "Video": html_link
# #                 }
# #             })

# #         # C. Progress Count Display
# #         typer.echo(f"[{i}/{num_notes}] noteid {note_id} is processed")

# #     typer.secho("\nAll tasks completed successfully.", fg=typer.colors.GREEN, bold=True)

# # if __name__ == "__main__":
# #     app()





# import requests
# import json

# def invoke(action, **params):
#     """
#     Standard helper function to send requests to AnkiConnect.
#     """
#     payload = {
#         "action": action,
#         "version": 6,
#         "params": params
#     }
    
#     try:
#         response = requests.post('http://localhost:8765', json=payload).json()
#     except requests.exceptions.ConnectionError:
#         print("Error: Could not connect to Anki. Make sure Anki is open and AnkiConnect is installed.")
#         return None

#     if response.get('error'):
#         raise Exception(response['error'])
    
#     return response['result']

# def get_note_ids_from_deck(deck_name):
#     # As per the 'findNotes' documentation, we use Anki's search syntax.
#     # Wrapping the deck name in quotes handles names with spaces or special characters.
#     query_string = f'deck:"{deck_name}"'
    
#     # Action: findNotes
#     # Returns: an array of note identifiers
#     note_ids = invoke('findNotes', query=query_string)
#     return note_ids

# # --- Main ---
# deck_to_search = "00-OTHERS"
# note_ids = get_note_ids_from_deck(deck_to_search)

# if note_ids is not None:
#     print(f"Found {len(note_ids)} notes in deck '{deck_to_search}':")
#     print(note_ids)


import os
import shutil
import requests
import typer
from typing import Annotated

# --- Configuration ---
ANKI_URL = 'http://localhost:8765'
TEMP_DIR = r"D:\Media\Recordings\temp"
BASE_RECORDINGS_DIR = r"D:\Media\Recordings"
DECK_NAME = "00-OTHERS"

app = typer.Typer()

def invoke(action, **params):
    payload = {"action": action, "version": 6, "params": params}
    try:
        response = requests.post(ANKI_URL, json=payload).json()
    except requests.exceptions.ConnectionError:
        typer.secho("Error: Anki is not running. Open Anki first.", fg=typer.colors.RED)
        raise typer.Exit(code=1)
    
    if response.get('error'):
        raise Exception(f"Anki Error: {response['error']}")
    return response['result']

@app.command()
def process(
    subject: Annotated[str, typer.Option("--subject", "-s", help="Subject folder (MATH or GI)")]
):
    subject_upper = subject.upper()
    dest_dir = os.path.join(BASE_RECORDINGS_DIR, subject_upper)

    # 1. Fetch Note IDs and SORT numerically (Oldest Note ID first)
    typer.echo(f"Fetching notes from deck: {DECK_NAME}...")
    note_ids = invoke('findNotes', query=f'deck:"{DECK_NAME}"')
    
    if not note_ids:
        typer.secho(f"No notes found in deck {DECK_NAME}.", fg=typer.colors.YELLOW)
        raise typer.Exit()
    
    # Sort IDs so the smallest number (earliest created) is first
    note_ids.sort()

    # 2. Get Video Files and SORT by Name (Oldest Filename first)
    if not os.path.exists(TEMP_DIR):
        typer.secho(f"Error: Temp directory {TEMP_DIR} not found.", fg=typer.colors.RED)
        raise typer.Exit(code=1)

    video_files = [
        f for f in os.listdir(TEMP_DIR) 
        if f.lower().endswith('.mp4')
    ]
    
    # Sorting by name works perfectly for filenames like "2026-01-04 11-40-04.mp4"
    video_files.sort()

    # 3. Validation
    num_notes = len(note_ids)
    num_files = len(video_files)

    if num_notes != num_files:
        typer.secho("CRITICAL: Count Mismatch!", fg=typer.colors.BRIGHT_RED, bold=True)
        typer.echo(f"Notes in Anki: {num_notes}")
        typer.echo(f"Videos in Temp: {num_files}")
        typer.echo("Stopping to prevent incorrect renaming.")
        raise typer.Exit(code=1)

    # 4. Fetch Note info in bulk for tag checking
    notes_data = invoke('notesInfo', notes=note_ids)
    # Create a lookup dictionary for easy access by noteId
    notes_lookup = {n['noteId']: n for n in notes_data}

    # 5. Process loop
    os.makedirs(dest_dir, exist_ok=True)
    typer.echo(f"Processing {num_notes} items chronologically...\n")

    for i, note_id in enumerate(note_ids, start=1):
        # A. File Handling
        original_filename = video_files[i-1]
        src_path = os.path.join(TEMP_DIR, original_filename)
        new_filename = f"{note_id}.mp4"
        dst_path = os.path.join(dest_dir, new_filename)

        # Overwrite if exists
        if os.path.exists(dst_path):
            os.remove(dst_path)
        shutil.move(src_path, dst_path)

        # B. Anki Update Logic
        note_info = notes_lookup.get(note_id)
        tags = note_info.get('tags', [])
        html_link = ""

        # Use case-insensitive check for tags MATH:: or GI::
        is_math = any(t.upper().startswith("MATH::") for t in tags)
        is_gi = any(t.upper().startswith("GI::") for t in tags)

        if is_math:
            html_link = f'<a href="http://127.0.0.1:8000/play/MATH/{note_id}.mp4">Solution</a>'
        elif is_gi:
            html_link = f'<a href="http://127.0.0.1:8000/play/GI/{note_id}.mp4">Solution</a>'

        if html_link:
            invoke('updateNoteFields', note={
                "id": note_id,
                "fields": {
                    "Video": html_link
                }
            })

        # C. Progress Display
        typer.echo(f"[{i}/{num_notes}] noteid {note_id} is processed (from {original_filename})")

    typer.secho("\nAll videos renamed and Anki fields updated!", fg=typer.colors.GREEN, bold=True)

if __name__ == "__main__":
    app()