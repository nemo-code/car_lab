# Project upload fixtures

These files contain synthetic content and are used by both browser E2E backends.

- `project-demo.mp4`: one second of blue video, 16 × 16 pixels, H.264, no audio.
  Generated with FFmpeg from its `color` source; no external footage is included.
- `project-report.pdf`: a valid one-page PDF containing “Project upload fixture”,
  using the built-in Helvetica font and a complete cross-reference table.

The browser flow uploads and publishes both files, compares anonymous download bytes
and MIME types, decodes the uploaded video, then verifies that both URLs return `404`
after the administrator takes the assets offline. FFmpeg is not needed to run the tests.
