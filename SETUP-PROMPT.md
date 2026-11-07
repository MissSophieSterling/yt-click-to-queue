# AI Setup Prompt

Copy everything inside the box below and paste it into your AI assistant. This works with Claude Code, Codex, Cursor, Gemini CLI, or any assistant that can run terminal commands. If your AI can only chat, it will walk you through the same steps by hand.

```text
Install the Chrome extension "YT Click-to-Queue & Auto-Playlist" for me from
https://github.com/MissSophieSterling/yt-click-to-queue

Do these steps in order. Tell me plainly what you did after each one.

1. Pick the install folder: ~/yt-click-to-queue on macOS or Linux,
   %USERPROFILE%\yt-click-to-queue on Windows. If the folder already exists,
   update it with `git pull` and do not clone again.
2. Get the code:
   - If git is available, run:
     git clone https://github.com/MissSophieSterling/yt-click-to-queue.git <install folder>
   - If git is not available, download
     https://github.com/MissSophieSterling/yt-click-to-queue/archive/refs/heads/main.zip
     and unzip it into the install folder.
3. Check the download. The folder must contain manifest.json, content.js,
   background.js, and an icons folder holding icon-16.png, icon-32.png,
   icon-48.png and icon-128.png. Open manifest.json and confirm that
   "manifest_version" is 3 and that the only permission is "storage". If any
   file is missing, or the manifest asks for more permissions, stop and tell me.
4. Open chrome://extensions in Chrome, or edge://extensions in Edge, or
   brave://extensions in Brave. On macOS you can run:
   open -a "Google Chrome" "chrome://extensions"
   Browsers do not let scripts install unpacked extensions, so the next part is
   up to me. Give me these clicks one at a time:
   a. Turn on "Developer mode" (top right).
   b. Click "Load unpacked".
   c. Select the install folder (the folder that holds manifest.json).
   d. Optional: click the puzzle-piece icon in the toolbar and pin
      "YT Click-to-Queue".
5. Ask me to open https://www.youtube.com and confirm that a "Queue Mode" pill
   appears at the bottom left. If it does not appear, ask me to reload the
   YouTube tab and check again.
6. Finish with this quick guide:
   - Alt+Q, the toolbar icon, or the pill turns Queue Mode on or off.
   - With Queue Mode on, clicking a video queues it and clicking it again
     removes it. Ctrl/Cmd-click still opens the video in a new tab.
   - The number on the pill opens the queue. From there: Play all, Copy links, Clear.
   - Every video you queue is also saved to that day's playlist (YYYY-MM-DD)
     under "Daily playlists", and Clear does not delete it.
   - To update later: run `git pull` in the install folder, then click the
     reload arrow on the extension's card in chrome://extensions.

Do not change any browser settings beyond what is listed above, and do not
install anything else.
```
