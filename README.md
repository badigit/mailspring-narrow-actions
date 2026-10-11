# Narrow Thread Actions

Adds Archive and Trash buttons when you hover over a thread in Mailspring's narrow list.
Tested on Mailspring 1.26.0 for Windows.

## Installation

Run these commands in PowerShell:

```powershell
git clone https://github.com/badigit/mailspring-narrow-actions.git
Set-Location "mailspring-narrow-actions"
& ".\install.ps1"
```

Reload the Mailspring window from the Developer menu.
Hover over a thread in the narrow list.
Archive and Trash buttons appear on the right when those actions are available in the current folder.

## Troubleshooting

Open `%APPDATA%\Mailspring\packages\narrow-thread-actions\status.json`.
The value `state: active` means the plugin has loaded.
If the value is `state: failed`, the `error` field contains the failure details.

## Removal

Delete `%APPDATA%\Mailspring\packages\narrow-thread-actions`.
Reload the Mailspring window.

## Tests

Run this command from the repository directory:

```powershell
npm test
```
