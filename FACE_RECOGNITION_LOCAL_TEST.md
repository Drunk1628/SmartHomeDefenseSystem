# Face recognition local integration test

This project copy has the face-recognition page connected to the Python API for local testing. It supports both recognition and enrolling/removing authorized demo people. Images are sent only after the user chooses **Analyze image** or **Enroll person**.

## Start the Python service

From the repository root, open a terminal and run:

```bash
cd services/face-recognition
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python run.py
```

Keep this terminal open. The API listens locally at `http://127.0.0.1:8000`.

If a virtual environment already exists for this backend, use its Python executable in place of `.venv/bin/python`.

## Start the web page

Open a second terminal at the repository root and install the JavaScript dependencies once:

```bash
pnpm install --frozen-lockfile
```

Then start the frontend:

```bash
cp artifacts/iot-home-protection/.env.example artifacts/iot-home-protection/.env.local
PORT=5173 pnpm --filter @workspace/iot-home-protection run dev
```

Open `http://localhost:5173`, choose **AI Face Recognition**, and use **Enroll a person** to enter a name, select a JPEG/PNG/WebP photo up to 5 MB, and confirm that the person agreed. Enrollment succeeds only when exactly one face is found. The service stores the face feature vector in SQLite, not the uploaded photo. After enrollment, use the same person's image in **Review an image** and choose **Analyze image**. Remove a person from **Enrolled people**.

For a safe initial check without a person's photo, use a blank synthetic image. Recognition should report **Unable to verify** with “No face was detected”; enrollment should refuse to add anyone.

## Run the backend tests

In another terminal, from `services/face-recognition`, run:

```bash
.venv/bin/python -m unittest discover -s tests -v
```

The backend maps `match` to the page's recognized-member label, `no_match` to no authorized gallery match, and `no_face`, `multiple_faces`, or `indeterminate` to an unverified result. A recognized gallery entry is not a door access decision. Enroll only people who have agreed to this use.

## Scope

This setup is for local development. The Vite proxy is only active during frontend development. The repository's production Express API does not expose a face-recognition proxy or start the Python service yet. The enrollment endpoints also do not have their own authentication, so keep this service local and do not publish it to the internet until deployment adds authenticated, authorized access. The frontend defaults to demo mode when `.env.local` is absent.

## Verification already completed

- 16 Python API tests cover recognition, consent validation, face-count validation, enrollment persistence, lookup, and removal.
- Frontend typecheck and production build pass.
- Browser verification uses a synthetic blank image; it must not be treated as a successful enrollment or identity match.
