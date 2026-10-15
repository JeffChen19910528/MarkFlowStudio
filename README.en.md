# MarkFlow Studio

**English** | [繁體中文](./README.md)

An editor for writing Markdown documents on your computer: write on one side, see the formatted result on the other, switch themes to change the look, and finally export to **PDF, Word, HTML or plain text**.

Everything happens on your own computer. Your documents are never uploaded anywhere.

## Features

- **Live preview**: write on the left, read on the right; tables, lists, code blocks, links and images are supported
- **Several documents**: switch between tabs, each with its own undo history; recently opened files are remembered
- **Adjustable look**: 7 built-in themes (white paper, night, easy on the eyes…); customise colours, font, size, line height and page width and save them as your own theme
- **Export**: PDF, Word (.docx), HTML, plain text
- **Import**: turn an HTML page or a Word document into Markdown
- **Images**: images referenced in your document are shown, and included when you export to Word, HTML or PDF
- **Two interface languages**: Traditional Chinese and English, switched with one menu
- **Autosave**, **find and replace**, **heading outline**, **word count**

## Getting started

### For everyone (Windows)

1. Get `MarkFlowStudio-Windows-x64-….zip` and unzip it
2. Double-click **`MarkFlowStudio.exe`**
3. After a few seconds the MarkFlow Studio window opens; just start writing

Nothing to install and no internet needed. Close the window and the program quits by itself. You need Windows 10 or 11 (the built-in Edge or Google Chrome both work).

**Prefer a normal installed app (Start menu shortcut, can be uninstalled)?** Use the desktop installer **`MarkFlowStudio-Setup-v0.1.0.exe`** (about 2 MB). It installs into your user folder and does not need administrator rights. It uses the WebView2 that comes with Windows, which is why it is so small; the features are exactly the same. You can also run `MarkFlowStudio-Desktop.exe`, which needs no installation.

> **The first time you run it, Windows may show "Windows protected your PC".** This is because the program is not signed with a commercial certificate; Windows shows it for every such program. Click "**More info**" → "**Run anyway**" (make sure the file comes from someone you trust).

### From source

Requires Node.js 22 or newer.

```bash
npm install
npm run dev        # development mode; open the address shown in a browser
npm run build      # build the web version (dist/)
npm run package    # build the Windows executable and zip (release/)
npm run desktop    # build the desktop installer (needs Rust and the Visual Studio C++ build tools)
```

**Chrome or Edge** is recommended: they can save changes straight back to the original file. Firefox and Safari work too, but "Save" downloads a new copy, and there are no "Recent files" or "Image folder".

## Basics

### Interface language

The menu at the right end of the toolbar switches between **繁體中文** and **English** immediately. Your choice is remembered; the first time, the language of your browser or system is used. Documents you have not saved yet and that still have the default name ("Untitled", "未命名") are renamed to match the language.

### Writing and viewing

| To do this | Do this |
|---|---|
| New document | Toolbar "New", or the "＋" at the right of the tab bar |
| Change the view | Toolbar "Edit / Split / Preview"; in split view you can tick "Sync scrolling" |
| Switch or close documents | Click a tab; the "×" on a tab closes it (you are asked first if it has unsaved changes) |
| Find and replace | "Find / Replace" or `Ctrl+F` |
| Undo / redo | Toolbar buttons, or `Ctrl+Z`, `Ctrl+Y` |
| Jump to a heading | "Outline" in the "Sidebar" on the left; click a heading |

A **●** in front of a tab title means the document has not been saved yet.

### Opening and saving

- **Open**: choose a `.md`, `.markdown` or `.txt` file. A file that is already open is simply switched to; your edits are never overwritten
- **Save**: `Ctrl+S`; **Save as**: `Ctrl+Shift+S`
- **Recent files**: the sidebar lists recently opened files; click one to open it again
- **Autosave**: turn it on at the bottom of "Appearance" on the right and set the interval in seconds. It only writes back to files that already exist, so save a new document manually once first

### Changing the look

"Appearance" on the right lets you:

- Pick one of the 7 built-in themes from the "Theme" menu
- Adjust six colours, the font, font size, line height, paragraph spacing, content width and heading sizes
- Type a name under "Custom themes" and press "Save as new theme"; later you can update, rename, duplicate or delete it

If you do not see the settings panel, press "Appearance" on the toolbar.

### Exporting

Press **Export** on the toolbar, choose a format, check the file name and press the button:

| Format | Notes |
|---|---|
| **Word (.docx)** | Keeps headings, lists, tables, links, code and images |
| **PDF** | Choose paper (A4, Letter, custom), orientation, margins, page numbers, header and footer. After "Open print dialog", choose "**Save as PDF**" as the destination |
| **HTML** | One web page file with styles and images included |
| **Plain text (.txt)** | Readable text without Markdown marks |

- You can look at a preview first, and the dialog tells you what could not be converted completely
- The **print style** uses dark text on white, so even with the night theme the printout is not black; you can also choose to follow the current theme
- Exporting never touches or overwrites your original document

### Importing

Press **Import** on the toolbar and choose an `.html` or `.docx` file. The content is converted to Markdown and opened in a **new** document, together with a conversion report that lists what did not carry over (styles, merged cells, and so on). The original file is never modified.

### Images

Images referenced with a relative path (for example `![caption](./images/cat.png)`) need you to tell the program where they are:

1. In the "Sidebar" on the left, under "**Image folder**", press "Choose image folder…"
2. Choose the folder that contains the images (the program only reads, and only inside that folder)
3. The preview shows the images right away; they are also included when you export to Word, HTML or PDF

PNG, JPEG, GIF and WebP are supported. Images from web addresses are not loaded, to protect your privacy. Each document has its own image folder, and you need to choose it again after reopening the document.

### Keyboard shortcuts

| Action | Keys |
|---|---|
| Save / Save as | `Ctrl+S` / `Ctrl+Shift+S` |
| Undo / redo | `Ctrl+Z` / `Ctrl+Y` |
| Find and replace | `Ctrl+F` |
| Find next | `F3` |
| Close a dialog | `Esc` |

The full list is under "Shortcuts" on the toolbar.

## FAQ

**No window appears after double-clicking?** Wait 5–10 seconds. If there is still nothing, open a browser and go to `http://127.0.0.1:47831`.

**My settings and recent files are gone after closing the window?** They are stored in the browser. Always start the program with `MarkFlowStudio.exe` (do not open the address in another browser).

**Images do not show up?** Use "Image folder" in the sidebar to choose the folder that contains them.

**No page numbers in the PDF?** Page numbers, headers and footers need Chrome or Edge 131 or newer.

**Something went wrong?** The log file is `%LOCALAPPDATA%\MarkFlowStudio\launcher.log` (paste it into the File Explorer address bar to open it).

**How do I remove it?** For the zip version, just delete the folder; nothing was installed on your system. For the installer version, uninstall it from Windows "Installed apps".

## License

MIT. Third-party software and its licenses are listed in `THIRD-PARTY-NOTICES.txt` inside the zip.
