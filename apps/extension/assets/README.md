Plasmo needs the icon in two places:
- assets/icon.png       -> generates the toolbar icons (16/32/48/64/128) in the manifest
- src/assets/icon.png   -> imported in code as data-base64:~assets/icon.png
Keep both files identical. A clean build fails without assets/icon.png (see docs/agent-mistakes.md #11).
