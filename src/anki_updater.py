import json
from pathlib import Path
from typing import List, Dict, Any, Optional
import typer
from rich.console import Console
import requests
import subprocess # <--- ADDED: Import subprocess for running external scripts

# --- CONFIGURATION ---
ANKI_URL = "http://localhost:8765"  # AnkiConnect
TARGET_IDS_FILE = Path("./data/input/input.json")    # noteIds to update
UPDATE_DATA_FILE = Path("./data/output/output.json") # data with Answer / Solution / newTag
ALLOWED_SUBJECTS = ["MATH", "GK", "GI", "ENG", "BENG", "COMPUTER"]
MERGE_SCRIPT_PATH = Path("src/merge_json.py") # <--- ADDED: Path to the merge script

# --- Logging Helpers ---
console = Console()

def log_success(message): console.print(f"[+] {message}", style="bold green")
def log_warn(message): console.print(f"[?] {message}", style="bold yellow")
def log_error(error): console.print(f"[-] {str(error)}", style="bold red")
def log_info(message): console.print(f"[i] {message}", style="cyan")
def log_task(message): console.print(f"[*] {message}", style="magenta")

# --- AnkiConnect helpers ---
def anki_request(action: str, params: Optional[Dict[str, Any]] = None):
    try:
        if params is None:
            params = {}
        response = requests.post(
            ANKI_URL, json={"action": action, "version": 6, "params": params}
        )
        response.raise_for_status()
        result = response.json()
        if result.get("error"):
            raise Exception(result["error"])
        return result.get("result")
    except Exception as e:
        raise e

# --- Update field (Answer / Solution) ---
def update_note_field(note_id: int, field_name: str, new_value: str):
    note_info = anki_request("notesInfo", {"notes": [note_id]})
    if not note_info:
        raise Exception(f"Note {note_id} not found.")

    fields = note_info[0].get("fields", {})
    if field_name not in fields:
        raise Exception(
            f"Field '{field_name}' not found in note {note_id}. "
            f"Available fields: {list(fields.keys())}"
        )

    updated_fields = {
        k: (new_value if k == field_name else v["value"]) for k, v in fields.items()
    }

    anki_request("updateNoteFields", {"note": {"id": note_id, "fields": updated_fields}})

# --- Replace tag (newTag) robust version ---
def replace_note_tag(note_id: int, new_tag: str):
    note_info = anki_request("notesInfo", {"notes": [note_id]})
    if not note_info:
        raise Exception(f"Note {note_id} not found in Anki.")

    current_tags: List[str] = note_info[0].get("tags", [])
    new_subject = new_tag.split("::")[0]

    if new_subject not in ALLOWED_SUBJECTS:
        raise Exception(f"New tag subject '{new_subject}' not in allowed subjects: {ALLOWED_SUBJECTS}")

    # Find the first tag whose base subject matches the new tag's subject
    tag_to_replace = None
    for tag in current_tags:
        base_subject = tag.split("::")[0]
        if base_subject == new_subject:
            tag_to_replace = tag
            break

    if not tag_to_replace:
        raise Exception(f"No existing tag with base subject '{new_subject}' found in note {note_id}. Current tags: {current_tags}")

    # Call AnkiConnect replaceTags
    anki_request(
        "replaceTags",
        {
            "notes": [note_id],
            "tag_to_replace": tag_to_replace,
            "replace_with_tag": new_tag,
        },
    )

# --- Main update function ---
def run_update_notes():
    # 0. Conditional Run merge_json.py to prepare update data
    
    # Check if the final files are already present. If both exist, assume
    # the merge has already happened or is unnecessary, and skip the merge script.
    if TARGET_IDS_FILE.exists() and UPDATE_DATA_FILE.exists():
        log_warn(f"Final files {TARGET_IDS_FILE.name} and {UPDATE_DATA_FILE.name} already exist.")
        log_info("Skipping execution of merge script (src/merge_json.py).")
    else:
        # One or both files are missing, run the merge script to create them.
        if not MERGE_SCRIPT_PATH.exists():
            log_error(f"Merge script not found: {MERGE_SCRIPT_PATH}")
            raise typer.Exit(code=1)

        log_task(f"Running {MERGE_SCRIPT_PATH} to prepare update data...")
        try:
            # Execute the merge script using the current Python interpreter
            result = subprocess.run(
                ["python", str(MERGE_SCRIPT_PATH)],
                check=True,  # Raise CalledProcessError for non-zero exit codes
                capture_output=True,
                text=True,
            )
            log_success(f"{MERGE_SCRIPT_PATH} completed successfully.")
            if result.stdout.strip():
                log_info(f"merge_json.py Output:\n{result.stdout.strip()}")
            if result.stderr.strip():
                log_warn(f"merge_json.py Stderr:\n{result.stderr.strip()}")

        except subprocess.CalledProcessError as e:
            log_error(f"{MERGE_SCRIPT_PATH} failed with exit code {e.returncode}.")
            log_error(f"Stdout:\n{e.stdout.strip()}")
            log_error(f"Stderr:\n{e.stderr.strip()}")
            raise typer.Exit(code=1)
        except FileNotFoundError:
            log_error("Failed to run 'python'. Make sure Python is in your PATH.")
            raise typer.Exit(code=1)
        except Exception as e:
            log_error(f"An unexpected error occurred while running {MERGE_SCRIPT_PATH}: {e}")
            raise typer.Exit(code=1)
    
    # 1. Load target note IDs (Must exist now, either pre-existing or created by the script)
    if not TARGET_IDS_FILE.exists():
        log_error(f"Target IDs file not found: {TARGET_IDS_FILE}. Merge script likely failed to create it.")
        raise typer.Exit(code=1)

    log_task(f"Loading target note IDs from {TARGET_IDS_FILE}...")
    with open(TARGET_IDS_FILE, "r", encoding="utf-8") as f:
        target_data: List[Dict[str, Any]] = json.load(f)

    if not isinstance(target_data, list):
        log_error("input.json must contain an array of objects.")
        raise typer.Exit(code=1)

    target_note_ids = {entry.get("noteId") for entry in target_data if isinstance(entry.get("noteId"), int)}
    log_info(f"Loaded {len(target_note_ids)} target note IDs.")

    # 2. Load update data
    if not UPDATE_DATA_FILE.exists():
        log_error(f"Update data file not found: {UPDATE_DATA_FILE}. Merge script likely failed to create it.")
        raise typer.Exit(code=1)

    log_task(f"Loading updates from {UPDATE_DATA_FILE}...")
    with open(UPDATE_DATA_FILE, "r", encoding="utf-8") as f:
        updates: List[Dict[str, Any]] = json.load(f)

    if not isinstance(updates, list):
        log_error("output.json must contain an array of objects.")
        raise typer.Exit(code=1)

    log_info(f"Loaded {len(updates)} updates.")

    # 3. Process updates
    success, fail, skipped = 0, 0, 0
    counter = 0  # Numbering tracker

    for entry in updates:
        note_id = entry.get("noteId")
        if not isinstance(note_id, int):
            log_warn(f"Skipping invalid entry (bad noteId): {entry}")
            fail += 1
            continue

        if note_id not in target_note_ids:
            skipped += 1
            log_info(f"Skipping note {note_id}: not in input.json")
            continue

        counter += 1  # Increment per valid processed note

        try:
            if "Answer" in entry:
                log_task(f"[{counter}] Note {note_id}: Updating Answer...")
                update_note_field(note_id, "Answer", str(entry["Answer"]))
                log_success(f"[{counter}] Note {note_id}: Answer updated")
                success += 1
            elif "Solution" in entry:
                log_task(f"[{counter}] Note {note_id}: Updating Solution...")
                update_note_field(note_id, "Solution", str(entry["Solution"]))
                log_success(f"[{counter}] Note {note_id}: Solution updated")
                success += 1
            elif "newTag" in entry:
                log_task(f"[{counter}] Note {note_id}: Updating Tags with newTag '{entry['newTag']}'...")
                replace_note_tag(note_id, entry["newTag"])
                log_success(f"[{counter}] Note {note_id}: Tags updated")
                success += 1
            else:
                log_warn(f"[{counter}] Note {note_id}: No recognized update field, skipped.")
                skipped += 1
        except Exception as e:
            log_error(f"[{counter}] Failed to update note {note_id}: {e}")
            fail += 1

    log_info("-" * 40)
    log_info(f"Update complete → Success: {success}, Failed: {fail}, Skipped: {skipped}")

# --- Typer CLI ---
app = typer.Typer(
    help="Updates Anki notes: Answer, Solution fields or Tags (via newTag in output.json).",
    add_completion=False,
)

@app.command()
def main():
    try:
        run_update_notes()
    except Exception as e:
        log_error(f"Critical error: {e}")
        raise typer.Exit(code=1)

if __name__ == "__main__":
    app()