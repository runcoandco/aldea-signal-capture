# ALDEA Signal Workspace

This folder now separates the editable app from deployment snapshots and packaged exports.

## Production Save Flow

The production Signal site uses:

- `index.html` for the browser app.
- `api/signal.js` as the same-origin server endpoint.
- `ALDEA_Signal_Capture_AppScript.gs` for CRM-only Apps Script logic.

Set these environment variables in the `aldea-signal-capture` Vercel project:

- `SIGNAL_SCRIPT_URL`: CRM Apps Script Web App `/exec` URL.
- `SIGNAL_TASK_SYNC_SECRET`: same value used by the Task Manager Vercel project.

Task Manager syncing must not also run inside `SignalCapture.gs`.

## Use This As The Working Area

- `index.html` at the root of `ALDEA-Signal/` is the live browser app file.
- `assets/aldea-inline.png` is the canonical inline logo for the Signal app.
- `aldea-signal/`, `deployments/`, and `archives/` are reference or historical copies unless a cleanup pass explicitly promotes or removes them.

## Organized Folders

- `index.html` - live Signal app file
- `assets/` - live Signal brand assets
- `aldea-signal/` - older working copy kept for reference
- `deployments/` - deployed snapshots and release copies
- `archives/` - packaged exports and zip bundles
- root-level docs and Apps Script files - supporting material for the Signal project

## Notes

- Several `index.html` files are currently identical. That is a sign of duplication, not separate source files.
- Going forward, the goal should be:
  - one working copy
  - named deployment snapshots when needed
  - archived export bundles stored separately

## Recommended Next Cleanup

If you want, the next step can be a deeper pass to:

- rename the working copy to something clearer like `active/`
- move the root duplicate files into a `legacy/` area
- create a simple release naming pattern for future snapshots
