import requests
import typer
from pathlib import Path
from typing import Optional, List, Any
from rich.console import Console

# --- Configuration ---
ANKI_CONNECT_URL = "http://127.0.0.1:8765"
# Define the output path relative to where the script is run (project root)
OUTPUT_FILE = Path("data/list-of-noteid.txt")

# --- Setup ---
app = typer.Typer(help="Fetch Note IDs from an Anki deck and save them to a file.")
console = Console()

def anki_request(action: str, params: Optional[dict] = None) -> Any:
    """
    Sends a request to AnkiConnect.
    """
    if params is None:
        params = {}
    
    try:
        response = requests.post(
            ANKI_CONNECT_URL, 
            json={"action": action, "version": 6, "params": params}
        )
        response.raise_for_status()
        result = response.json()
        
        if result.get("error"):
            raise Exception(result["error"])
            
        return result.get("result")
    except Exception as e:
        console.print(f"[bold red]Error communicating with AnkiConnect:[/bold red] {e}")
        raise typer.Exit(code=1)

@app.command()
def main(
    deck: str = typer.Option(
        ..., 
        "--deck", "-d", 
        help="The exact name of the Anki deck to fetch Note IDs from."
    ),
    reverse: bool = typer.Option(
        False, 
        "--reverse", "-r", 
        help="Reverse the sort order (Newest first). Default is Oldest first."
    )
):
    """
    Retrieves all Note IDs from the specified deck, sorts them chronologically,
    and saves them to data/list-of-noteid.txt.
    """
    query = f'deck:"{deck}"'
    
    console.print(f"[magenta]Fetching Note IDs for deck: [bold]{deck}[/bold]...[/magenta]", style="dim")
    
    # 1. Fetch IDs using findNotes
    note_ids = anki_request("findNotes", {"query": query})
    
    if not note_ids:
        console.print(f"[yellow]No notes found in deck '{deck}'.[/yellow]")
        return

    # 2. Sort IDs 
    # Anki Note IDs are timestamps. Sorting them ensures creation order.
    note_ids.sort(reverse=reverse)
    count = len(note_ids)

    # 3. Create directory if it doesn't exist
    try:
        OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        console.print(f"[bold red]Failed to create directory {OUTPUT_FILE.parent}: {e}[/bold red]")
        raise typer.Exit(code=1)

    # 4. Save to file
    try:
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            for nid in note_ids:
                f.write(f"{nid}\n")
        
        console.print(f"[bold green]Success![/bold green] Saved {count} Note IDs to:")
        console.print(f"[blue]{OUTPUT_FILE.absolute()}[/blue]")
        
    except Exception as e:
        console.print(f"[bold red]Failed to write to file: {e}[/bold red]")
        raise typer.Exit(code=1)

if __name__ == "__main__":
    app()