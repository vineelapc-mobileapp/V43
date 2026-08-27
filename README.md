# EEE Practice App — v43

Cloudinary added as a second Media Storage option - no credit card
required, ever. If both Cloudinary and Firebase are connected, Cloudinary
is used first.

## Setting it up (no billing needed)

1. Go to cloudinary.com -> sign up free (Google/GitHub/email, no card asked)
2. On your dashboard, copy your Cloud Name (shown right at the top)
3. Go to Settings (gear icon) -> Upload tab -> scroll to "Upload presets" -> Add upload preset
4. Set Signing Mode to Unsigned -> give it any name (e.g. eee_practice_uploads) -> Save
5. In Teacher Upload -> Publish Settings -> "Connect to Media Storage (Cloudinary)" -> paste your Cloud Name and the preset name you just created -> Save

That's it - no sign-in, no password, no card. The "unsigned upload preset" is what makes this safe: it lets the app upload directly from a browser without needing a secret key hidden anywhere.

## Folder structure

```
v43/
├── upload.js                 # *NEW* Cloudinary upload logic, unified with Firebase behind one function
├── upload.html                  # *NEW* "Connect to Media Storage (Cloudinary)" settings panel
├── data/, app.js, index.html, home.html, manifest*.json, style.css   # Unchanged from v42
├── service-worker.js                                                    # Cache bumped to v43
├── libs/, icons/
└── README.md

v42/, v41/, v40/, v39/, v38/, v37/, v36/, v35/, v34/, v33/, v32/, v31/, v30/, v29/, v28/, v27/, v26/, v25/, v24/, v23/, v22/, v21/, v20/, v19/, v18/, v17/, v16/, v15/, v14/, v13/, v12/, v11/, v10/, v9/, v8/, v7/, v6/, v5/, v4/, v3/, v2/, v1/   # All untouched
```

## How the two options work together

Every upload point (question figure, video, audio upload, audio
recording, explanation image, and the Storage Report's migration
buttons) now checks in this order:

1. Cloudinary, if connected
2. Firebase, if connected and Cloudinary isn't
3. Local embedding (the original v28 behavior), if neither is connected

You only need to set up one of them. Cloudinary is the simpler, no-card
option; Firebase gives more headroom once you're willing to link a card.
Both produce the same result for students - a link stored in
questions.json instead of the full file - so nothing else in the app
needed to change.

## The honest capacity picture

Cloudinary's free plan gives 25 credits/month, where 1 credit = 1 GB
of storage or 1 GB of bandwidth or 1,000 image transformations,
mixed and matched however you use them. For a personal teaching app this
is generous, but worth knowing: bandwidth (students replaying a video)
counts against the same budget as storage does, so a very popular video
watched many times could use up credits faster than the storage itself
would suggest.

## Verified before shipping

Tested the full connection and upload flow directly: connected the
Cloudinary settings panel, uploaded an actual video file through the
question editor, and confirmed the resulting link has the correct
Cloudinary URL shape and the video preview genuinely plays back the
uploaded content - not just that the code looks right.

## Changelog

### v43 — Cloudinary Media Storage (no credit card needed)
- **<span style="color:red">**\*NEW\*** "Connect to Media Storage (Cloudinary)" settings panel</span>** - Cloud Name + unsigned upload preset, no sign-in needed.
- **<span style="color:red">**\*NEW\*** Every media upload point now tries Cloudinary first, then Firebase, then local embedding</span>** - unified behind one function, nothing else changed in how questions are edited.
- **<span style="color:red">**\*NEW\*** Storage Report migration buttons work with either service connected</span>**.
- No changes to question editing, math rendering, or anything else from v42.

## Still pending

- Real-world verification of the Firebase Media Storage flow specifically (from v35 - still open)
- Real question content for the syllabus topics
- Bring back "Ask a Doubt" once students are onboarded (from v17)
- Firebase backend for Student Marks + Doubts tabs (still your call — see v10)
- Level-2 unlock gated on Level-1 score
- Desktop `.exe` project not yet synced past v7
