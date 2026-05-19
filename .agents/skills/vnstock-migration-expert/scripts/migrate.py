import os
import re
import argparse
import sys

# Patterns for Community Migration (Legacy Vnstock to modular api)
COMMUNITY_PATTERNS = [
    {
        'pattern': r'from vnstock import Vnstock',
        'suggestion': 'from vnstock.api.quote import Quote\nfrom vnstock.api.company import Company\nfrom vnstock.api.financial import Financial\nfrom vnstock.api.listing import Listing',
        'note': 'Chuyển đổi import từ Vnstock sang các lớp chuyên biệt trong vnstock.api.'
    },
    {
        'pattern': r'Vnstock\(\)',
        'suggestion': 'Quote(symbol=..., source=...)',
        'note': 'Khởi tạo trực tiếp lớp Adapter bạn cần (Quote, Company, Financial...)'
    },
    {
        'pattern': r'\.stock\((.*?)\)\.quote',
        'suggestion': 'Quote(symbol=\\1, source=...)',
        'note': 'Thay thế truy cập .stock().quote bằng khởi tạo Quote trực tiếp.'
    },
    {
        'pattern': r'\.stock\((.*?)\)\.company',
        'suggestion': 'Company(symbol=\\1, source=...)',
        'note': 'Thay thế truy cập .stock().company bằng khởi tạo Company trực tiếp.'
    },
    {
        'pattern': r'\.stock\((.*?)\)\.finance',
        'suggestion': 'Financial(symbol=\\1, source=...)',
        'note': 'Thay thế truy cập .stock().finance bằng khởi tạo Financial trực tiếp.'
    },
    {
        'pattern': r'\.stock\((.*?)\)\.listing',
        'suggestion': 'Listing(source=...)',
        'note': 'Thay thế truy cập .stock().listing bằng khởi tạo Listing trực tiếp.'
    },
    {
        'pattern': r'\.fx\((.*?)\)',
        'suggestion': 'Quote(symbol=\\1, source="MSN")',
        'note': 'Forex data hiện được chuyển sang Quote với source="MSN".'
    },
    {
        'pattern': r'\.crypto\((.*?)\)',
        'suggestion': 'Quote(symbol=\\1, source="MSN")',
        'note': 'Crypto data hiện được chuyển sang Quote với source="MSN".'
    },
    {
        'pattern': r'\.world_index\((.*?)\)',
        'suggestion': 'Quote(symbol=\\1, source="MSN")',
        'note': 'World index hiện được chuyển sang Quote với source="MSN".'
    },
    {
        'pattern': r'\.fund\(',
        'suggestion': 'from vnstock.explorer.fmarket import Fund\nFund(',
        'note': 'Fund data hiện được truy cập trực tiếp từ explorer.fmarket.'
    }
]

def scan_community(filepath: str):
    """Scans for legacy Vnstock patterns and prints suggestions."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        lines = content.split('\n')
        found = False
        for i, line in enumerate(lines):
            for p in COMMUNITY_PATTERNS:
                if re.search(p['pattern'], line):
                    found = True
                    print(f"\n[Dòng {i+1}] {line.strip()}")
                    print(f"  👉 Gợi ý: {p['suggestion']}")
                    print(f"  📝 Ghi chú: {p['note']}")
        return found
    except Exception as e:
        print(f"❌ Error scanning {filepath}: {e}", file=sys.stderr)
        return False

def upgrade_to_sponsor(filepath: str, dry_run: bool = False) -> bool:
    """Migrates `vnstock` imports to `vnstock_data` and returns True if modified."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # 1. replace `import vnstock` -> `import vnstock_data`
        pattern1 = r'\bimport vnstock\b'
        content_new, count1 = re.subn(pattern1, 'import vnstock_data', content)
        
        # 2. replace `from vnstock import` -> `from vnstock_data import`
        pattern2 = r'\bfrom vnstock import\b'
        content_new, count2 = re.subn(pattern2, 'from vnstock_data import', content_new)
        
        # 3. replace `from vnstock.` -> `from vnstock_data.`
        pattern3 = r'\bfrom vnstock\.'
        content_new, count3 = re.subn(pattern3, 'from vnstock_data.', content_new)

        total_replacements = count1 + count2 + count3

        if total_replacements > 0:
            if not dry_run:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content_new)
                print(f"✅ Migrated {filepath} ({total_replacements} replacements)")
            else:
                print(f"🔍 [DRY RUN] Would migrate {filepath} ({total_replacements} replacements)")
            return True
        return False
    except Exception as e:
        print(f"❌ Error upgrading {filepath}: {e}", file=sys.stderr)
        return False

def get_files(directory: str):
    """Recursively find all .py and .ipynb files."""
    files = []
    for root, _, filenames in os.walk(directory):
        if any(ignored in root for ignored in ['.venv', 'venv', 'env', '.git', '__pycache__']):
            continue
        for filename in filenames:
            if filename.endswith('.py') or filename.endswith('.ipynb'):
                files.append(os.path.join(root, filename))
    return files

def main():
    parser = argparse.ArgumentParser(description="Vnstock Migration Expert Script")
    parser.add_argument("target", help="File or directory to process")
    parser.add_argument("--mode", choices=["scan", "sponsor"], default="scan",
                        help="Mode: 'scan' for legacy patterns (Community), 'sponsor' to upgrade to vnstock_data")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without modifying files (Sponsor mode only)")
    args = parser.parse_args()

    if not os.path.exists(args.target):
        print(f"Error: Target path '{args.target}' does not exist.")
        sys.exit(1)

    files_to_process = []
    if os.path.isfile(args.target):
        files_to_process.append(args.target)
    elif os.path.isdir(args.target):
        files_to_process.extend(get_files(args.target))

    if not files_to_process:
        print("No .py or .ipynb files found to process.")
        sys.exit(0)

    print(f"Processing {len(files_to_process)} file(s) in {args.mode} mode...")
    
    modified_count = 0
    found_count = 0

    for filepath in files_to_process:
        if args.mode == "scan":
            if scan_community(filepath):
                found_count += 1
        elif args.mode == "sponsor":
            if upgrade_to_sponsor(filepath, args.dry_run):
                modified_count += 1

    if args.mode == "scan":
        if found_count == 0:
            print("\n✨ No legacy patterns found.")
        else:
            print(f"\n✨ Found legacy patterns in {found_count} file(s). Please review the suggestions above.")
    else:
        if modified_count == 0:
            print("\n✨ No vnstock imports found that needed transition to vnstock_data.")
        else:
            mode_text = "Would modify" if args.dry_run else "Successfully modified"
            print(f"\n✨ {mode_text} {modified_count} file(s).")

if __name__ == "__main__":
    main()
