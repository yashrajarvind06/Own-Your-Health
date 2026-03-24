import os
import shutil

backend = r'c:\Yashraj\PICT_Hackathon\backend'
root = r'c:\Yashraj\PICT_Hackathon'

# Files to delete in backend/
backend_files = [
    # debug
    'debug_approve.py', 'debug_check.py', 'debug_data_and_service.py',
    'debug_db.py', 'debug_logs.py', 'debug_patient_4.py',
    'debug_patient_logs.py', 'debug_server_check.py', 'debug_stdout.py',
    'debug_user.py', 'debug_user_file.py',
    # check
    'check_db_state.py', 'check_keys.py', 'check_schema.py', 'check_startup.py',
    # diagnose
    'diagnose_crash.py', 'diagnose_request.py', 'diagnose_server.py',
    # test, seed, simple
    'test_denial_logic.py', 'test_register.py', 'seed_patient_4.py', 'simple_debug.py',
    # fix, migrate, dump, verify
    'fix_schema.py', 'fix_user_9.py', 'force_migrate_users.py',
    'migrate_phase3.py', 'migrate_revocation.py', 'migrate_schema.py', 'migrate_users.py',
    'init_postgres_db.py', 'dump_schema.py', 'dump_table_info.py',
    'verify_duration.py', 'verify_revocation.py', 'verify_schema.py',
    # aider
    '.aider.chat.history.md', '.aider.conf.yml', '.aider.input.history', '.aiderignore',
    # self
    '_cleanup.bat',
]

# Dirs to delete in backend/
backend_dirs = ['.aider.tags.cache.v4']

# Files to delete in root
root_files = ['test_fs.log', 'migrate_report_access.py', '_root_cleanup.bat']
# Empty dirs to delete in root
root_dirs = ['storage']

deleted = []
skipped = []

for f in backend_files:
    path = os.path.join(backend, f)
    try:
        os.remove(path)
        deleted.append(f)
    except FileNotFoundError:
        skipped.append(f + ' (not found)')
    except Exception as e:
        skipped.append(f + f' (ERROR: {e})')

for d in backend_dirs:
    path = os.path.join(backend, d)
    try:
        shutil.rmtree(path)
        deleted.append(d + '/')
    except FileNotFoundError:
        skipped.append(d + '/ (not found)')
    except Exception as e:
        skipped.append(d + f'/ (ERROR: {e})')

for f in root_files:
    path = os.path.join(root, f)
    try:
        os.remove(path)
        deleted.append('root/' + f)
    except FileNotFoundError:
        skipped.append('root/' + f + ' (not found)')
    except Exception as e:
        skipped.append('root/' + f + f' (ERROR: {e})')

for d in root_dirs:
    path = os.path.join(root, d)
    try:
        os.rmdir(path)  # Only if empty
        deleted.append('root/' + d + '/')
    except FileNotFoundError:
        skipped.append('root/' + d + '/ (not found)')
    except OSError as e:
        skipped.append('root/' + d + f'/ (ERROR: {e})')

print(f"\n=== DELETED ({len(deleted)}) ===")
for f in deleted:
    print(f"  OK: {f}")

print(f"\n=== SKIPPED ({len(skipped)}) ===")
for f in skipped:
    print(f"  --: {f}")
