# OwnYourHealth - Patient-Owned Digital Health Record System

A secure, patient-centric platform ensuring complete control over medical data access. Features QR-code based instant access, strict separation of Emergency vs. Detailed records, and a forensic-grade audit trail.

## 🚀 Key Features

### 1. Patient Control & Privacy
- **QR Code Access**: Doctors scan a uniquely generated QR code to request access.
- **Granular Permissions**: 
    - **Emergency Access**: Instant access to life-saving data (Blood Type, Allergies) via override logs.
    - **My Records**: Requires explicit patient approval for full medical history.
- **Session Management**: Auto-expiring sessions (15m default) with manual revocation.

### 2. Emergency Protocols
- **Separated Data Stores**: "Emergency Profile" and "Medical Records" are distinct.
- **Emergency Override**: Doctors can bypass approval for Emergency Profile during crises.
- **Alert System**: Immediate logging and visual flagging of emergency overrides.

### 3. Forensic Audit Logging
- **Trust-First UI**: "Session Timeline", "Report Permissions", and "Emergency Views" tabs.
- **Transparent Logging**: Every report open, profile view, and access request is logged.
- **Timezone Aware**: All logs displayed in strict **IST (Indian Standard Time)**.
- **Visual Cues**: Amber highlights for emergency profile accesses.

## 🛠️ Technology Stack

- **Backend**: FastAPI (Python), SQLite (with SQLAlchemy), JWT Auth.
- **Frontend**: React (Vite), Tailwind CSS, Lucide Icons.
- **Security**: 
    - Stateless JWT Authentication.
    - Role-Based Access Control (RBAC).

## 📦 Setup Instructions

### Prerequisites
- Python 3.10+
- Node.js & npm

### Backend Setup
1. Navigate to `backend/`:
   ```bash
   cd backend
   ```
2. Create virtual environment (optional but recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the server:
   ```bash
   python -m app.main
   ```
   Server runs at `http://localhost:8000`.

### Frontend Setup
1. Navigate to `frontend/`:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start development server:
   ```bash
   npm run dev
   ```
   App runs at `http://localhost:5173`.

### Mobile Patient App (Expo)
1. Run the backend so your phone can reach it: `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000` (from `backend/`).
2. In `mobile/`, copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_BASE` to your PC's LAN IP.
3. `npm install`, then `npx expo start` and scan the QR code with Expo Go. Use `npx expo start --web` to test in a browser.

Patients sign in here. Doctors and labs use the web app.

#### Installable app (PWA), works on iPhone without Expo Go
1. `cd mobile && npm run build:web`. This builds into `mobile/dist`, which the backend serves at `/`.
2. Run the backend, then expose port 8000 over **HTTPS** (a tunnel or a cloud host). Service workers, and so offline mode and "Add to Home Screen", need HTTPS.
3. On the phone, open the HTTPS URL in Safari, then Share → **Add to Home Screen**.

The backend signs tokens with `SECRET_KEY`. If that isn't set, it creates a random key in `backend/.secret_key` (gitignored).

### Demo identities (mock ABDM registries)
The registries are JSON fixtures in `backend/app/fixtures/`. Swap `services/registry.py` for the ABDM sandbox later.

| Who | Sign up / log in with |
|---|---|
| Patient (ABHA login) | `91-1234-5678-9012` (Ram Singh), `91-2345-6789-0123`, `91-3456-7890-1234` (Rahul Singh), `91-4567-8901-2345` |
| Doctor (HPR) | any ID in `fixtures/hpr.json`, e.g. `HPR2000000004`. Each ID can be linked to one account only |
| Lab (HFR) | any ID in `fixtures/hfr.json` |

There is no SMS gateway: OTPs are printed in the backend log, and while `OTP_DEV_ECHO=1` (the default) they are also shown in the app as "Demo OTP". Set `OTP_DEV_ECHO=0` outside demos.

### Checks
From `backend/`, with the server running: `python verify_features.py` (end-to-end), `python verify_security.py`, `python verify_registry.py`.

## 🧪 Usage Flow

1. **Register**: Create a Patient account.
2. **Dashboard**: View your QR Code.
3. **Doctor Access**: A Doctor logs in and scans the QR code/enters Patient ID.
4. **Approval**:
   - **Normal Request**: Patient approves via dashboard popup.
   - **Emergency**: Doctor selects "Emergency Access" (logged immediately).
5. **Audit**: Check "History" to see exactly who viewed what and when.

---
*Created for PICT Hackathon*
Checking branch changes