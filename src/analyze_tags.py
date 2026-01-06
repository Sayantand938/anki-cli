# import json
# from pathlib import Path
# from typing import List, Dict, Any, Set
# from rich.console import Console

# # --- Configuration ---
# INPUT_FILE = Path("./data/input/input.json")

# # Define the exclusive list of valid subject prefixes
# VALID_SUBJECTS: Set[str] = {"MATH", "GK", "GI", "ENG", "BENG", "COMPUTER"}

# # --- Logging Helpers ---
# console = Console()

# def log_info(message: str):
#     console.print(f"[i] {message}", style="cyan")

# def log_warn(message: str):
#     console.print(f"[!] {message}", style="bold yellow")

# def log_error(error: str):
#     console.print(f"[-] {str(error)}", style="bold red")

# def log_success(message: str):
#     console.print(f"[+] {message}", style="bold green")

# def log_task(message: str):
#     console.print(f"[*] {message}", style="magenta")

# def print_issue_details(title: str, issues: List[Dict[str, Any]]):
#     """Helper function to print a formatted section of issues."""
#     if issues:
#         log_warn(f"\n--- {title} ({len(issues)} found) ---")
#         for issue in issues:
#             console.print(f"  - [bold]Note ID:[/] {issue['noteId']}")
#             console.print(f"    [bold]Tags:[/] {issue['tags']}\n")

# def find_tagging_issues():
#     """
#     Analyzes notes for multiple, missing, or malformed subject tags based on a predefined list
#     and generates a consolidated Anki search query.
#     """
#     if not INPUT_FILE.exists():
#         log_error(f"Input file not found at: {INPUT_FILE}")
#         return

#     log_info(f"Loading notes from {INPUT_FILE}...")
#     try:
#         with open(INPUT_FILE, 'r', encoding='utf-8') as f:
#             notes: List[Dict[str, Any]] = json.load(f)
#     except json.JSONDecodeError as e:
#         log_error(f"Failed to decode JSON from {INPUT_FILE}. Error: {e}")
#         return
#     except Exception as e:
#         log_error(f"An unexpected error occurred: {e}")
#         return

#     log_info(f"Successfully loaded {len(notes)} notes. Analyzing for tag issues...")

#     # --- 2. Categorize notes with issues ---
#     issues_multiple_subjects = []
#     issues_malformed_subject = []
#     issues_missing_subject = []
#     all_problematic_nids = set()

#     for note in notes:
#         note_id = note.get("noteId")
#         tags = note.get("Tags", [])

#         if not note_id or not isinstance(tags, list):
#             continue

#         # Category 1: Correctly formatted subject tags (e.g., "MATH::Algebra")
#         subject_tags = [tag for tag in tags if tag.count("::") == 1]
        
#         # Category 2: Malformed subject tags (e.g., "MATH" but not "MATH::Topic")
#         # This now checks ONLY against your specific list.
#         malformed_tags = [tag for tag in tags if tag in VALID_SUBJECTS]

#         # --- Categorize issues and collect note IDs ---
#         is_problem = False
#         # Case 1: More than one correctly formatted subject tag
#         if len(subject_tags) > 1:
#             issues_multiple_subjects.append({"noteId": note_id, "tags": tags})
#             is_problem = True

#         # Case 2: A tag exists from your list but without "::"
#         if malformed_tags:
#             issues_malformed_subject.append({"noteId": note_id, "tags": tags})
#             is_problem = True
        
#         # Case 3: No valid subject tags AND no malformed subject tags are found
#         if not subject_tags and not malformed_tags:
#             issues_missing_subject.append({"noteId": note_id, "tags": tags})
#             is_problem = True

#         if is_problem:
#             all_problematic_nids.add(note_id)

#     # --- 3. Report the findings ---
#     log_info("-" * 40)
#     if not all_problematic_nids:
#         log_success("Analysis complete. No tagging issues found!")
#         return
    
#     log_info("Analysis complete. Found the following issues:")

#     print_issue_details("Multiple Subject Tags", issues_multiple_subjects)
#     print_issue_details("Malformed Subject Tags (e.g., 'MATH' instead of 'MATH::TOPIC')", issues_malformed_subject)
#     print_issue_details("Missing Subject Tags", issues_missing_subject)

#     # --- 4. Generate and print the consolidated Anki search string ---
#     if all_problematic_nids:
#         sorted_nids = sorted(list(all_problematic_nids))
#         anki_search_query = " OR ".join([f"nid:{nid}" for nid in sorted_nids])

#         log_info("-" * 40)
#         log_task(f"Found a total of {len(all_problematic_nids)} unique notes with issues.")
#         log_task("Copy the line below and paste it into the Anki search bar:")
#         console.print(anki_search_query, style="bold")

# if __name__ == "__main__":
#     find_tagging_issues()



import json
from pathlib import Path
from typing import List, Dict, Any, Set
from rich.console import Console

# --- Configuration ---
# CHANGED: Now points to the directory containing all input files
INPUT_DIR = Path("./data/input/")

# Define the exclusive list of valid subject prefixes
VALID_SUBJECTS: Set[str] = {"MATH", "GK", "GI", "ENG", "BENG", "COMPUTER"}

# --- Logging Helpers ---
console = Console()

def log_info(message: str):
    console.print(f"[i] {message}", style="cyan")

def log_warn(message: str):
    console.print(f"[!] {message}", style="bold yellow")

def log_error(error: str):
    console.print(f"[-] {str(error)}", style="bold red")

def log_success(message: str):
    console.print(f"[+] {message}", style="bold green")

def log_task(message: str):
    console.print(f"[*] {message}", style="magenta")

def print_issue_details(title: str, issues: List[Dict[str, Any]]):
    """Helper function to print a formatted section of issues."""
    if issues:
        log_warn(f"\n--- {title} ({len(issues)} found) ---")
        for issue in issues:
            console.print(f"  - [bold]Note ID:[/] {issue['noteId']}")
            console.print(f"    [bold]Tags:[/] {issue['tags']}\n")

def find_tagging_issues():
    """
    Analyzes notes for multiple, missing, or malformed subject tags based on a predefined list
    and generates a consolidated Anki search query. It processes all .json files in INPUT_DIR.
    """
    if not INPUT_DIR.is_dir():
        log_error(f"Input directory not found at: {INPUT_DIR}")
        return

    input_files = list(INPUT_DIR.glob('*.json'))
    if not input_files:
        log_warn(f"No .json files found in {INPUT_DIR}. Exiting.")
        return

    log_task(f"Found {len(input_files)} JSON files in {INPUT_DIR}.")

    # --- 1. Load notes from all files and consolidate ---
    all_notes: List[Dict[str, Any]] = []
    
    for file_path in input_files:
        log_info(f"Loading notes from {file_path}...")
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                notes_from_file: List[Dict[str, Any]] = json.load(f)
                all_notes.extend(notes_from_file)
                log_info(f"Loaded {len(notes_from_file)} notes from {file_path}.")
        except json.JSONDecodeError as e:
            log_error(f"Failed to decode JSON from {file_path}. Error: {e}")
            # Continue to the next file if one fails
        except Exception as e:
            log_error(f"An unexpected error occurred while processing {file_path}: {e}")
            # Continue to the next file

    if not all_notes:
        log_error("No notes were successfully loaded from any of the input files. Exiting.")
        return

    log_info(f"Successfully loaded a total of {len(all_notes)} notes from all files. Analyzing for tag issues...")

    # --- 2. Categorize notes with issues ---
    issues_multiple_subjects = []
    issues_malformed_subject = []
    issues_missing_subject = []
    all_problematic_nids = set()

    for note in all_notes:
        note_id = note.get("noteId")
        tags = note.get("Tags", [])

        if not note_id or not isinstance(tags, list):
            continue

        # Category 1: Correctly formatted subject tags (e.g., "MATH::Algebra")
        subject_tags = [tag for tag in tags if tag.count("::") == 1]
        
        # Category 2: Malformed subject tags (e.g., "MATH" but not "MATH::Topic")
        malformed_tags = [tag for tag in tags if tag in VALID_SUBJECTS]

        # --- Categorize issues and collect note IDs ---
        is_problem = False
        # Case 1: More than one correctly formatted subject tag
        if len(subject_tags) > 1:
            issues_multiple_subjects.append({"noteId": note_id, "tags": tags})
            is_problem = True

        # Case 2: A tag exists from your list but without "::"
        if malformed_tags:
            issues_malformed_subject.append({"noteId": note_id, "tags": tags})
            is_problem = True
        
        # Case 3: No valid subject tags AND no malformed subject tags are found
        if not subject_tags and not malformed_tags:
            issues_missing_subject.append({"noteId": note_id, "tags": tags})
            is_problem = True

        if is_problem:
            all_problematic_nids.add(note_id)

    # --- 3. Report the findings ---
    log_info("-" * 40)
    if not all_problematic_nids:
        log_success("Analysis complete. No tagging issues found!")
        return
    
    log_info("Analysis complete. Found the following issues:")

    print_issue_details("Multiple Subject Tags", issues_multiple_subjects)
    print_issue_details("Malformed Subject Tags (e.g., 'MATH' instead of 'MATH::TOPIC')", issues_malformed_subject)
    print_issue_details("Missing Subject Tags", issues_missing_subject)

    # --- 4. Generate and print the consolidated Anki search string ---
    if all_problematic_nids:
        sorted_nids = sorted(list(all_problematic_nids))
        anki_search_query = " OR ".join([f"nid:{nid}" for nid in sorted_nids])

        log_info("-" * 40)
        log_task(f"Found a total of {len(all_problematic_nids)} unique notes with issues.")
        log_task("Copy the line below and paste it into the Anki search bar:")
        console.print(anki_search_query, style="bold")

if __name__ == "__main__":
    find_tagging_issues()