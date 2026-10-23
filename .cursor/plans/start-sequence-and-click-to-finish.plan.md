---
name: Start sequence and click to finish (PWA)
overview: "Run race starts and record finishes from the ScoreSmarter PWA on a tablet or phone, offline. Start signals play through an ordinary Bluetooth speaker; quiet cues guide the race officer. Same design on Android and iOS."
todos:
  - id: offline-hardening
    content: "Offline readiness: persistent storage (done on cursor/persistent-storage), treat queued writes as saved, pending-uploads indicator, disable Publish/scan when offline"
    status: in_progress
  - id: sequence-model
    content: Start sequence model (signals, offsets, sound lengths per RRS 26) with per-club presets and multiple fleets/starts
    status: pending
  - id: sequence-runner
    content: Sequence runner driven by the device clock (not timers alone), with Wake Lock, visual countdown and flag prompts
    status: pending
  - id: audio
    content: "Audio: loud fleet signals and quiet RO cues at separate volumes, keep-awake tone for the speaker, test-sound button"
    status: pending
  - id: record-start
    content: Record actual start time(s) on the race from the sequence; handle postponement, general recall and restart
    status: pending
  - id: click-to-finish
    content: "Click to finish: tap to timestamp finishers, assign sail numbers afterwards, offline queue, works with the start time above"
    status: pending
isProject: false
---

# Start sequence and click to finish (PWA)

## Decision
- **Build it as part of the existing PWA, not a native app.** That's far less work, and one code base runs on Android and iOS.
- **No Wi-Fi or internet needed during racing.**
  - Results are queued offline in Firestore's IndexedDB cache and upload later.
  - The start signals go to a paired Bluetooth speaker.
- **Sound uses an ordinary Bluetooth speaker** (not a smart speaker, which needs Wi-Fi). It's paired once in the tablet's Bluetooth settings, and the app just plays sounds, so there's no Bluetooth code in the app.
  - If no speaker is connected, sound comes from the tablet itself.
- **The speaker choice doesn't affect the Android versus iOS question.** Playing audio through a paired speaker works the same on both.
  - The Android/iOS differences from earlier still apply: vibration, Bluetooth relays, storage rules and backgrounding.

## Hardware (guidance for clubs)
A rugged, waterproof speaker you can put down and leave on a small committee boat (rough UK prices):

| Speaker | Approx. price | Power |
|---|---|---|
| Anker Soundcore Boom 2 | £80–130 | 60 W (80 W peak); IPX7, floats |
| UE Megaboom 4 | £100–200 | max 91 dBC; IP67, floats |
| JBL Charge 6 | £130–180 | 45 W; IP67 |
| JBL Xtreme 4 | £250–300 | 70 W on battery (100 W on mains); IP67 |
| JBL Boombox 4 | larger | about 200 W on mains |

- **Look for:** IP67/IPX7 waterproofing, a stable flat base or a strap point, and auto power-off you can adjust or disable in the maker's app.
- **Loudness:** watts are only a rough guide, and on a boat the battery-mode figure applies. A sharp, high-pitched horn sample carries further outdoors than a low, booming one. Test at a real start.
- **Louder fallbacks if needed:**
  - a relay box on an existing hooter, driven over Web Bluetooth, which is Android only;
  - a purpose-built Bluetooth start horn, such as SailBot.
- **Never rely on Wi-Fi to sound signals.**

## Start sequence design
- **Signals:** warning, preparatory and one-minute signals, then the start, at configurable offsets (5-4-1-0 by default) with the RRS 26 sound lengths. The one-minute signal is "one long sound".
  - Presets per club and per fleet. Rolling or multiple starts follow on.
- **Timing comes from the device clock:**
  - Each signal is scheduled at an absolute time and fired when the clock reaches it, not from chained `setTimeout`s.
  - The app recovers if a timer runs late or the app is briefly in the background.
  - Under the RRS, start timing comes from the visual signals; the sound is secondary.
- **Two audio levels on one output.** A web app can't route some sounds to the tablet and others to the Bluetooth speaker, so all audio goes to the paired speaker:
  - **Fleet signals:** full volume.
  - **Race officer cues:** soft clicks or voice ("10 seconds… 5, 4, 3…") at about 10–20% of the signal volume, with a separate volume control. They should sound different from the signals so competitors don't mistake them.
- **Race officer prompts are mainly visual:**
  - a large countdown to the next signal;
  - the flag to raise or lower;
  - a screen flash when each signal fires;
  - vibration on Android, which iOS doesn't support.
- **Keeping the speaker awake:** play a near-inaudible tone during the sequence, so the speaker doesn't power off between signals.
- **Before the sequence:**
  - a **Test sound** button, to check the speaker is connected;
  - check the volume and that notification sounds are muted.
- **Screen and audio:** the Wake Lock API keeps the screen on for the whole sequence. Starting the sequence with a tap unlocks browser audio.
- **Recording the start:** the actual start time is saved on the race, or races. Handle postponement, general recall (restart the sequence) and individual recall (sound only).

## Click to finish
- **Tapping:**
  - each finisher is one tap, timestamped from the device clock;
  - sail numbers are assigned straight away or afterwards, from the entry list or by typing;
  - feedback is a sound plus a screen flash, and vibration on Android.
- **Offline:**
  - works fully offline, with taps written to the Firestore offline queue;
  - the race and its entries must be opened while online first, so they're cached.
- **Elapsed times** come from the start time recorded by the start sequence, or one entered manually.

## Offline readiness (prerequisite)
- **Done** (branch `cursor/persistent-storage`): request persistent storage for race officers and the installed app, so queued results aren't evicted when the device is low on space.
- **To do:**
  - **Queued saves count as saved:** when offline, treat a queued write as saved. Results writes are currently wrapped in a 30-second timeout, which reports a false error offline.
  - **Pending uploads:** show how many results are waiting to upload, using Firestore's pending-write flags. Warn before signing out or leaving with uploads pending.
  - **Server-only actions:** disable Publish, scanning and other server-only actions while offline. The dirty flags make sure the race is published later.

## Android versus iOS
- **Android (Chrome):** full support, including vibration and Web Bluetooth for an optional relay box.
- **iOS (Safari, and all iOS browsers):**
  - Must be installed to the home screen, which gives its own storage and exempts it from Safari's 7-day storage deletion. It needs its own sign-in and cache warm-up.
  - No vibration, and no Web Bluetooth, so no relay box.
  - Wake Lock is supported, but test it on the devices you'll use. Otherwise set auto-lock to Never.
  - The app pauses in the background and uploads when reopened, so keep it open during a race.
  - The ring/silent switch may mute sound on iPhone.
- **Bluetooth speaker:** works identically on both.
