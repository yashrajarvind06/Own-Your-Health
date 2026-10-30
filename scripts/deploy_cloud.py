"""Permanent backend: Supabase (database, file storage) + Render (API + patient PWA, runs the Dockerfile).

Safe to re-run: it reuses what already exists. Reads tokens from backend/.env.deploy (gitignored) and the
Gemini key from backend/.env; generated values are written back to .env.deploy. Never prints a secret.
Run from the repo root: backend\\venv\\Scripts\\python.exe scripts\\deploy_cloud.py
"""
import secrets
import sys
import time
from pathlib import Path

import requests
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / "backend" / ".env.deploy"
NAME = "ownyourhealth"
REPO = "https://github.com/yashrajarvind06/Own-Your-Health"
BRANCH = "docs/decisions-log"
BUCKET = "reports"
SUPABASE = "https://api.supabase.com/v1"
RENDER = "https://api.render.com/v1"

cfg = dotenv_values(ENV_FILE)
missing = [k for k in ("RENDER_API_KEY", "SUPABASE_TOKEN", "BREVO_API_KEY", "EMAIL_FROM") if not cfg.get(k)]
if missing:
    sys.exit(f"Fill these in {ENV_FILE}: {', '.join(missing)}")
gemini = dotenv_values(ROOT / "backend" / ".env").get("GEMINI_API_KEY", "")


def remember(key, value):
    with ENV_FILE.open("a", encoding="utf8") as f:
        f.write(f"\n{key}={value}\n")
    cfg[key] = value


def call(method, url, token, ok=(200, 201), **kw):
    res = requests.request(method, url, headers={"Authorization": f"Bearer {token}"}, timeout=60, **kw)
    if res.status_code not in ok:
        sys.exit(f"{method} {url} failed: {res.status_code} {res.text[:400]}")
    return res


def sb(method, path, **kw):
    return call(method, SUPABASE + path, cfg["SUPABASE_TOKEN"], **kw).json()


def rd(method, path, **kw):
    return call(method, RENDER + path, cfg["RENDER_API_KEY"], **kw)


# --- Supabase: project, bucket, database URL ------------------------------------
project = next((p for p in sb("GET", "/projects") if p["name"] == NAME), None)
if not project:
    org = sb("GET", "/organizations")[0]
    if not cfg.get("DB_PASS"):
        remember("DB_PASS", secrets.token_hex(24))  # hex: safe inside a URL
    print("Creating Supabase project (Mumbai)...")
    project = sb("POST", "/projects", json={"name": NAME, "organization_slug": org["slug"], "db_pass": cfg["DB_PASS"],
                                            "region_selection": {"type": "specific", "code": "ap-south-1"}})
elif not cfg.get("DB_PASS"):
    sys.exit("A Supabase project named ownyourhealth exists but its password isn't in .env.deploy. Add DB_PASS=<its password>.")
ref = project["id"]

for _ in range(60):
    project = sb("GET", f"/projects/{ref}")
    if project["status"] == "ACTIVE_HEALTHY":
        break
    print(f"Waiting for the database: {project['status']}")
    time.sleep(10)
else:
    sys.exit("Supabase project didn't become healthy in 10 minutes")
print("Supabase project ready:", ref)

keys = sb("GET", f"/projects/{ref}/api-keys", params={"reveal": "true"})
service_key = next(k["api_key"] for k in keys if k["name"] == "service_role")
call("POST", f"https://{ref}.supabase.co/storage/v1/bucket", service_key, ok=(200, 201, 400, 409),
     json={"id": BUCKET, "name": BUCKET, "public": False})

pooler = sb("GET", f"/projects/{ref}/config/database/pooler")[0]
database_url = f"postgresql://{pooler['db_user']}:{cfg['DB_PASS']}@{pooler['db_host']}:5432/{pooler['db_name']}?sslmode=require"  # 5432 = session mode

if not (cfg.get("AWS_ACCESS_KEY_ID") and cfg.get("AWS_SECRET_ACCESS_KEY")):
    sys.exit("One manual step left. Supabase has no API for this:\n"
             f"  1. Open https://supabase.com/dashboard/project/{ref}/storage/s3\n"
             "  2. Create new access key, then copy both values\n"
             f"  3. Put them in {ENV_FILE} as AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY\n"
             "  4. Run this script again")

# --- Render: web service ----------------------------------------------------------
env = {
    "DATABASE_URL": database_url, "GEMINI_API_KEY": gemini, "BREVO_API_KEY": cfg["BREVO_API_KEY"], "EMAIL_FROM": cfg["EMAIL_FROM"],
    "AWS_ACCESS_KEY_ID": cfg["AWS_ACCESS_KEY_ID"], "AWS_SECRET_ACCESS_KEY": cfg["AWS_SECRET_ACCESS_KEY"], "AWS_REGION": project["region"],
    "S3_BUCKET": BUCKET, "S3_ENDPOINT_URL": f"https://{ref}.storage.supabase.co/storage/v1/s3",
    "OTP_DEV_ECHO": "0",  # 1 would return login codes in API responses
}
env_list = [{"key": k, "value": v} for k, v in env.items()] + [{"key": "SECRET_KEY", "generateValue": True}]

owner = rd("GET", "/owners").json()[0]["owner"]["id"]
found = [s["service"] for s in rd("GET", "/services", params={"name": NAME, "ownerId": owner}).json()]
if found:
    service = found[0]
    # SECRET_KEY stays as generated: changing it would sign everyone out and break file links
    current = {e["envVar"]["key"]: e["envVar"]["value"] for e in rd("GET", f"/services/{service['id']}/env-vars").json()}
    rd("PUT", f"/services/{service['id']}/env-vars", json=[{"key": k, "value": v} for k, v in {**current, **env}.items()])
    rd("POST", f"/services/{service['id']}/deploys", json={})
    print("Updated the Render service and started a deploy")
else:
    print("Creating Render service...")
    service = rd("POST", "/services", json={
        "type": "web_service", "name": NAME, "ownerId": owner, "repo": REPO, "branch": BRANCH, "autoDeployTrigger": "commit", "envVars": env_list,
        "serviceDetails": {"runtime": "docker", "plan": "free", "region": "singapore", "healthCheckPath": "/reports/types",
                           "envSpecificDetails": {"dockerfilePath": "./Dockerfile", "dockerContext": "."}},
    }).json()["service"]
url = service["serviceDetails"]["url"]
rd("PUT", f"/services/{service['id']}/env-vars/PUBLIC_BASE_URL", json={"value": url})  # emergency card QR links
print("Dashboard:", service.get("dashboardUrl"))

for _ in range(120):
    time.sleep(15)
    status = rd("GET", f"/services/{service['id']}/deploys", params={"limit": 1}).json()[0]["deploy"]["status"]
    print("Deploy:", status)
    if status == "live":
        break
    if status in ("build_failed", "update_failed", "canceled", "deactivated"):
        sys.exit(f"Deploy {status}. See the logs on the Render dashboard.")
else:
    sys.exit("Still deploying after 30 minutes. Check the Render dashboard.")

check = requests.get(url + "/reports/types", timeout=120)
print(f"\nLive: {url}  (health check {check.status_code})")
