# import json
# import sqlite3
# import shutil
# import os
# import tempfile
# import calendar
# from datetime import datetime, timedelta
# from typing import List, Optional, Dict

# import typer
# from rich.console import Console
# from rich.table import Table
# from rich.progress import Progress, SpinnerColumn, TextColumn

# # --- CONFIGURATION ---
# # Updated to point to your new directory
# CONFIG_DIR = r"D:\Coding\anki-cli\configs"
# CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")
# LEAVES_FILE = os.path.join(CONFIG_DIR, "leaves.json")

# app = typer.Typer(help="Anki Study Bank: Strict Monthly Passbook.")
# console = Console()

# def get_subject(tag_string: str, subjects_list: List[str]) -> Optional[str]:
#     """Determines subject based on tag prefix (e.g., MATH::)."""
#     tags = tag_string.upper()
#     for s in subjects_list:
#         if f" {s}::" in tags or tags.startswith(f"{s}::"):
#             return s
#     return None

# def load_json(file_path: str) -> Dict:
#     """Safely loads a JSON file."""
#     if not os.path.exists(file_path):
#         # Optional: helpful error message for debugging
#         # print(f"Warning: File not found at {file_path}")
#         return {}
#     with open(file_path, 'r') as f:
#         return json.load(f)

# def get_anki_reviews(config: Dict, month_start: datetime, month_end: datetime):
#     """Fetches and processes review logs for a specific month."""
#     anki_path = config['anki_path']
    
#     # 1. Copy Anki DB to temp
#     temp_db = os.path.join(tempfile.gettempdir(), "anki_temp_bank.anki2")
#     shutil.copy2(anki_path, temp_db)

#     conn = sqlite3.connect(temp_db)
#     cur = conn.cursor()

#     # 2. Identify "New" status (First review ever for each card)
#     cur.execute("SELECT cid, MIN(id) FROM revlog GROUP BY cid")
#     first_rev_map = {row[0]: datetime.fromtimestamp(row[1]/1000).strftime('%Y-%m-%d') 
#                         for row in cur.fetchall()}

#     # 3. Fetch reviews strictly within the month
#     start_ts = int(month_start.timestamp() * 1000)
#     end_ts = int(month_end.timestamp() * 1000)
    
#     query = """
#         SELECT rl.id, rl.cid, n.tags 
#         FROM revlog rl
#         JOIN cards c ON rl.cid = c.id
#         JOIN notes n ON c.nid = n.id
#         WHERE rl.id >= ? AND rl.id <= ?
#     """
#     cur.execute(query, (start_ts, end_ts))
#     reviews = cur.fetchall()
#     conn.close()

#     # 4. Process into totals
#     subjects = list(config['quotas'].keys())
#     stats = {s: {'NEW': set(), 'DUE': 0} for s in subjects}

#     for rev_id, cid, tags in reviews:
#         date_str = datetime.fromtimestamp(rev_id/1000).strftime('%Y-%m-%d')
#         sub = get_subject(tags, subjects)
#         if not sub: continue

#         if date_str == first_rev_map.get(cid):
#             stats[sub]['NEW'].add(cid)
#         else:
#             stats[sub]['DUE'] += 1

#     return {s: {'NEW': len(v['NEW']), 'DUE': v['DUE']} for s, v in stats.items()}

# @app.command()
# def leaves():
#     """Shows the leave schedule from leaves.json."""
#     leave_data = load_json(LEAVES_FILE)
#     if not leave_data:
#         console.print(f"[yellow]No leaves found at {LEAVES_FILE}.[/yellow]")
#         return

#     table = Table(title="📅 LEAVE SCHEDULE", header_style="bold magenta")
#     table.add_column("SL", justify="center")
#     table.add_column("Date", style="cyan")
#     table.add_column("Reason")

#     for i, (date, reason) in enumerate(sorted(leave_data.items()), 1):
#         table.add_row(str(i), date, reason)

#     console.print(table)

# @app.command()
# def statement(month_name: Optional[str] = typer.Argument(None, help="Optional: Month name (e.g. Jan)")):
#     """
#     Shows study balance for the month. Resets every month.
#     """
#     config = load_json(CONFIG_FILE)
#     leaves_map = load_json(LEAVES_FILE)
#     if not config:
#         console.print(f"[red]Error: {CONFIG_FILE} missing![/red]")
#         return

#     # 1. Determine Month Range
#     today = datetime.now()
#     if month_name:
#         try:
#             # Convert name (Jan) to index
#             m_idx = list(calendar.month_abbr).index(month_name.capitalize()[:3])
#             target_date = today.replace(month=m_idx, day=1)
#         except (ValueError, IndexError):
#             console.print(f"[red]Invalid month name: {month_name}[/red]")
#             return
#     else:
#         target_date = today.replace(day=1)

#     month_start = target_date.replace(day=1, hour=0, minute=0, second=0)
#     month_end = target_date.replace(day=calendar.monthrange(target_date.year, target_date.month)[1], 
#                                     hour=23, minute=59, second=59)
    
#     if month_start > today:
#         console.print("[yellow]Cannot generate statement for future months.[/yellow]")
#         return

#     # 2. Fetch Data
#     with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), transient=True) as progress:
#         progress.add_task(description=f"Fetching {target_date.strftime('%B %Y')} data...", total=None)
#         repaid_data = get_anki_reviews(config, month_start, month_end)

#     # 3. Billing Logic
#     active_billing_days = 0
#     total_days_passed = 0
#     curr = month_start
#     limit_date = min(today, month_end) # Don't bill for days that haven't happened yet
    
#     while curr.date() <= limit_date.date():
#         total_days_passed += 1
#         if curr.strftime("%Y-%m-%d") not in leaves_map:
#             active_billing_days += 1
#         curr += timedelta(days=1)

#     # 4. Build Table
#     display_month = target_date.strftime('%B %Y').upper()
#     title = f"🏦 STUDY BANK STATEMENT FOR {display_month} ({active_billing_days} out of {total_days_passed} days billed)"
    
#     table = Table(title=title, header_style="bold cyan", show_footer=True)
#     table.add_column("Subject", style="bold", footer="[bold]MONTHLY TOTAL")
#     table.add_column("Type", justify="center")
#     table.add_column("Billed", justify="right")
#     table.add_column("Repaid", justify="right")
#     table.add_column("Balance", justify="right")
#     table.add_column("Status", justify="center")

#     grand_total_bal = 0
#     subjects = list(config['quotas'].keys())

#     for s in subjects:
#         for qt in ['NEW', 'DUE']:
#             billed = config['quotas'][s][qt] * active_billing_days
#             repaid = repaid_data[s][qt]
#             balance = repaid - billed
#             grand_total_bal += balance

#             color = "green" if balance >= 0 else "red"
#             status = "[bold green]PAID[/]" if balance >= 0 else "[bold red]DEBT[/]"
            
#             table.add_row(
#                 s if qt == 'NEW' else "",
#                 qt,
#                 str(billed),
#                 str(repaid),
#                 f"[{color}]{balance:+} [/{color}]",
#                 status
#             )
#         table.add_section()

#     # Footer
#     final_color = "bold green" if grand_total_bal >= 0 else "bold red"
#     table.columns[4].footer = f"[{final_color}]{grand_total_bal:+}[/]"
#     table.columns[5].footer = "[bold green]PAID[/bold green]" if grand_total_bal >= 0 else "[bold red]IN DEBT[/bold red]"

#     console.print("\n", table)
#     console.print(f"[dim italic] Note: Monthly reset. Overwork in {target_date.strftime('%B')} stays in this month's history.[/dim italic]\n")

# if __name__ == "__main__":
#     app()




import json
import sqlite3
import shutil
import os
import tempfile
import calendar
from datetime import datetime, timedelta
from typing import List, Optional, Dict

import typer
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn

# --- CONFIGURATION ---
CONFIG_DIR = r"D:\Coding\anki-cli\configs"
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")
LEAVES_FILE = os.path.join(CONFIG_DIR, "leaves.json")

app = typer.Typer(help="Anki Study Bank: Strict Monthly Passbook with Birthday Logic.")
console = Console()

def get_subject(tag_string: str, subjects_list: List[str]) -> Optional[str]:
    """Determines subject based on tag prefix (e.g., MATH::)."""
    tags = tag_string.upper()
    for s in subjects_list:
        if f" {s}::" in tags or tags.startswith(f"{s}::"):
            return s
    return None

def load_json(file_path: str) -> Dict:
    """Safely loads a JSON file."""
    if not os.path.exists(file_path):
        return {}
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}

def get_anki_reviews(config: Dict, month_start: datetime, month_end: datetime):
    """
    Fetches and processes review logs for a specific month using 'Birthday Logic'.
    """
    anki_path = config['anki_path']
    if not os.path.exists(anki_path):
        console.print(f"[red]Error: Anki database not found at {anki_path}[/red]")
        return None
        
    # 1. Copy Anki DB to temp to avoid locking issues while Anki is open
    temp_db = os.path.join(tempfile.gettempdir(), "anki_temp_bank.anki2")
    shutil.copy2(anki_path, temp_db)

    conn = sqlite3.connect(temp_db)
    cur = conn.cursor()

    # 2. Map every card to its GLOBAL First Review Date and its Best Ease ever achieved
    # This allows us to determine if a card was 'born' today and if it's a valid card.
    cur.execute("""
        SELECT cid, 
               MIN(id), 
               MAX(ease) 
        FROM revlog 
        GROUP BY cid
    """)
    card_metadata = {}
    for cid, first_id, max_ease in cur.fetchall():
        card_metadata[cid] = {
            'first_date': datetime.fromtimestamp(first_id/1000).strftime('%Y-%m-%d'),
            'ever_passed': max_ease > 1
        }

    # 3. Fetch all reviews for the target month
    start_ts = int(month_start.timestamp() * 1000)
    end_ts = int(month_end.timestamp() * 1000)
    
    query = """
        SELECT rl.id, rl.cid, rl.ease, n.tags 
        FROM revlog rl
        JOIN cards c ON rl.cid = c.id
        JOIN notes n ON c.nid = n.id
        WHERE rl.id >= ? AND rl.id <= ?
    """
    cur.execute(query, (start_ts, end_ts))
    all_reviews = cur.fetchall()
    conn.close()

    subjects = list(config['quotas'].keys())
    # daily_stats is used to correctly bucket NEW and DUE
    daily_stats = {}

    for rev_id, cid, ease, tags in all_reviews:
        rev_date = datetime.fromtimestamp(rev_id/1000).strftime('%Y-%m-%d')
        sub = get_subject(tags, subjects)
        if not sub: continue

        # Logic: If the card was NEVER passed in its entire history, ignore it
        meta = card_metadata.get(cid)
        if not meta or not meta['ever_passed']:
            continue

        if rev_date not in daily_stats:
            daily_stats[rev_date] = {s: {'NEW': set(), 'DUE': 0} for s in subjects}

        # Logic: Check if today is the Birthday
        if rev_date == meta['first_date']:
            # Birthday Repayment: Counts as NEW regardless of ease (as long as it was eventually passed)
            daily_stats[rev_date][sub]['NEW'].add(cid)
        else:
            # Maintenance Repayment: Only counts as DUE if ease > 1
            if ease > 1:
                daily_stats[rev_date][sub]['DUE'] += 1

    # 4. Aggregate Daily stats into Monthly totals
    monthly_totals = {s: {'NEW': 0, 'DUE': 0} for s in subjects}
    for date_str, subs in daily_stats.items():
        for s, counts in subs.items():
            monthly_totals[s]['NEW'] += len(counts['NEW'])
            monthly_totals[s]['DUE'] += counts['DUE']

    return monthly_totals

@app.command()
def leaves():
    """Shows the leave schedule from leaves.json."""
    leave_data = load_json(LEAVES_FILE)
    if not leave_data:
        console.print(f"[yellow]No leaves found at {LEAVES_FILE}.[/yellow]")
        return

    table = Table(title="📅 LEAVE SCHEDULE", header_style="bold magenta")
    table.add_column("SL", justify="center")
    table.add_column("Date", style="cyan")
    table.add_column("Reason")

    for i, (date, reason) in enumerate(sorted(leave_data.items()), 1):
        table.add_row(str(i), date, reason)

    console.print(table)

@app.command()
def statement(month_name: Optional[str] = typer.Argument(None, help="Optional: Month name (e.g. Jan)")):
    """
    Shows study balance for the month with Birthday Logic.
    """
    config = load_json(CONFIG_FILE)
    leaves_map = load_json(LEAVES_FILE)
    if not config:
        console.print(f"[red]Error: {CONFIG_FILE} missing![/red]")
        return

    # 1. Determine Month Range
    today = datetime.now()
    if month_name:
        try:
            m_idx = list(calendar.month_abbr).index(month_name.capitalize()[:3])
            target_date = today.replace(month=m_idx, day=1)
        except (ValueError, IndexError):
            console.print(f"[red]Invalid month name: {month_name}[/red]")
            return
    else:
        target_date = today.replace(day=1)

    month_start = target_date.replace(day=1, hour=0, minute=0, second=0)
    month_end = target_date.replace(day=calendar.monthrange(target_date.year, target_date.month)[1], 
                                    hour=23, minute=59, second=59)
    
    if month_start > today:
        console.print("[yellow]Cannot generate statement for future months.[/yellow]")
        return

    # 2. Fetch and Process Data
    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), transient=True) as progress:
        progress.add_task(description=f"Analyzing {target_date.strftime('%B %Y')} reviews...", total=None)
        repaid_data = get_anki_reviews(config, month_start, month_end)
    
    if repaid_data is None: return

    # 3. Billing Logic
    active_billing_days = 0
    curr = month_start
    limit_date = min(today, month_end)
    
    while curr.date() <= limit_date.date():
        if curr.strftime("%Y-%m-%d") not in leaves_map:
            active_billing_days += 1
        curr += timedelta(days=1)

    # 4. Build Table
    display_month = target_date.strftime('%B %Y').upper()
    title = f"🏦 STUDY BANK STATEMENT: {display_month} ({active_billing_days} Days Billed)"
    
    table = Table(title=title, header_style="bold cyan", show_footer=True)
    table.add_column("Subject", style="bold", footer="[bold]MONTHLY TOTAL")
    table.add_column("Type", justify="center")
    table.add_column("Billed", justify="right")
    table.add_column("Repaid", justify="right")
    table.add_column("Balance", justify="right")
    table.add_column("Status", justify="center")

    grand_total_bal = 0
    subjects = list(config['quotas'].keys())

    for s in subjects:
        for qt in ['NEW', 'DUE']:
            billed = config['quotas'][s][qt] * active_billing_days
            repaid = repaid_data[s][qt]
            balance = repaid - billed
            grand_total_bal += balance

            color = "green" if balance >= 0 else "red"
            status = "[bold green]PAID[/]" if balance >= 0 else "[bold red]DEBT[/]"
            
            table.add_row(
                s if qt == 'NEW' else "",
                qt,
                str(billed),
                str(repaid),
                f"[{color}]{balance:+} [/{color}]",
                status
            )
        table.add_section()

    # Footer
    final_color = "bold green" if grand_total_bal >= 0 else "bold red"
    table.columns[4].footer = f"[{final_color}]{grand_total_bal:+}[/]"
    table.columns[5].footer = "[bold green]PAID[/bold green]" if grand_total_bal >= 0 else "[bold red]IN DEBT[/bold red]"

    console.print("\n", table)

if __name__ == "__main__":
    app()