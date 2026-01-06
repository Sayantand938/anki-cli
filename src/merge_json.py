import json
import glob
from pathlib import Path

# Paths
input_path = Path(__file__).parent.parent / "data/input"
output_path = Path(__file__).parent.parent / "data/output"

# Function to merge JSON part files and delete them afterwards
def merge_json_parts(file_pattern, output_file):
    merged_data = []
    part_files = sorted(glob.glob(str(file_pattern)))

    # Skip the final merged file if it exists
    part_files = [f for f in part_files if f != str(output_file)]

    for file_path in part_files:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                merged_data.extend(data)
            else:
                merged_data.append(data)

    # Write merged data
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(merged_data, f, indent=2)

    # Delete part files
    for file_path in part_files:
        Path(file_path).unlink()

# Merge input part files -> input.json
merge_json_parts(input_path / "input-*.json", input_path / "input.json")

# Merge output part files -> output.json
merge_json_parts(output_path / "output-*.json", output_path / "output.json")

print("All JSON part files merged and deleted successfully!")
