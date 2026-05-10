Place your logo and favicon in this directory:

  frontend/public/logo.png    — App logo (recommended: 200x200px, transparent background)
  frontend/public/favicon.ico — Browser tab icon (16x16 or 32x32)

Both files are referenced directly by the app:
  - logo.png  → used in sidebar, login page, mobile top bar
  - favicon.ico → browser tab icon (already set in index.html)

If logo.png is missing the app will still work — the img tags have onError handlers
that hide the broken image gracefully.
