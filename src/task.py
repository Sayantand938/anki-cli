import os
import shutil
import sqlite3
import tempfile
from datetime import datetime, timedelta, date
from typing import Optional, List, Dict
import typer
from typing_extensions import Annotated
from rich.console import Console
from rich.table import Table
from rich import box
from rich.panel import Panel
from collections import defaultdict
from contextlib import contextmanager

# --- CONFIGURATION ---
START_DATE = "2026-01-01" 

# Quotas
QUOTAS = {
    "MATH": {"NEW": 30,  "DUE": 60},
    "GI":   {"NEW": 30,  "DUE": 60},
    "ENG":  {"NEW": 45,  "DUE": 90},
    "GK":   {"NEW": 100, "DUE": 200},
}

SUBJECTS_LIST = list(QUOTAS.keys()) 
DEFAULT_DB_PATH = r"C:\Users\sayantan\AppData\Roaming\Anki2\NOTES\collection.anki2"
LOCAL_DB_NAME = "study_spillover.db"
# ---------------------

app = typer.Typer()
console = Console()

# --- HELPER: Context Manager for Silent/Verbose Mode ---
@contextmanager
def status_handler(msg: str, silent: bool):
    """Shows a spinner if not silent, otherwise just runs code."""
    if silent:
        yield
    else:
        with console.status(f"[bold green]{msg}[/bold green]", spinner="dots"):
            yield

def get_subject_from_tags(tag_str: str) -> str:
    """Extracts subject from tag string based on SUBJECTS_LIST."""
    if not tag_str:
        return "-"
    tags = [t for t in tag_str.split(" ") if t]
    for tag in tags:
        for subject in SUBJECTS_LIST:
            if tag == subject or tag.startswith(f"{subject}::"):
                return subject
    return "-"

def get_local_db():
    """Connects to the local reporting database."""
    conn = sqlite3.connect(LOCAL_DB_NAME)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS spillover_log (
            date TEXT,
            subject TEXT,
            card_type TEXT,
            quota INTEGER,
            actual_studied INTEGER,
            incoming_carry INTEGER,
            received_backfill INTEGER,
            final_stored INTEGER,
            outgoing_carry INTEGER,
            PRIMARY KEY (date, subject, card_type)
        )
    """)
    conn.commit()
    return conn

class DayStat:
    def __init__(self, date_str, subject, c_type, quota, actual):
        self.date_str = date_str
        self.subject = subject
        self.c_type = c_type
        self.quota = quota
        self.actual = actual
        self.stored = min(actual, quota)
        self.excess = max(0, actual - quota)
        self.received_backfill = 0
        self.incoming_carry = 0
        self.outgoing_carry = 0

def run_update_logic(db_path: str, silent: bool = False):
    """
    Core logic to sync Anki data to local DB.
    Can be run visually (silent=False) or in background (silent=True).
    """
    if not os.path.exists(db_path):
        console.print(f"[bold red]Error:[/bold red] Database not found at: [yellow]{db_path}[/yellow]")
        raise typer.Exit(1)

    start_dt = datetime.strptime(START_DATE, "%Y-%m-%d").date()
    today_dt = date.today()
    
    date_objs = []
    curr = start_dt
    while curr <= today_dt:
        date_objs.append(curr)
        curr += timedelta(days=1)
    
    date_strs = [d.strftime("%Y-%m-%d") for d in date_objs]
    raw_data = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))

    # --- STEP 1: FETCH RAW DATA FROM ANKI ---
    temp_dir = tempfile.mkdtemp()
    temp_db = os.path.join(temp_dir, "collection.anki2")
    
    try:
        with status_handler("Reading Anki history...", silent):
            shutil.copy2(db_path, temp_db)
            anki_conn = sqlite3.connect(temp_db)
            cursor = anki_conn.cursor()

            range_start_ts = int(datetime.combine(start_dt, datetime.min.time()).timestamp() * 1000)
            range_end_ts = int(datetime.combine(today_dt + timedelta(days=1), datetime.min.time()).timestamp() * 1000)

            query = """
                SELECT n.tags, r_range.id, MIN(r_all.id)
                FROM revlog r_range
                JOIN cards c ON r_range.cid = c.id
                JOIN notes n ON c.nid = n.id
                JOIN revlog r_all ON c.id = r_all.cid
                WHERE r_range.id >= ? AND r_range.id < ?
                GROUP BY c.id, r_range.id 
            """
            
            cursor.execute(query, (range_start_ts, range_end_ts))
            rows = cursor.fetchall()
            
            for row in rows:
                tags_str, rev_ts, first_rev_ts = row
                subj = get_subject_from_tags(tags_str)
                if subj in QUOTAS:
                    rev_date = datetime.fromtimestamp(rev_ts / 1000.0).date()
                    rev_date_str = rev_date.strftime("%Y-%m-%d")
                    day_start_ts = int(datetime.combine(rev_date, datetime.min.time()).timestamp() * 1000)
                    c_type = "NEW" if first_rev_ts >= day_start_ts else "DUE"
                    raw_data[rev_date_str][subj][c_type] += 1
            
            anki_conn.close()

        # --- STEP 2: CALCULATE LOGIC (3 PHASES) ---
        grid = defaultdict(lambda: defaultdict(list))

        for d_str in date_strs:
            for subj in SUBJECTS_LIST:
                for c_type in ["NEW", "DUE"]:
                    q = QUOTAS[subj][c_type]
                    act = raw_data[d_str][subj][c_type]
                    grid[subj][c_type].append(DayStat(d_str, subj, c_type, q, act))

        with status_handler("Calculating Spillover...", silent):
            for subj in SUBJECTS_LIST:
                for c_type in ["NEW", "DUE"]:
                    days = grid[subj][c_type]
                    num_days = len(days)

                    # Phase A: Backward Fill
                    for i in range(num_days):
                        current = days[i]
                        if current.excess > 0:
                            for j in range(i - 1, -1, -1):
                                prev = days[j]
                                deficit = prev.quota - prev.stored - prev.received_backfill
                                if deficit > 0:
                                    transfer = min(current.excess, deficit)
                                    prev.received_backfill += transfer
                                    current.excess -= transfer
                                    if current.excess == 0:
                                        break
                    
                    # Phase B: Forward Carry
                    for i in range(num_days):
                        current = days[i]
                        deficit = current.quota - current.stored - current.received_backfill
                        used_carry = 0
                        if current.incoming_carry > 0 and deficit > 0:
                            used_carry = min(current.incoming_carry, deficit)
                            current.stored += used_carry 
                        
                        unused_carry = current.incoming_carry - used_carry
                        total_outgoing = current.excess + unused_carry
                        current.outgoing_carry = total_outgoing
                        
                        if i < num_days - 1:
                            days[i+1].incoming_carry = total_outgoing

        # --- STEP 3: WRITE TO DB ---
        local_conn = get_local_db()
        local_cursor = local_conn.cursor()

        for subj in SUBJECTS_LIST:
            for c_type in ["NEW", "DUE"]:
                for day_stat in grid[subj][c_type]:
                    final_stored_calc = min(
                        day_stat.quota, 
                        day_stat.actual + day_stat.received_backfill + day_stat.incoming_carry
                    )

                    local_cursor.execute("""
                        INSERT OR REPLACE INTO spillover_log 
                        (date, subject, card_type, quota, actual_studied, incoming_carry, received_backfill, final_stored, outgoing_carry)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        day_stat.date_str, day_stat.subject, day_stat.c_type, day_stat.quota, 
                        day_stat.actual, day_stat.incoming_carry, day_stat.received_backfill,
                        final_stored_calc, day_stat.outgoing_carry
                    ))
        
        local_conn.commit()
        local_conn.close()
        
        if not silent:
            console.print(Panel(f"Updated stats.\nRange: [yellow]{START_DATE}[/yellow] to [yellow]{today_dt}[/yellow].", border_style="green", title="Update Complete"))

    except Exception as e:
        console.print_exception(show_locals=False)
    finally:
        if os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
            except:
                pass

@app.command()
def update(
    db_path: Annotated[str, typer.Option("--path", help="Path to collection.anki2")] = DEFAULT_DB_PATH
):
    """
    1. Reads Anki history.
    2. Calculates logic: Self-Fill -> Backward-Fill -> Forward-Carry.
    3. Updates database.
    """
    run_update_logic(db_path, silent=False)

@app.command(name="show-daily") 
def show_daily(
    date_arg: Annotated[Optional[str], typer.Argument(help="YYYY-MM-DD. Defaults to today.")] = None
):
    """
    Shows daily report in Bill format.
    """
    run_update_logic(DEFAULT_DB_PATH, silent=True)

    if date_arg is None:
        date_str = date.today().strftime("%Y-%m-%d")
    else:
        date_str = date_arg

    local_conn = get_local_db()
    cursor = local_conn.cursor()
    cursor.execute("""
        SELECT subject, card_type, quota, actual_studied, incoming_carry, received_backfill, final_stored, outgoing_carry
        FROM spillover_log WHERE date = ?
    """, (date_str,))
    rows = cursor.fetchall()
    local_conn.close()

    if not rows:
        console.print(Panel(f"No data for [bold]{date_str}[/bold].\nRun [yellow]update[/yellow] first or check the date format.", border_style="red"))
        return

    console.print(f"\n[bold underline]DAILY BILL: {date_str}[/bold underline]\n")
    
    # Header Style: Cyan, Subject Column: White
    table = Table(box=box.DOUBLE_EDGE, header_style="bold cyan")
    table.add_column("Subject", style="white")
    table.add_column("Type", justify="center")
    table.add_column("Billed (Quota)", justify="center")
    table.add_column("Paid (Actual)", justify="center") 
    table.add_column("Status", justify="center") 
    table.add_column("Carry Fwd", justify="center", style="bold yellow") 

    data = sorted([
        {"subj": r[0], "type": r[1], "quota": r[2], "actual": r[3], "in": r[4], "back": r[5], "stored": r[6], "out": r[7]}
        for r in rows
    ], key=lambda x: (x['subj'], 0 if x['type'] == 'NEW' else 1))

    for row in data:
        # Calculate Balance (Stored - Quota)
        balance = row['stored'] - row['quota']
        
        if balance >= 0:
            status = "[bold green]PAID[/bold green]"
        else:
            status = f"[bold red]{balance} (DEBT)[/bold red]"

        spill = f"+{row['out']}" if row['out'] > 0 else "-"
        type_d = f"[bold]{row['type']}[/bold]" if row['type'] == "NEW" else "[dim]DUE[/dim]"

        table.add_row(row['subj'], type_d, str(row['quota']), str(row['actual']), status, spill)
        if row['type'] == "DUE": table.add_section()

    console.print(table)

@app.command(name="show-weekly")
def show_weekly():
    """
    Shows 7-day summary (Account Statement).
    """
    run_update_logic(DEFAULT_DB_PATH, silent=True)

    end_date = date.today()
    start_date = end_date - timedelta(days=6)
    
    local_conn = get_local_db()
    cursor = local_conn.cursor()
    cursor.execute("""
        SELECT subject, card_type, SUM(quota), SUM(actual_studied), SUM(final_stored)
        FROM spillover_log WHERE date >= ? AND date <= ?
        GROUP BY subject, card_type
    """, (start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d")))
    rows = cursor.fetchall()
    local_conn.close()

    console.print(f"\n[bold underline]WEEKLY STATEMENT ({start_date} to {end_date})[/bold underline]\n")
    
    # Header Style: Cyan, Subject Column: White
    table = Table(box=box.DOUBLE_EDGE, header_style="bold cyan")
    table.add_column("Subject", style="white")
    table.add_column("Type")
    table.add_column("Billed (Quota)")
    table.add_column("Paid (Total)")
    table.add_column("Balance")

    for r in sorted(rows, key=lambda x: (x[0], 0 if x[1] == 'NEW' else 1)):
        subj, c_type, tot_quota, tot_actual, tot_stored = r
        balance = tot_stored - tot_quota
        
        if balance >= 0:
            perf = "[bold green]PAID[/bold green]"
        else:
            perf = f"[bold red]{balance} (DEBT)[/bold red]"
            
        table.add_row(subj, c_type, str(tot_quota), str(tot_actual), perf)
        if c_type == "DUE": table.add_section()
            
    console.print(table)

@app.command(name="show-monthly")
def show_monthly():
    """
    Shows current month summary (Account Statement).
    """
    run_update_logic(DEFAULT_DB_PATH, silent=True)

    today = date.today()
    start_date = today.replace(day=1)
    
    local_conn = get_local_db()
    cursor = local_conn.cursor()
    
    cursor.execute("""
        SELECT subject, card_type, SUM(quota), SUM(actual_studied), SUM(final_stored)
        FROM spillover_log
        WHERE date >= ? AND date <= ?
        GROUP BY subject, card_type
    """, (start_date.strftime("%Y-%m-%d"), today.strftime("%Y-%m-%d")))
    
    rows = cursor.fetchall()
    local_conn.close()

    console.print(f"\n[bold underline]MONTHLY STATEMENT ({start_date.strftime('%b %d')} - {today.strftime('%b %d')})[/bold underline]\n")
    
    # Header Style: Cyan, Subject Column: White
    table = Table(box=box.DOUBLE_EDGE, header_style="bold cyan")
    table.add_column("Subject", style="white")
    table.add_column("Type")
    table.add_column("Billed (Quota)")
    table.add_column("Paid (Total)")
    table.add_column("Balance")

    data = sorted(rows, key=lambda x: (x[0], 0 if x[1] == 'NEW' else 1))

    for r in data:
        subj, c_type, tot_quota, tot_actual, tot_stored = r
        balance = tot_stored - tot_quota
        
        if balance >= 0:
            perf = "[bold green]PAID[/bold green]"
        else:
            perf = f"[bold red]{balance} (DEBT)[/bold red]"
            
        table.add_row(subj, c_type, str(tot_quota), str(tot_actual), perf)
        if c_type == "DUE":
            table.add_section()
            
    console.print(table)

if __name__ == "__main__":
    app()