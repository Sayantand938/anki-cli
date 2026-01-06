import os
import json
import re
import typer
import time
import random
from google import genai
from google.genai.errors import APIError

# --- Paths ---
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
INPUT_DIR = os.path.join(PROJECT_ROOT, "data", "input")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "data", "output")
INSTRUCTIONS_DIR = os.path.join(PROJECT_ROOT, "instructions")
LOG_DIR = os.path.join(PROJECT_ROOT, "log")
RESPONSE_LOG_DIR = os.path.join(LOG_DIR, "response")

# --- Gemini client ---
client = genai.Client()

# --- Typer app ---
app = typer.Typer(help="Process JSON files with AI based on mode: tag, answer, solution, or solution:meaning.")

# --- Rate Limit Configuration ---
RATE_LIMIT_RPM = 10
DELAY_SECONDS = 60.0 / RATE_LIMIT_RPM  # 6 seconds per request

# --- Exponential Backoff Configuration ---
MAX_RETRIES = 3
INITIAL_BACKOFF_SECONDS = 2
BACKOFF_JITTER = 1

# --- Helpers ---
def read_file_content(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read() or ""

def remove_markdown_json_block(text: str | None) -> str:
    if text is None:
        return ""
    pattern = r"```json\s*(.*?)```"
    match = re.search(pattern, text, flags=re.DOTALL)
    if match:
        return match.group(1).strip()
    return text.strip()

def build_prompt(mode: str, instruction_file: str, input_file: str, tags_file: str | None = None) -> str:
    prompt_sections = []
    prompt_sections.append(f"path:{os.path.basename(instruction_file)}\n<file_content>\n{read_file_content(instruction_file)}\n</file_content>")
    if mode == "tag" and tags_file:
        prompt_sections.append(f"path:{os.path.basename(tags_file)}\n<file_content>\n{read_file_content(tags_file)}\n</file_content>")
    prompt_sections.append(f"path:{os.path.basename(input_file)}\n<file_content>\n{read_file_content(input_file)}\n</file_content>")
    return "\n\n".join(prompt_sections)

# --- Helper: filter out malformed objects ---
def filter_valid_objects(raw_json_str: str) -> list:
    """
    Takes the AI JSON array as string.
    Returns a list of valid objects, skipping those that are malformed JSON.
    
    *Update: Simplified the skipping object error message.*
    """
    raw_json_str = raw_json_str.strip()
    if not raw_json_str.startswith("[") or not raw_json_str.endswith("]"):
        return []

    inner = raw_json_str[1:-1].strip()
    objects = []
    brace_count = 0
    start_idx = 0
    valid_objects = []

    # Split objects safely using brace counting
    for i, char in enumerate(inner):
        if char == '{':
            if brace_count == 0:
                start_idx = i
            brace_count += 1
        elif char == '}':
            brace_count -= 1
            if brace_count == 0:
                obj_str = inner[start_idx:i+1].strip()
                # A hacky way to handle comma/newline between objects if the model outputs them
                if obj_str.startswith(','):
                    obj_str = obj_str[1:].lstrip()
                objects.append(obj_str)

    # Validate each object
    for idx, obj_str in enumerate(objects):
        try:
            obj = json.loads(obj_str)
            valid_objects.append(obj)
        except json.JSONDecodeError:
            # Simplified error message as requested
            print(f"    - Skipping object at index {idx} due to malformed JSON")
            continue

    return valid_objects

# --- Main processing ---
def process_file(mode: str, instruction_file: str, input_file: str, output_file: str, tags_file: str | None = None):
    # 'mode' here is the core mode (tag, answer, solution) used for logic like tags check
    prompt_text = build_prompt(mode, instruction_file, input_file, tags_file)
    response = None

    # --- Exponential backoff ---
    for attempt in range(MAX_RETRIES):
        try:
            typer.echo(f"    - Attempt {attempt + 1}/{MAX_RETRIES}...")
            response = client.models.generate_content(
                model="gemini-flash-latest",
                contents=prompt_text,
            )
            typer.echo("    - API call successful.")
            # Note: The 'Warning: there are non-text parts...' is a known library warning 
            # when the model includes internal metadata (like 'thought_signature') 
            # in its response, which is not easily suppressible without 
            # using a warning filter or a lower-level API. response.text 
            # correctly aggregates the text parts.
            break
        except APIError as e:
            if attempt < MAX_RETRIES - 1:
                backoff_time = (INITIAL_BACKOFF_SECONDS * (2 ** attempt)) + random.uniform(0, BACKOFF_JITTER)
                typer.echo(f"    - API Error ({e}). Retrying in {backoff_time:.2f}s...")
                time.sleep(backoff_time)
            else:
                typer.echo(f"    - Final attempt failed with API Error ({e}). Skipping this file.")
                response = None
                break
        except Exception as e:
            typer.echo(f"    - Unexpected Error: {e}. Skipping this file.")
            response = None
            break

    if response is None:
        os.makedirs(os.path.dirname(output_file), exist_ok=True)
        with open(output_file, "w", encoding="utf-8") as f:
            # Using ensure_ascii=False for error object too for consistency
            json.dump({"error": f"Failed after {MAX_RETRIES} attempts"}, f, indent=2, ensure_ascii=False)
        return

    ai_response = response.text

    if not ai_response:
        typer.echo("    - AI returned no content. Skipping.")
        try:
            os.makedirs(RESPONSE_LOG_DIR, exist_ok=True)
            log_file_path = os.path.join(RESPONSE_LOG_DIR, os.path.basename(output_file).replace(".json", ".log"))
            with open(log_file_path, "w", encoding="utf-8") as f:
                f.write("[MODEL RETURNED NO TEXT CONTENT - SKIPPING JSON PROCESSING]")
        except Exception as e:
            typer.echo(f"    - Failed to log no-content: {e}")
        return

    # --- Save raw AI response ---
    try:
        os.makedirs(RESPONSE_LOG_DIR, exist_ok=True)
        log_file_path = os.path.join(RESPONSE_LOG_DIR, os.path.basename(output_file).replace(".json", ".log"))
        with open(log_file_path, "w", encoding="utf-8") as f:
            f.write(ai_response)
        typer.echo(f"    - Raw AI response logged at {log_file_path}")
    except Exception as e:
        typer.echo(f"    - Failed to log raw response: {e}")

    # --- Clean and filter valid objects ---
    clean_response = remove_markdown_json_block(ai_response)
    valid_objects = filter_valid_objects(clean_response)

    if not valid_objects:
        typer.echo("    - No valid objects after filtering. Skipping output file.")
        return

    # --- Write final JSON ---
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        # FIX: Added ensure_ascii=False to prevent non-ASCII characters 
        # (like Bengali) from being written as Unicode escape sequences (\uXXXX).
        json.dump(valid_objects, f, indent=2, ensure_ascii=False)
    typer.echo(f"    - Successfully wrote {len(valid_objects)} valid objects to {output_file}")

# --- CLI ---
@app.command()
def main(mode: str = typer.Option(..., "--mode", "-m", help="Mode: tag, answer, solution, or solution:meaning (uses different instructions).")):
    mode = mode.lower()
    
    valid_modes = {"tag", "answer", "solution", "solution:meaning"}
    if mode not in valid_modes:
        typer.echo(f"Invalid mode! Must be one of: {', '.join(valid_modes)}", err=True)
        raise typer.Exit(code=1)

    # 1. Determine the instruction file to use based on the input 'mode'
    instruction_file_map = {
        "tag": os.path.join(INSTRUCTIONS_DIR, "update_tag_instruction.md"),
        "answer": os.path.join(INSTRUCTIONS_DIR, "update_answer_instruction.md"),
        "solution": os.path.join(INSTRUCTIONS_DIR, "update_solution_instruction.md"),
        "solution:meaning": os.path.join(INSTRUCTIONS_DIR, "update_meaning_in_solution_instruction.md"), # New file
    }
    instruction_file = instruction_file_map[mode]

    # 2. Determine the core processing mode 
    # (used for logic like tags_file check and build_prompt's tag check)
    processing_mode = "solution" if mode == "solution:meaning" else mode
    
    if not os.path.exists(instruction_file):
        typer.echo(f"Instruction file not found: {instruction_file}", err=True)
        raise typer.Exit(code=1)

    tags_file = None
    if processing_mode == "tag":
        tags_file = os.path.join(INSTRUCTIONS_DIR, "tags.json")
        if not os.path.exists(tags_file):
            typer.echo(f"Tags file not found: {tags_file}", err=True)
            raise typer.Exit(code=1)

    if not os.path.exists(INPUT_DIR):
        typer.echo(f"Input directory not found: {INPUT_DIR}", err=True)
        raise typer.Exit(code=1)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(RESPONSE_LOG_DIR, exist_ok=True)

    json_files = [f for f in os.listdir(INPUT_DIR) if f.endswith(".json")]

    for i, filename in enumerate(json_files):
        input_file_path = os.path.join(INPUT_DIR, filename)

        # Output filename logic
        if filename == "input.json":
            output_filename = "output.json"
        elif filename.startswith("input-") and filename.endswith(".json"):
            suffix = filename[len("input-"):-len(".json")]
            output_filename = f"output-{suffix}.json"
        else:
            output_filename = f"output-{filename}"

        output_file_path = os.path.join(OUTPUT_DIR, output_filename)
        typer.echo(f"\n[{i+1}/{len(json_files)}] Processing {filename} -> {output_filename}")

        # Pass the core processing_mode and the specific instruction_file path
        process_file(processing_mode, instruction_file, input_file_path, output_file_path, tags_file)

        if i < len(json_files) - 1:
            typer.echo(f"  > Waiting {DELAY_SECONDS:.1f}s to respect {RATE_LIMIT_RPM} RPM rate limit...")
            time.sleep(DELAY_SECONDS)

    typer.echo("\nAll files processed successfully.")

if __name__ == "__main__":
    app()