# RPC Studio

Customize your **Discord Rich Presence** any way you like: text, images, timers, buttons, and even automatic rotation between presets. Available for **Windows** and **macOS**.

App languages: English, Indonesia, Español, 日本語.

---

## Table of contents
- [Installation](#installation)
- [Get started in 3 minutes](#get-started-in-3-minutes)
- [Feature guide](#feature-guide)
- [Dynamic text](#dynamic-text)
- [Updating the app](#updating-the-app)
- [FAQ](#faq)
- [Privacy & security](#privacy--security)

---

## Installation

Download the latest installer from the **Releases** page:
**https://github.com/JukutPremium/Discord-RPC-Studio/releases/latest**

### Windows
1. Download `RPC Studio Setup x.y.z.exe`.
2. Double-click it to install. The app opens automatically when it's done.
3. If a blue **"Windows protected your PC"** screen appears, click **More info → Run anyway**. This shows up because the app isn't signed with a paid certificate. It does not mean anything is wrong.

### macOS
1. Download the right `.dmg`: `arm64` for Apple silicon Macs (M1/M2/M3/M4), or the regular one for Intel Macs.
2. Open the `.dmg` and drag **RPC Studio** into the **Applications** folder.
3. If macOS blocks the app, right-click the app icon → **Open** → **Open**. If you see *"app is damaged"*, open Terminal and run:
   ```
   xattr -cr "/Applications/RPC Studio.app"
   ```

---

## Get started in 3 minutes

> **Important:** the Discord **desktop** app must be open. The browser version of Discord does not support Rich Presence.

**1. Create a Discord application (one time only)**
1. Go to https://discord.com/developers/applications and click **New Application**.
2. Give it a name. **This name is what shows in your status**, for example *"Playing **Your-Name**"*.
3. On the **General Information** page, copy the **Application ID** (a 17–20 digit number).

**2. Connect**
1. Open RPC Studio and paste the Application ID into the **Client ID** field (top right).
2. Click **Connect**. The status dot turns green when it works.

**3. Set it up and apply**
1. Fill in **Details** and **State** in the *Activity* card.
2. Check how it looks in the **Preview** card.
3. Click **Apply**. Your Discord status changes right away.

---

## Feature guide

### Activity
| Setting | What it does |
|---|---|
| **Type** | Playing, Listening, Watching, or Competing. |
| **Text in Discord status** | Choose what appears in the short status line: the app name, Details, or State. |
| **Details / State** | The first and second lines of the presence card (max. 128 characters). |
| **Text links** | Makes Details/State clickable (optional). |

### Images
- **Large / Small image**: enter a name from the Asset Library, an image URL, or an *asset key* from the Developer Portal. You can also pick one from the **Library** dropdown.
- **Hover text**: the text shown when someone hovers over the image.
- **Image click links**: optional.

### Time & Party
- **Timer**: no timer, elapsed time since you clicked Apply, elapsed time from a specific date/time, or a countdown (in minutes).
- **Party**: show a player count, for example *(2 of 4)*.

### Buttons
Up to 2 buttons, each with a label and a URL (must start with `http://` or `https://`).
Buttons are **not visible on your own account**, only to other people. To check them, ask a friend to look at your profile.

### Presets
Save all your fields as a single preset and reuse it any time.
- **Save**: enter a preset name and click Save.
- **Load**: puts the preset into the form. **Load + Apply**: loads it and applies it immediately.
- **Export / Import**: share presets with friends as a `.json` file.
- Presets can also be applied quickly from the **tray menu**.

### Preset Rotation
Automatically switch your presence between presets.
1. Save at least 1 preset.
2. Tick the presets you want to rotate.
3. Set the interval (minimum 15 seconds), then turn on **Enable automatic rotation**.

### Asset Library
Discord only accepts **image URLs** or **asset keys**, so files on your computer must be uploaded first.
- **+ Local file…**: pick an image (PNG/JPG/GIF/WEBP, max. 10 MB). The app uploads it to an image hosting service and saves the link in your library.
- **Name + URL / asset key**, then **Add**: register an image that already has a link.
- Once it's in the library, press **Large** or **Small** to use it right away.
- Optional: enter an **ImgBB API key** in Settings (free at api.imgbb.com) for more reliable uploads.

### App Icon (badge in voice)
Changes the small icon shown next to your name while your presence is active. This needs a **Bot Token** from your application:
1. Developer Portal → your application → **Bot** → **Reset Token**, then copy it.
2. Paste it into RPC Studio and click **Save**.
3. Click **Choose image & change App Icon…**.

The change can take a few minutes or a Discord restart. The application name itself is still changed manually in the Developer Portal.

### Settings
| Option | What it does |
|---|---|
| Connect automatically when the app opens | No need to click Connect every time. |
| Apply the last presence when connected | Your last presence becomes active right away. |
| Launch at system startup | The app starts together with your computer. |
| Start directly in the tray | The app starts hidden in the tray. |

> The **✕** button only hides the window to the **system tray** (next to the clock on Windows, the menu bar on Mac). Your presence stays active. To fully close the app, right-click the tray icon → **Quit**.

---

## Dynamic text

Write any of these tokens in any text field and the value updates automatically **every 30 seconds**. In the app, just **click a token** to insert it, and hover over a token to see its current value.

| Token | Example result |
|---|---|
| `{time}` | 14:35 |
| `{time12}` | 2:35 PM |
| `{date}` | 10/26/2026 |
| `{day}` | Monday |
| `{month}` | October |
| `{year}` | 2026 |
| `{hour}` / `{minute}` | 14 / 35 |
| `{cpu}` | 23% |
| `{ram}` | 61% |
| `{uptime}` | 3h 12m |
| `{os}` | Windows |
| `{cores}` | 8 |
| `{tz}` | Asia/Makassar |

Example: `Coding since morning • {day}, {time}` → *Coding since morning • Monday, 14:35*

Day, month, and date formats follow the language you picked in the app.

---

## Updating the app

Updates are automatic:
1. When a new version is out, an **Update** button appears at the top of the app.
2. Click it, read **What's new**, then click **Update now**.
3. Wait for the download to finish, then click **Restart & install**.

The app checks for updates automatically every few hours. To check manually: **Settings → Check for updates**, or right-click the tray icon → **Check for updates…**. Your presets, assets, and settings are **kept** when you update.

If the automatic update fails, click **Download manually** in the update window, or download the latest installer from the Releases page.

---

## FAQ

**My status doesn't show up in Discord.**
- Make sure the Discord **desktop** app is open and you're logged in.
- Make sure the app status is **green (Connected)**, then click **Apply**.
- In Discord: *User Settings → Activity Privacy* → turn on **"Display current activity as a status message"**.
- Double-check the Client ID: it must be 17–20 digits with no spaces.

**The status says "Waiting for Discord…".**
Discord isn't open or wasn't detected yet. Open Discord and the app will retry on its own every 5 seconds.

**I can't see my buttons.**
That's normal. Discord hides presence buttons from your own account. Other people can see them.

**My image doesn't show up.**
- Make sure the URL starts with `https://` and opens in a browser.
- For asset keys from the Developer Portal, a new image can take a few minutes after upload before it can be used.
- Use the **Test** button in the Asset Library to check the link.

**Uploading a local file fails.**
Image hosting services sometimes have issues. Try again, or enter an **ImgBB API key** in Settings for more reliable uploads.

**Where is my data stored?**
Presets and settings are stored on your computer:
- Windows: `%APPDATA%\RPC Studio\rpc-studio.json`
- macOS: `~/Library/Application Support/RPC Studio/rpc-studio.json`

**How do I uninstall?**
- Windows: *Settings → Apps → RPC Studio → Uninstall*.
- macOS: delete RPC Studio from the Applications folder.

---

## Privacy & security

- RPC Studio runs **on your computer**. There are no accounts, and no server of ours stores your data.
- Your **Bot Token** is stored encrypted on your computer and is only used to change the application icon. Never share your token with anyone.
- Images uploaded from local files become **public links** on an image hosting service (ImgBB, Catbox, or 0x0.st). Don't upload images that are private.
- Dynamic values like `{cpu}` and `{ram}` only appear in your status if you write them there yourself.

---

## About

RPC Studio was developed with the assistance of **[Claude](https://claude.ai)**, an AI assistant created by Anthropic. Claude helped review the translations and this documentation, while the development and release of the application remain the developer's responsibility. As with any software, if you encounter bugs or unexpected behavior, please report them on the Releases page so they can be addressed.

---

*RPC Studio is an independent app and is not affiliated with Discord Inc. or Anthropic.*
