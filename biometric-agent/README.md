# Biometric Agent

This folder contains the agent that syncs biometric attendance into the backend.

## Direct device polling (recommended if you have the office terminal)

1. Install dependencies:
   ```bash
   cd backend/biometric-agent
   npm install
   ```
2. Copy the env template:
   ```bash
   cp .env.example .env
   ```
3. Update `.env`:
   - `DEVICE_IP` = your biometric terminal LAN IP
   - `API_BASE_URL` = `http://localhost:4000/api` or your backend URL
   - `BIOMETRIC_WEBHOOK_SECRET` = same secret as backend
4. Run the agent:
   ```bash
   npm start
   ```

The agent will poll the device and forward punches to the backend automatically.

## Automatic Attendance Tracker Excel import

If your attendance software only exports Excel reports, you can avoid manually uploading each file by using the watcher.

1. Run:
   ```bash
   cd backend/biometric-agent
   npm run watch
   ```
2. Export the attendance report from Attendance Tracker to one of these formats:
   - `.xlsx`
   - `.xls`
3. Save the exported file into:
   - `backend/biometric-agent/attendance-imports/`

The watcher automatically processes new files and forwards the punch records to `/api/attendance/biometric-webhook`.

Processed files are moved to `backend/biometric-agent/attendance-imports/processed/`.

## Avoiding daily manual upload entirely

If Attendance Tracker can save exports to a known folder, point it directly at `attendance-imports/`.

If the tracker has no API, you can still automate by syncing the export folder.

1. Set `TRACKER_EXPORT_FOLDER` in `backend/biometric-agent/.env`
2. Run:
   ```bash
   cd backend/biometric-agent
   npm run sync-export-folder
   ```
3. Save or export tracker reports into the configured folder.

The sync script will copy new `.xlsx` / `.xls` files into `attendance-imports/`, and the watcher will process them.

## Notes

- The watcher supports both `.xlsx` and `.xls` files.
- The backend still requires employee `biometricUserId` values to match device or export IDs.
