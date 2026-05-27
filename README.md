# SillyTavern User Outfit

A tiny SillyTavern extension that adds a floating shirt button. Use it to save what your current user persona is wearing, then SillyTavern injects that outfit into the prompt automatically.

## Install

Install this repository as a third-party SillyTavern extension, or copy this folder into:

```text
public/scripts/extensions/third-party/SillyTavern-UserOutfit
```

Restart or reload SillyTavern after installing.

## How It Works

- Click the floating shirt button.
- Type the outfit for the active persona.
- Leave "Inject into prompt" enabled.
- The extension inserts this prompt text: `{{user}} is currently wearing: {{outfit}}`

Outfits are saved per user persona avatar, so switching personas switches the saved outfit too.
