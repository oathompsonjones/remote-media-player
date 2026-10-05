# Scheduler Extension Plan

## Overview

Extend the matchday display system from a single "current video" into a scheduled media system.

The VPS becomes responsible for storing optimised media, maintaining an absolute schedule, determining which media is currently active, exposing the current media through the existing display API, and cleaning up media that is no longer needed.

Display devices should remain as unchanged as possible. They should continue to ask the server what is currently playing, download/cache the required media, and play it locally. They should not need to understand the schedule.

The initial version should support H.264 MP4 video, JPEG/PNG images, absolute start and end times, scheduled gaps, reordering schedule entries, deleting schedule entries, and automatic cleanup of expired media.

## Goals

1. Replace the single-current-video model with a media library and schedule.
2. Keep display devices largely unaware of scheduling.
3. Store absolute timestamps, using UTC as the canonical representation.
4. Continue transcoding uploaded videos into the known playback format.
5. Allow multiple media items to be scheduled independently.
6. Allow the same media item to be scheduled more than once without duplicating the file.
7. Support gaps with an image placeholder.
8. Automatically remove media that is no longer required after a retention period.
9. Preserve offline playback on display devices.
10. Keep the existing current-media delivery abstraction where practical.

## Non-goals

The initial implementation should not become a general-purpose digital signage platform.

Do not initially add:

- arbitrary video codecs or containers,
- GIF/WebM/MKV/AVI/etc. support,
- recurring schedules,
- per-device schedules,
- multiple users,
- complex permissions,
- a database solely for its own sake,
- server-side live transcoding,
- or a native player architecture.

Add capabilities later only when there is a concrete requirement.

## Architecture

### Current

~~~
Upload
  |
  v
Validate + transcode
  |
  v
current.mp4
  |
  v
Display device
  |
  v
Local cache
  |
  v
Chromium kiosk
~~~

### Target

~~~
Web UI
  |
  | upload / schedule / reorder / delete
  v
VPS
  |
  +-- Media library
  +-- Schedule
  +-- Current-media resolution
  |
  v
Display API
  |
  v
Display device
  |
  +-- local cache
  |
  v
Chromium kiosk
~~~

The important boundary is that the server decides what "current" means. A display device does not need to know whether the current item was selected because of a schedule or another server-side rule.

## Media model

Introduce a media-library concept separate from scheduling.

A media item should contain, as appropriate:

- id
- type: video or image
- stored filename/path
- original filename
- MIME type
- file size
- duration for video
- creation/upload timestamp
- checksum/hash
- processing status where required

Large optimised files should remain outside the application/public tree, as they are today.

### Video processing

Retain the existing pipeline:

1. Stream the upload into temporary storage.
2. Validate it with ffprobe.
3. Transcode it to the known display format.
4. Hash/verify the result.
5. Move the completed optimised file into the media library.
6. Only then make it available for scheduling.

The initial video target remains the existing H.264 MP4 format.

### Images

Initially support JPEG and PNG only.

Images do not need a transcoding pipeline unless a concrete requirement appears. Validate them, store them in the media library, and expose them through the same general media-serving mechanism.

## Schedule model

A schedule entry is separate from a media item.

Conceptually:

~~~
Schedule entry
- id
- mediaId
- startsAt
- endsAt
- position/order if needed by the UI
~~~

startsAt and endsAt represent absolute instants and should be stored in UTC.

The UI displays them in the user's local timezone.

Example:

~~~
Video A
2026-10-03T13:00:00Z -> 2026-10-03T13:15:00Z
~~~

The same media item may be referenced by multiple schedule entries.

### Validation

Reject:

- end time before start time,
- zero-length entries,
- invalid media IDs,
- unsupported media types,
- and overlapping entries.

The first implementation should use a simple non-overlapping timeline so every instant has an unambiguous scheduled result.

## Gaps and placeholders

A gap is a period with no scheduled media.

The first implementation should support a configurable placeholder image for gaps.

Example:

~~~
13:00-13:15  Video A
13:15-13:20  Club logo
13:20-13:45  Video B
~~~

There does not need to be a special gap-media type. An ordinary image media item can serve as the placeholder.

If a period is deliberately left empty, the display should show the configured placeholder rather than continuing to play the previous scheduled item indefinitely.

## Current-media resolution

The existing current-media API should remain the key display abstraction.

Conceptually:

~~~
GET /api/display/current

{
  "id": "abc123",
  "type": "video"
}
~~~

The server resolves:

~~~
now -> matching schedule entry -> media item
~~~

The existing video route can continue to serve the actual MP4.

The display device does not calculate the schedule itself.

### Transition behaviour

When a scheduled item ends, the display should detect that the current media ID has changed and load the next item.

The existing playback logic already has the basic concept of checking the current metadata ID. For scheduled playback, the display will eventually need to account for a transition occurring while a long-running video or image is being displayed. A lightweight periodic metadata check can handle this without moving scheduling logic onto the device.

## Display-device changes

Keep these deliberately small.

The display device should continue to:

1. run the local Node server,
2. synchronise/cache required media,
3. expose it locally,
4. launch Chromium,
5. play the current media.

The browser page will evolve from video-only playback to media-type playback:

~~~
type === "video" -> <video>
type === "image" -> <img>
~~~

The local server will need corresponding support for cached images.

Do not redesign the display architecture or replace Chromium with a native player.

Offline behaviour remains a hard requirement:

- the display starts without a network connection,
- cached media remains playable,
- failure to contact the VPS does not prevent boot/playback.

## Web UI

Replace the current single-video management model with a media and schedule management UI.

### Media library

Show:

- name,
- type,
- duration where applicable,
- upload time,
- processing state,
- scheduled usage.

Actions:

- upload,
- delete where safe,
- inspect/use in the schedule.

### Schedule

Provide a simple ordered list or timeline.

Each entry shows:

- media name,
- start time,
- end time,
- duration,
- media type.

Actions:

- add to schedule,
- edit start/end time,
- reorder,
- remove from schedule,
- delete media when no longer needed.

Drag-and-drop reordering is useful, but correctness should take priority over a complex timeline editor.

### Absolute times

Users enter times naturally in local time. The application converts them to absolute UTC timestamps for storage.

The UI should make the timezone clear where necessary.

## Reordering

Reordering is a schedule operation, not a media operation.

If entries are represented purely by timestamps, moving an item is inherently tied to changing its times.

For the first implementation, editing absolute times should be the canonical operation. A convenience reorder interaction can later adjust neighbouring times automatically.

## Storage and cleanup

Move from the single-file storage model to a media library.

Conceptually:

~~~
/var/lib/rugby-display/
    media/
        <media-id>.mp4
        <media-id>.jpg
        ...
    .uploading/
    metadata/database state
~~~

Do not put media inside the application or public tree.

A media item is eligible for deletion only when it is no longer required.

Cleanup should consider:

- whether it is referenced by any future schedule entry,
- whether it is currently playing,
- whether its retention period has expired.

Do not delete media immediately when its schedule ends. Use a grace period, such as 24 hours, with the exact value configurable if practical.

Cleanup is a server-side responsibility.

## Persistence

The current application deliberately has no database. The scheduler introduces persistent relational state, so the storage mechanism should be chosen deliberately.

A small local database is likely appropriate for:

- media metadata,
- schedule entries,
- ordering,
- cleanup state.

Large media files should remain on the filesystem.

A robust filesystem/JSON representation can be considered if it remains simple and safe, but concurrency, atomic writes, deletion, and schedule updates must be treated as real requirements.

## API design

Separate management APIs from display APIs.

### Management APIs

Likely operations:

- upload media,
- list media,
- delete media,
- create schedule entry,
- update schedule entry,
- delete schedule entry,
- reorder schedule,
- retrieve schedule.

These use the existing management authentication.

### Display APIs

Keep the display-facing API minimal.

For example:

~~~
GET /api/display/current
~~~

returns the current scheduled media.

The actual media route serves the optimised file.

Display endpoints should not expose management functionality.

## Scheduling semantics

Define these explicitly before implementation:

- All stored timestamps are UTC.
- A media item is active when startsAt <= now < endsAt.
- The end instant is exclusive.
- Exactly one scheduled media item may be active at a given instant.
- If there is no scheduled item, the configured placeholder is active.
- A schedule item whose end time has passed is no longer current.
- A future item must never become current early because of client clock differences.
- The server clock is authoritative.

## Failure handling

### Upload failure

If validation or transcoding fails:

- remove temporary files,
- do not create a media item,
- leave the existing schedule untouched.

### Schedule failure

Invalid schedule changes should be rejected atomically. A failed update must not leave a partially modified schedule.

### Display offline

The display continues playing its locally cached media.

### VPS offline

The display continues using valid local media already available.

### Media deletion

Never delete a media file while it is referenced by a future schedule entry.

If deletion is requested for scheduled media, either reject the deletion or require the schedule references to be removed first.

## Suggested implementation order

### Phase 1 — Media library

- Replace current.mp4 storage semantics with persistent media IDs.
- Keep the existing upload/transcode pipeline.
- Store optimised videos independently.
- Preserve existing display behaviour during the migration.

### Phase 2 — Schedule persistence

- Add schedule storage.
- Add absolute UTC start/end timestamps.
- Add overlap validation.
- Implement current-media resolution on the server.

### Phase 3 — Management UI

- Media library view.
- Schedule list.
- Add/edit/remove schedule entries.
- Absolute local-time editing.
- Basic reordering/convenience controls.

### Phase 4 — Scheduled video playback

- Make the display current-media API resolve the active scheduled video.
- Update display synchronisation to cache media by ID.
- Preserve the existing local playback architecture.
- Test schedule transitions and offline operation.

### Phase 5 — Image support

- Add JPEG/PNG media items.
- Add image-serving/caching support.
- Update playback.html to render video or image.
- Add configurable placeholder image behaviour.

### Phase 6 — Cleanup

- Add media retention rules.
- Add automated server-side cleanup.
- Ensure referenced/future media is never removed.
- Add logging for cleanup operations.

### Phase 7 — Hardening

Test:

- schedule transitions,
- overlapping schedules,
- gaps,
- daylight-saving changes,
- uploads while a schedule is running,
- deletion of scheduled media,
- VPS outages,
- display-device outages,
- display reconnects,
- corrupted cached media,
- and simultaneous management operations.

## Desired end state

A complete matchday setup should be possible entirely from the web UI:

~~~
Upload:
  Match intro.mp4
  Team announcement.mp4
  Match video.mp4
  Club logo.png
  Sponsor.jpg

Schedule:
  13:00-13:05  Match intro
  13:05-13:10  Team announcement
  13:10-13:30  Match video
  13:30-13:35  Club logo
  13:35-13:45  Sponsor
~~~

The server owns the schedule and determines what is current.

The display devices simply synchronise the required media and play it locally.

This preserves the most important property of the existing system: the physical display does not need a reliable internet connection to display media.
