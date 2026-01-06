import sqlite3
import shutil
import os
import tempfile
import typer
from datetime import datetime, timedelta
from collections import defaultdict
from rich.console import Console
from rich.table import Table
from rich import box

app = typer.Typer()
console = Console()

# --- Configuration (Shared Constants) ---
# NOTE: Update SOURCE_DB_PATH if your Anki profile path is different
SOURCE_DB_PATH = os.path.expanduser(r"~\AppData\Roaming\Anki2\NOTES\collection.anki2")
STATS_DB_PATH = "anki_stats.db" 
SCHEDULE_TABLE = 'study_schedule'
STATS_TABLE = 'daily_stats'
TARGET_SUBJECTS = ["ENG", "MATH", "GK", "GI"] 
GLOBAL_START_DATE = datetime(2025, 12, 15) # The earliest date to sync/schedule from

# --- Daily Schedule Template ---
DAILY_TEMPLATE = [
    {'TIME': '08:00 AM – 09:00 AM', 'SUBJECT': 'MATH', 'TYPE': 'NEW', 'GOAL': 10, 'DONE': 0},
    {'TIME': '09:00 AM – 10:00 AM', 'SUBJECT': 'GK', 'TYPE': 'NEW', 'GOAL': 100, 'DONE': 0},
    {'TIME': '10:00 AM – 11:00 AM', 'SUBJECT': 'GI', 'TYPE': 'NEW', 'GOAL': 15, 'DONE': 0},
    {'TIME': '11:00 AM – 12:00 PM', 'SUBJECT': 'GK', 'TYPE': 'DUE', 'GOAL': 100, 'DONE': 0},
    {'TIME': '12:00 PM – 01:00 PM', 'SUBJECT': 'MATH', 'TYPE': 'NEW', 'GOAL': 10, 'DONE': 0},
    {'TIME': '01:00 PM – 02:00 PM', 'SUBJECT': 'ENG', 'TYPE': 'NEW', 'GOAL': 45, 'DONE': 0},
    {'TIME': '02:00 PM – 03:00 PM', 'SUBJECT': 'MATH', 'TYPE': 'DUE', 'GOAL': 15, 'DONE': 0},
    {'TIME': '03:00 PM – 04:00 PM', 'SUBJECT': 'GI', 'TYPE': 'DUE', 'GOAL': 60, 'DONE': 0},
    {'TIME': '04:00 PM – 05:00 PM', 'SUBJECT': 'ENG', 'TYPE': 'DUE', 'GOAL': 45, 'DONE': 0},
    {'TIME': '05:00 PM – 06:00 PM', 'SUBJECT': 'GK', 'TYPE': 'DUE', 'GOAL': 100, 'DONE': 0},
    {'TIME': '06:00 PM – 07:00 PM', 'SUBJECT': 'MATH', 'TYPE': 'DUE', 'GOAL': 15, 'DONE': 0},
    {'TIME': '07:00 PM – 08:00 PM', 'SUBJECT': 'ENG', 'TYPE': 'DUE', 'GOAL': 45, 'DONE': 0},
    {'TIME': '08:00 PM – 09:00 PM', 'SUBJECT': 'GI', 'TYPE': 'NEW', 'GOAL': 15, 'DONE': 0},
    {'TIME': '09:00 PM – 10:00 PM', 'SUBJECT': 'MATH', 'TYPE': 'DUE', 'GOAL': 15, 'DONE': 0},
    {'TIME': '10:00 PM – 11:00 PM', 'SUBJECT': 'MATH', 'TYPE': 'DUE', 'GOAL': 15, 'DONE': 0},
    {'TIME': '11:00 PM – 11:59 PM', 'SUBJECT': 'MATH', 'TYPE': 'NEW', 'GOAL': 10, 'DONE': 0},
]


# --- Database Setup/Helper Functions ---

def init_stats_db():
    """Creates the local daily_stats table if it doesn't exist."""
    conn = sqlite3.connect(STATS_DB_PATH)
    cursor = conn.cursor()
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS {STATS_TABLE} (
            study_date TEXT,
            subject TEXT,
            new_cards INTEGER,
            due_cards INTEGER,
            total_cards INTEGER,
            PRIMARY KEY (study_date, subject)
        )
    """)
    conn.commit()
    conn.close()

def init_schedule_db():
    """Creates the local study_schedule table if it doesn't exist."""
    conn = sqlite3.connect(STATS_DB_PATH)
    cursor = conn.cursor()
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS {SCHEDULE_TABLE} (
            SL INTEGER PRIMARY KEY,
            DATE TEXT,
            TIME TEXT,
            SUBJECT TEXT,
            TYPE TEXT,
            GOAL INTEGER,
            DONE INTEGER
        );
    """)
    conn.commit()
    conn.close()

def _create_schedule_entries_for_date(cursor, date_str):
    """
    Creates schedule entries for a single day if they do not exist.
    """
    cursor.execute(f"SELECT COUNT(*) FROM {SCHEDULE_TABLE} WHERE DATE = ?", (date_str,))
    if cursor.fetchone()[0] > 0:
        return 0 

    cursor.execute(f"SELECT MAX(SL) FROM {SCHEDULE_TABLE}")
    max_sl = cursor.fetchone()[0] or 0
    current_sl = max_sl + 1
    
    data_to_insert = []

    for slot in DAILY_TEMPLATE:
        record = (
            current_sl,
            date_str,
            slot['TIME'],
            slot['SUBJECT'],
            slot['TYPE'],
            slot['GOAL'],
            slot['DONE']
        )
        data_to_insert.append(record)
        current_sl += 1

    insert_sql = f"""
    INSERT INTO {SCHEDULE_TABLE} (SL, DATE, TIME, SUBJECT, TYPE, GOAL, DONE)
    VALUES (?, ?, ?, ?, ?, ?, ?);
    """
    cursor.executemany(insert_sql, data_to_insert)
    return len(data_to_insert)

def get_subject_from_tags(tag_string):
    """Returns a TARGET_SUBJECT if found, otherwise returns "Others"."""
    if not tag_string: return "Others"
    tags_list = tag_string.strip().split()
    for tag in tags_list:
        for subject in TARGET_SUBJECTS:
            if tag == subject or tag.startswith(f"{subject}::"):
                return subject
    return "Others"

class AnkiDBContext:
    """Context manager to handle copying the Anki DB to a temp location."""
    def __init__(self, source_path):
        self.source_path = source_path
        self.temp_dir = None
        self.conn = None

    def __enter__(self):
        if not os.path.exists(self.source_path):
            console.print(f"[bold red]Error:[/bold red] File not found at {self.source_path}")
            raise typer.Exit(code=1)

        self.temp_dir = tempfile.mkdtemp()
        db_filename = os.path.basename(self.source_path)
        temp_db_path = os.path.join(self.temp_dir, db_filename)

        shutil.copy2(self.source_path, temp_db_path)
        for ext in ["-wal", "-shm"]:
            wal_source = self.source_path + ext
            # --- FIX: Changed os.alo.exists to os.path.exists ---
            if os.path.exists(wal_source): 
                shutil.copy2(wal_source, temp_db_path + ext)

        self.conn = sqlite3.connect(temp_db_path)
        return self.conn

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.conn:
            self.conn.close()
        if self.temp_dir:
            shutil.rmtree(self.temp_dir)

def fetch_daily_stats_from_cursor(cursor, target_date: datetime):
    """Runs the query on an ALREADY OPEN cursor for a specific date."""
    start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)
    
    start_ms = int(start_of_day.timestamp() * 1000)
    end_ms = int(end_of_day.timestamp() * 1000)

    query = """
        SELECT DISTINCT 
            r.cid, 
            n.tags,
            CASE 
                WHEN EXISTS (
                    SELECT 1 FROM revlog old_r 
                    WHERE old_r.cid = r.cid AND old_r.id < ?
                ) THEN 'DUE'
                ELSE 'NEW'
            END as card_status
        FROM revlog r
        JOIN cards c ON r.cid = c.id
        JOIN notes n ON c.nid = n.id
        WHERE r.id >= ? AND r.id < ?
    """
    
    cursor.execute(query, (start_ms, start_ms, end_ms))
    rows = cursor.fetchall()

    subject_stats = defaultdict(lambda: {"NEW": 0, "DUE": 0})
    if rows:
        for _, tags, status in rows:
            subject = get_subject_from_tags(tags)
            subject_stats[subject][status] += 1
            
    return subject_stats

def print_table(title_text: str, subject_stats: dict):
    """Visualizes the stats data using Rich, EXCLUDING the 'Others' category."""
    total_new = 0
    total_due = 0

    table = Table(title=title_text, box=box.ROUNDED) # Consistent style
    table.add_column("Subject", style="cyan", justify="left")
    table.add_column("New Cards", style="bold green", justify="center")
    table.add_column("Due Cards", style="bold blue", justify="center")
    table.add_column("Total Unique", style="bold white", justify="right")

    all_subjects = sorted([s for s in set(TARGET_SUBJECTS) | set(subject_stats.keys()) if s != "Others"])

    for subject in all_subjects:
        if subject in subject_stats:
            new_count = subject_stats[subject]["NEW"]
            due_count = subject_stats[subject]["DUE"]
        else:
            new_count = 0
            due_count = 0

        total = new_count + due_count
        total_new += new_count
        total_due += due_count

        table.add_row(subject, str(new_count), str(due_count), str(total))

    table.add_section()
    table.add_row("[bold]TOTAL[/bold]", str(total_new), str(total_due), str(total_new + total_due))
    console.print(table)

def save_stats(target_date: datetime, subject_stats: dict):
    """Saves data to SQLite, EXCLUDING the 'Others' category."""
    init_stats_db() 
    date_str = target_date.strftime("%Y-%m-%d")
    conn = sqlite3.connect(STATS_DB_PATH)
    cursor = conn.cursor()

    try:
        cursor.execute(f"DELETE FROM {STATS_TABLE} WHERE study_date = ?", (date_str,))
        
        data_to_insert = []
        all_subjects = sorted([s for s in set(TARGET_SUBJECTS) | set(subject_stats.keys()) if s != "Others"])
        
        for subject in all_subjects:
            if subject in subject_stats:
                new_c = subject_stats[subject]["NEW"]
                due_c = subject_stats[subject]["DUE"]
            else:
                new_c = 0
                due_c = 0  
            total_c = new_c + due_c
            data_to_insert.append((date_str, subject, new_c, due_c, total_c))
        
        if data_to_insert:
            cursor.executemany(f"""
                INSERT INTO {STATS_TABLE} (study_date, subject, new_cards, due_cards, total_cards)
                VALUES (?, ?, ?, ?, ?)
            """, data_to_insert)
            
        conn.commit()
    except Exception as e:
        console.print(f"[bold red]DB Error:[/bold red] {e}")
    finally:
        conn.close()

# --- Schedule Utility Functions ---

def _fetch_daily_stats_for_waterfall(cursor, date):
    """Fetches and aggregates daily stats into a dictionary for waterfall logic."""
    stats = {}
    stats_sql = f"""
    SELECT subject, new_cards, due_cards 
    FROM {STATS_TABLE} 
    WHERE study_date = ?
    """
    cursor.execute(stats_sql, (date,))
    daily_data = cursor.fetchall()
    
    for subject, new_cards, due_cards in daily_data:
        if new_cards > 0:
            stats[(subject, 'NEW')] = new_cards
        if due_cards > 0:
            stats[(subject, 'DUE')] = due_cards
            
    return stats

def _apply_waterfall_rollover(cursor, date, subject, card_type, total_to_assign):
    """
    Applies the FIFO waterfall logic.
    Returns: (list of (DONE, SL) for bulk update, remaining surplus)
    """
    if total_to_assign <= 0:
        return [], 0 

    update_list = []
    remaining_to_assign = total_to_assign
    
    schedule_sql = f"""
    SELECT SL, GOAL 
    FROM {SCHEDULE_TABLE} 
    WHERE DATE = ? AND SUBJECT = ? AND TYPE = ? AND DONE = 0
    ORDER BY SL ASC
    """
    cursor.execute(schedule_sql, (date, subject, card_type))
    slots = cursor.fetchall() 

    for sl, goal in slots:
        if remaining_to_assign <= 0:
            break

        done_for_slot = min(remaining_to_assign, goal)
        update_list.append((done_for_slot, sl))
        remaining_to_assign -= done_for_slot
        
    surplus = remaining_to_assign
    
    return update_list, surplus

# --- Typer Commands ---

@app.command()
def update():
    """
    1. Updates local stats from Anki (daily_stats).
    2. Runs the FIFO waterfall distribution and roll-over (study_schedule).
    """
    dates_to_process = []
    end_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    start_date = GLOBAL_START_DATE
    
    if end_date < start_date:
        console.print("[red]Current date is before Global Start Date. Check config.[/red]")
        return
        
    delta = end_date - start_date
    for i in range(delta.days + 1):
        dates_to_process.append(start_date + timedelta(days=i))
            
    if not dates_to_process:
        console.print("[yellow]No valid dates found in range.[/yellow]")
        return

    # --- PHASE 1: ANKI SYNC (Stats Update) ---
    console.print(f"[blue]PHASE 1: Accessing Anki DB and updating daily_stats...[/blue]")
    try:
        with AnkiDBContext(SOURCE_DB_PATH) as anki_conn:
            cursor = anki_conn.cursor()
            range_aggregate = defaultdict(lambda: {"NEW": 0, "DUE": 0})
            
            for d in dates_to_process:
                day_stats = fetch_daily_stats_from_cursor(cursor, d)
                save_stats(d, day_stats) 
                
                for subj, counts in day_stats.items():
                    if subj != "Others":
                        range_aggregate[subj]["NEW"] += counts["NEW"]
                        range_aggregate[subj]["DUE"] += counts["DUE"]

            start_str = dates_to_process[0].strftime('%Y-%m-%d')
            end_str = dates_to_process[-1].strftime('%Y-%m-%d')
            console.print(f"[green]✓ Successfully updated stats from {start_str} to {end_str}[/green]")
            print_table(f"Study Summary from {start_str} -> {end_str}", range_aggregate)

    except Exception as e:
        # This will now catch the error and display it cleanly if it happens again
        console.print(f"[bold red]An error occurred during Anki update:[/bold red] {e}")
        return

    # --- PHASE 2: WATERFALL DISTRIBUTION (Schedule Update) ---
    
    init_schedule_db()
    conn = None
    try:
        conn = sqlite3.connect(STATS_DB_PATH)
        cursor = conn.cursor()
        
        # Get all dates from the sync range AND one day beyond (for rollover calculation)
        all_dates_to_process = [d.strftime('%Y-%m-%d') for d in dates_to_process]
        
        final_date = datetime.strptime(all_dates_to_process[-1], '%Y-%m-%d')
        future_date_str = (final_date + timedelta(days=1)).strftime('%Y-%m-%d')
        all_dates_to_process.append(future_date_str) 

        # Reset DONE fields for the dates we just synced/will process
        cursor.execute(f"UPDATE {SCHEDULE_TABLE} SET DONE = 0 WHERE DATE >= ?", (start_str,))
        conn.commit()
        
        rollover_balance = {} 
        all_updates = []
        
        console.print("\n[blue]PHASE 2: Starting waterfall distribution with roll-over...[/blue]")

        # Iterate day by day through ALL scheduled dates (including one future day)
        for current_date_str in all_dates_to_process:
            
            # Dynamic Schedule Creation
            slots_created = _create_schedule_entries_for_date(cursor, current_date_str)
            if slots_created > 0:
                 console.print(f"[dim]  - Created {slots_created} schedule slots for {current_date_str}[/dim]")
            
            conn.commit() 

            actual_done = _fetch_daily_stats_for_waterfall(cursor, current_date_str) 

            cursor.execute(f"""
                SELECT DISTINCT SUBJECT, TYPE FROM {SCHEDULE_TABLE} 
                WHERE DATE = ?
            """, (current_date_str,))
            daily_combinations = cursor.fetchall()

            for subject, card_type in daily_combinations:
                key = (subject, card_type)
                
                current_rollover = rollover_balance.get(key, 0)
                today_completed = actual_done.get(key, 0)
                total_to_assign = current_rollover + today_completed
                
                updates, surplus = _apply_waterfall_rollover(
                    cursor, current_date_str, subject, card_type, total_to_assign
                )
                
                rollover_balance[key] = surplus
                all_updates.extend(updates)

        # 4. Bulk Update the study_schedule table
        if all_updates:
            update_sql = f"UPDATE {SCHEDULE_TABLE} SET DONE = ? WHERE SL = ?"
            cursor.executemany(update_sql, all_updates)
            conn.commit()
            console.print(f"[green]✓ Successfully updated {len(all_updates)} schedule slots.[/green]")
        else:
            console.print("[yellow]No schedule slots were updated.[/yellow]")

    except sqlite3.Error as e:
        console.print(f"[bold red]Database error during schedule update:[/bold red] {e}")
    finally:
        if conn: conn.close()


@app.command(name="show-stats")
def show_stats(
    date: str = typer.Argument(
        default=None, 
        help="The date to view in YYYY-MM-DD format. Default is today."
    )
):
    """
    Shows study stats from the local daily_stats history file.
    """
    try:
        if date:
            target_date = datetime.strptime(date, "%Y-%m-%d")
        else:
            target_date = datetime.now()
        date_str = target_date.strftime("%Y-%m-%d")
    except ValueError:
        console.print(f"[bold red]Error:[/bold red] Invalid date format. Use YYYY-MM-DD.")
        return

    if not os.path.exists(STATS_DB_PATH):
        console.print(f"[bold red]Error:[/bold red] Stats DB not found ({STATS_DB_PATH}). Run 'update' first.")
        return

    conn = sqlite3.connect(STATS_DB_PATH)
    cursor = conn.cursor()
    cursor.execute(f"""
        SELECT subject, new_cards, due_cards 
        FROM {STATS_TABLE} 
        WHERE study_date = ?
    """, (date_str,))
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        console.print(f"[yellow]No records found for {date_str} in local history.[/yellow]")
        console.print(f"[dim]Run 'python app.py update' to sync history.[/dim]")
        return

    stats = defaultdict(lambda: {"NEW": 0, "DUE": 0})
    for subject, new_c, due_c in rows:
        stats[subject]["NEW"] = new_c
        stats[subject]["DUE"] = due_c

    print_table(f"Study Summary ({date_str})", stats)

@app.command(name="show-schedule")
def show_schedule(
    date: str = typer.Argument(
        default=None, 
        help="The date to view in YYYY-MM-DD format. Default is today."
    )
):
    """
    Shows the study schedule for a specific day, including GOAL and DONE cards.
    """
    try:
        if date:
            target_date = datetime.strptime(date, "%Y-%m-%d")
        else:
            target_date = datetime.now()
        date_str = target_date.strftime("%Y-%m-%d")
    except ValueError:
        console.print(f"[bold red]Error:[/bold red] Invalid date format. Use YYYY-MM-DD.")
        return

    # Check/Create schedule entries dynamically before trying to display
    init_schedule_db()
    conn = sqlite3.connect(STATS_DB_PATH)
    cursor = conn.cursor()
    
    _create_schedule_entries_for_date(cursor, date_str)
    conn.commit()
    
    # Fetch schedule data
    cursor.execute(f"""
        SELECT SL, TIME, SUBJECT, TYPE, GOAL, DONE
        FROM {SCHEDULE_TABLE} 
        WHERE DATE = ?
        ORDER BY SL
    """, (date_str,))
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        console.print(f"[yellow]No schedule found for {date_str} and failed to generate default entries.[/yellow]")
        return

    # --- Table Definition (Consistent Styling) ---
    table = Table(title=f"Study Schedule ({date_str})", box=box.ROUNDED) # Consistent Style
    
    table.add_column("SL", style="dim", justify="right", min_width=2) 
    table.add_column("TIME", style="cyan", justify="left", min_width=18)
    table.add_column("SUBJECT", style="bold", justify="left", min_width=7)
    table.add_column("TYPE", style="magenta", justify="center", min_width=5)
    table.add_column("GOAL", style="green", justify="right", min_width=5)
    table.add_column("DONE", style="yellow", justify="right", min_width=5)
    table.add_column("STATUS", style="white", justify="left", min_width=15)

    for sl, time, subject, card_type, goal, done in rows:
        status = ""
        style = ""
        
        if done == goal:
            status = "[bold green]✓ HIT[/bold green]"
            style = "dim"
        elif done > goal:
            status = f"[bold white on blue]OVER {done-goal}[/bold white on blue]" 
        elif done > 0:
            status = f"[bold yellow]{done / goal * 100:.0f}% MET[/bold yellow]"
        else:
             status = "[red]PENDING[/red]"

        table.add_row(
            str(sl), 
            time, 
            subject, 
            card_type, 
            str(goal), 
            str(done), 
            status,
            style=style
        )
    
    console.print(table)


# --- NEW REPORT COMMAND (Includes today) ---
@app.command(name="report")
def historical_report():
    """
    Shows a historical progress report for each scheduled time slot 
    since GLOBAL_START_DATE.
    (Includes today's progress, assuming 'update' was run).
    """
    init_schedule_db() # Ensure the table exists
    
    # Use today's date as the end date for the report (assuming 'update' was run)
    today_date = datetime.now().date()
    global_start_date_only = GLOBAL_START_DATE.date()

    if today_date < global_start_date_only:
        console.print(f"[red]Current date is before Global Start Date. Check config.[/red]")
        return
    
    # Calculate the total number of days to consider (includes today)
    total_days_passed = (today_date - global_start_date_only).days + 1
    today_str = today_date.strftime("%Y-%m-%d")
    
    if total_days_passed <= 0:
        console.print("[yellow]No valid days to report on.[/yellow]")
        return


    conn = None
    try:
        conn = sqlite3.connect(STATS_DB_PATH)
        cursor = conn.cursor()

        # SQL to count the number of days where GOAL was met or exceeded 
        sql_query = f"""
            SELECT 
                TIME,
                SUBJECT,
                TYPE,
                SUM(CASE WHEN DONE >= GOAL THEN 1 ELSE 0 END) as successful_days
            FROM {SCHEDULE_TABLE}
            WHERE DATE <= ? AND DATE >= ?
            GROUP BY TIME, SUBJECT, TYPE
            ORDER BY TIME
        """
        
        # We query up to today_str
        cursor.execute(sql_query, (today_str, global_start_date_only.strftime("%Y-%m-%d")))
        success_data = {(row[0], row[1], row[2]): row[3] for row in cursor.fetchall()}

    except sqlite3.Error as e:
        console.print(f"[bold red]Database error during report generation:[/bold red] {e}")
        return
    finally:
        if conn: conn.close()
        
    # --- Table Generation ---
    title = f"Historical Slot Progress ({global_start_date_only.strftime('%Y-%m-%d')} to {today_str}, Total Days: {total_days_passed})"
    table = Table(title=title, box=box.ROUNDED) 
    
    table.add_column("SL", style="dim", justify="right", min_width=2) 
    table.add_column("TIME", style="cyan", justify="left", min_width=18)
    table.add_column("SUBJECT", style="bold", justify="left", min_width=7)
    table.add_column("TYPE", style="magenta", justify="center", min_width=5)
    table.add_column("PROGRESS", style="white", justify="left", min_width=30)


    for i, slot in enumerate(DAILY_TEMPLATE):
        sl = i + 1
        time_slot = slot['TIME']
        subject = slot['SUBJECT']
        card_type = slot['TYPE']
        
        key = (time_slot, subject, card_type)
        successful_days = success_data.get(key, 0)
        
        # Calculation
        percentage = (successful_days / total_days_passed) * 100
        
        # Rich Color Coding based on success
        if percentage >= 90:
            color = "bold green"
        elif percentage >= 50:
            color = "yellow"
        else:
            color = "red"
            
        progress_str = f"[{color}]{successful_days} / {total_days_passed}[/{color}] ({percentage:.1f}%)"

        table.add_row(
            str(sl), 
            time_slot, 
            subject, 
            card_type, 
            progress_str
        )
    
    console.print(table)


if __name__ == "__main__":
    app()