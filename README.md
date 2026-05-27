# SillyTavern User Outfit

A tiny SillyTavern extension that adds a floating shirt button. Use it to save what your current user persona is wearing, then SillyTavern temporarily appends that outfit to the persona description used by `{{persona}}`.

## Install

Install this repository as a third-party SillyTavern extension, or copy this folder into:

```text
public/scripts/extensions/third-party/SillyTavern-UserOutfit
```

Restart or reload SillyTavern after installing.

## How It Works

- Click the floating shirt button.
- Drag the shirt button if you want to move it somewhere else; the position is saved.
- Fill in any outfit fields for the active persona:
  - Top
  - Bottom
  - Footwear
  - Accessories
- When SillyTavern generates a reply, the extension appends only the non-empty fields to the end of the runtime persona description.

Outfits are saved per user persona avatar, so switching personas switches the saved outfit too.

The injected block looks like this:

```text
Current outfit:
Top: black fitted turtleneck
Bottom: high-waisted charcoal skirt
Footwear: ankle boots
Accessories: silver earrings, red scarf
```

The saved native persona description is restored after generation ends or stops.
