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
