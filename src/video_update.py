import requests
import argparse
import os
import glob
import time 
import sys
import shutil
from pathlib import Path
from typing import List, Dict, Any, Tuple 

# --- Anki-Connect Configuration ---
ANKI_CONNECT_URL = "http://127.0.0.1:8765"
DEFAULT_DECK_NAME = "_Others"  
VIDEO_FIELD_NAME = "Video" 
UPDATE_DELAY_SECONDS = 0.5 

# --- CONSTANTS FOR VALIDATION & PATHS ---
ALLOWED_SUBJECTS = {"MATH", "GI"} 
TEMP_VIDEO_FOLDER = "D:\\Media\\Recordings\\temp" 
BASE_DEST_FOLDER = "D:\\Media\\Recordings"        

def anki_connect_request(action: str, **params: Any) -> Any | None:
    payload = {
        "action": action,
        "version": 6,
        "params": params
    }
    
    try:
        response = requests.post(ANKI_CONNECT_URL, json=payload, timeout=10)
        response.raise_for_status()
        
        result = response.json()
        
        if result.get("error"):
            raise Exception(f"Anki-Connect Error: {result['error']}")
            
        return result.get("result")
        
    except requests.exceptions.RequestException as e:
        print(f"\n[ERROR] Could not connect to Anki-Connect: {e}")
        return None
    except Exception as e:
        print(f"\n[ERROR] Anki-Connect Request failed: {e}")
        return None

def get_note_data_from_deck(deck_name: str, field_name: str) -> List[Dict[str, Any]]:
    """
    Retrieves note IDs, fetches their content, and SORTS them by ID (Creation Time).
    """
    query = f'deck:"{deck_name}"'
    print(f"1. Fetching Note IDs for deck: '{deck_name}'...")
    
    note_ids = anki_connect_request("findNotes", query=query)
    
    if note_ids is None:
        return []

    print(f"   -> Successfully retrieved {len(note_ids)} note IDs.")

    # 1b. Get the full note info
    print("   -> Fetching note field contents...")
    notes_info = anki_connect_request("notesInfo", notes=note_ids)

    if notes_info is None:
        return [{'id': nid, 'current_link': ''} for nid in note_ids]

    notes_data = []
    for info in notes_info:
        note_id = info['noteId']
        current_link = info['fields'].get(field_name, {}).get('value', '')
        
        notes_data.append({
            'id': note_id,
            'current_link': current_link
        })
    
    # --- CRITICAL: Sort notes by ID (Oldest -> Newest) ---
    # Anki Note IDs are timestamps, so sorting them creates chronological order.
    notes_data.sort(key=lambda x: x['id'])
    
    return notes_data

def rename_videos_and_prepare_updates(
    note_data_list: List[Dict[str, Any]], 
    source_folder: str, 
    destination_folder: str, 
    subject: str
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Renames video files based on CREATION DATE matching the Note ID order.
    Returns:
        1. List of dicts for Anki updates.
        2. List of filenames (strings) to move.
    """
    print(f"\n2. Searching for .mp4 files in folder: '{source_folder}'")
    
    # Get all mp4 files
    mp4_files = glob.glob(os.path.join(source_folder, '*.mp4'))
    
    # --- CRITICAL: Sort files by CREATION DATE (Oldest -> Newest) ---
    # This ignores the filename and looks at the file system timestamp.
    mp4_files.sort(key=os.path.getctime)
    
    num_notes = len(note_data_list)
    num_videos = len(mp4_files)

    print(f"   -> Found {num_videos} .mp4 files.")

    # --- GUARDRAIL ---
    if num_notes != num_videos:
        print(f"\n[FATAL] **Guardrail Triggered: COUNT MISMATCH**")
        print(f"        - Notes found: {num_notes}")
        print(f"        - Videos found: {num_videos}")
        print("        Process aborted to prevent incorrect file association.")
        return [], []
    # --- END GUARDRAIL ---

    if num_videos == 0:
        print("\n[WARNING] No files to rename.")
        return [], []

    url_segments = subject
    print(f"   -> Using SUBJECT '{url_segments}'. Destination folder: '{destination_folder}'")

    BASE_STREAMING_URL = "http://127.0.0.1:8000/play"
    notes_to_update = []
    total_renamed_count = 0
    skip_count = 0
    
    print("\n3. Renaming files (mapped by creation date) and preparing Anki updates...")

    # Zip maps the Sorted Notes (Oldest) to Sorted Files (Oldest)
    for note_data, old_path in zip(note_data_list, mp4_files):
        
        note_id = note_data['id']
        current_link = note_data['current_link']
        note_id_str = str(note_id) 
        
        new_filename = f"{note_id_str}.mp4"
        new_path = os.path.join(source_folder, new_filename)
        old_filename = Path(old_path).name
        
        # --- Calculate Expected Link ---
        video_url = f"{BASE_STREAMING_URL}/{url_segments}/{new_filename}"
        expected_video_link_html = f'<a href="{video_url}">Solution</a>'

        # --- RENAME LOGIC ---
        file_was_renamed = False
        if old_filename != new_filename:
            try:
                os.rename(old_path, new_path)
                print(f"   RENAMED: {old_filename} -> {new_filename}")
                total_renamed_count += 1
                file_was_renamed = True
            except OSError as e:
                print(f"   [ERROR] Failed to rename {old_filename}: {e}. Skipping.")
                continue 

        # --- SKIP OPTIMIZATION ---
        if current_link == expected_video_link_html:
            log_suffix = "(Renamed file)" if file_was_renamed else "(File already correct)"
            print(f"   SKIPPED UPDATE (Link Matched): Note ID {note_id} {log_suffix}")
            skip_count += 1
            continue 
        
        notes_to_update.append({
            'id': note_id,
            'link': expected_video_link_html
        })
    
    print(f"\n--- Renaming Complete: {total_renamed_count} files renamed. ---")
    
    all_renamed_files = [f"{str(n['id'])}.mp4" for n in note_data_list]
    return notes_to_update, all_renamed_files

def move_files_to_destination(source_folder: str, destination_folder: str, file_list: List[str]):
    if not file_list:
        return

    print(f"\n5. Moving {len(file_list)} files from '{source_folder}' to '{destination_folder}'...")
    
    try:
        os.makedirs(destination_folder, exist_ok=True)
    except OSError as e:
        print(f"[FATAL] Failed to create destination folder: {e}")
        return
        
    move_count = 0
    for filename in file_list:
        source_path = os.path.join(source_folder, filename)
        dest_path = os.path.join(destination_folder, filename)
        
        if os.path.exists(source_path):
            try:
                shutil.move(source_path, dest_path)
                move_count += 1
            except Exception as e:
                print(f"[ERROR] Failed to move file {filename}: {e}")
        
    print(f"   -> Successfully moved {move_count}/{len(file_list)} files.")
    
def update_anki_notes(notes_to_update: List[Dict[str, Any]], field_name: str):
    if not notes_to_update:
        print("4. No notes to update in Anki.")
        return

    print(f"\n4. Starting Anki update for {len(notes_to_update)} notes...")
    
    success_count = 0
    for i, note_data in enumerate(notes_to_update):
        note_id = note_data['id']
        video_link = note_data['link']
        
        note_payload = {
            "id": note_id,
            "fields": {
                field_name: video_link
            }
        }
        
        result = anki_connect_request("updateNoteFields", note=note_payload)
        
        if result is None:
            success_count += 1
            print(f"   UPDATED: Note ID {note_id}")
        else:
            print(f"   [WARNING] Failed to update Note ID {note_id}.")

        if i < len(notes_to_update) - 1:
            time.sleep(UPDATE_DELAY_SECONDS)
            
    print(f"\n   -> Successfully updated {success_count}/{len(notes_to_update)} notes.")

def main():
    parser = argparse.ArgumentParser(description="Map Oldest Video -> Oldest Anki Card.")
    
    parser.add_argument('-d', '--deck', type=str, default=DEFAULT_DECK_NAME, help='Anki deck name')
    parser.add_argument('-s', '--subject', type=str, required=True, help='Subject (MATH, GI)')
    
    args = parser.parse_args()
    
    # Validation
    input_subject_upper = args.subject.upper()
    if input_subject_upper not in ALLOWED_SUBJECTS:
        print(f"\n[FATAL] Invalid subject. Allowed: {', '.join(sorted(list(ALLOWED_SUBJECTS)))}")
        sys.exit(1)
    
    subject = input_subject_upper
    deck_name = args.deck
    source_folder = TEMP_VIDEO_FOLDER
    destination_folder = os.path.join(BASE_DEST_FOLDER, subject)

    if not os.path.isdir(source_folder):
        print(f"[FATAL] Source folder not found: {source_folder}")
        return

    # 1. Fetch & Sort Notes (Oldest -> Newest)
    note_data_list = get_note_data_from_deck(deck_name, VIDEO_FIELD_NAME)
    
    if not note_data_list:
        print("[FATAL] Could not retrieve any note IDs.")
        return
        
    # 2. Sort Files by Creation Date, Rename, and Map
    notes_to_update, files_to_move = rename_videos_and_prepare_updates(
        note_data_list, 
        source_folder, 
        destination_folder, 
        subject=subject
    )
    
    # 3. Update Anki
    update_anki_notes(notes_to_update, field_name=VIDEO_FIELD_NAME)
    
    # 4. Move Files
    move_files_to_destination(source_folder, destination_folder, files_to_move)

    print("\n--- Process Complete ---")

if __name__ == "__main__":
    main()