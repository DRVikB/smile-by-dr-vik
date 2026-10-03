# Isolated iOS QA

`npm run qa:ios-simulator` builds/syncs the staging web bundle, makes a temporary fixture app in `/tmp/smilecompose-simulator-qa`, and tests the native UI on dedicated **SmileCompose QA iPhone** and **SmileCompose QA iPad** simulators. Create these dedicated simulators in Xcode first. Existing private approved source/result files referenced by the script are required; they are deliberately not committed. This command makes **no Google requests**. Mock networking and SDK disabling affect only that temporary fixture app, never the actual device bundle.

`npm run qa:ios-live-generation -- --imports-only` checks all six owner-authorised folder imports locally. Provider calls are disabled. It uses Simulator Safari and the ordinary client photo functions, not the native Photos picker.

The separate `qa:ios-live-generation` command without `--imports-only` is an **explicit paid provider operation**. It requires an authorised source, an active disposable staging session in the Git-ignored evidence directory, and a confirmed remaining provider budget. Do not run it as an ordinary test/build or automatically retry a failed batch. The 3 October implementation pass used all 15 allowed requests.

Captured-output replay (`--replay-existing` or the constrained `--replay-full-arch` fixture) uses retained raw images with no new generation or allowance charge. It still saves disposable staging QA cases through normal authenticated APIs. Do not confuse replay with live provider success.

Run these commands **serially**. They share a dedicated QA simulator and temporary UI-test build. Test evidence/receipts/xcresults live in Git-ignored `output/simulator-reliability-2026-10-03/`. Never commit credentials or identifiable media. Full native fixture UI, Simulator Safari integrated pipeline, and physical-device checks are distinct test environments.
