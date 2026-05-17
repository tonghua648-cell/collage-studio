# Collage Art Generator - Current State

## Project
- Path: `D:\CodexWorkspace\collage-art-generator`
- Entry: `index.html`
- Main logic: `app.js`
- Styling: `styles.css`
- Default texture assets:
  - `assets/tone-3.jpg`
  - `assets/tone-4.jpg`

## Latest UI Direction
- Rebuilt to follow the louder Western retro Stitch result supplied by the user in chat.
- Visual style: loud Western retro collage / punk zine / screenprint poster UI.
- Layout:
  - Top nav: `COLLAGE STUDIO`, Editor/Gallery/Pricing/Archive, red `GO PRO`.
  - Center: large `EDITOR` heading, canvas/drop zone, and right sidebar.
  - Right sidebar: Properties maps to Levels; Layers maps to Gradient Map tone textures.
  - Lower strip: Input, Performance, Posterization.
  - Process section and footer are visual-only page content below the editor.
  - `Effects` panel remains hidden from the visible UI.

## Current UI Direction
- The UI has been rebuilt to follow the Stitch design from:
  - `C:\Users\Lenovo\OneDrive\图片\stitch_retro_collage_studio\code.html`
  - `C:\Users\Lenovo\OneDrive\图片\stitch_retro_collage_studio\DESIGN.md`
  - `C:\Users\Lenovo\OneDrive\图片\stitch_retro_collage_studio\screen.png`
- Visual style: Paper & Ink Studio / retro minimalist collage studio.
- Layout:
  - Top title bar: `COLLAGE STUDIO`
  - Center: transparent workspace/drop zone, no white panel background.
  - Bottom: horizontal control bar with Input, Performance, Levels, Posterization, Gradient Map.
  - `Effects` panel has been removed from the visible UI.
  - Right-bottom `Clear All` and `Export PNG` buttons have been removed.
  - Export is now in the `Input` panel.

## Current Processing Pipeline
The render order in `app.js` is:

1. Input image
2. Desaturate
3. Optional Oil Paint
4. Optional Shadows/Highlights
5. Optional Cutout
6. Levels
7. Posterize
8. Gradient Map / texture layer overlay

## Current Controls
- Input:
  - Select image
  - Remove image
  - Export PNG
  - Drag/drop image anywhere on the page
  - Click empty canvas/workspace to browse
- Performance:
  - Preview size slider plus editable number input
- Levels:
  - Black slider plus editable number input
  - Gamma slider plus editable number input
  - White slider plus editable number input
- Posterization:
  - Levels range: 4-6
  - Default: 4
  - Slider plus editable number input
- Gradient Map:
  - Tone layers are generated according to posterization count.
  - Each tone layer supports:
    - Color picker
    - Upload texture
    - Delete texture
  - If no texture exists for a tone, it shows the gradient map color.
  - Tone 3 and tone 4 load default local copied assets from `assets/`.
- Effects:
  - Still present in `app.js`, but hidden in the current UI as hidden controls to keep JS references valid.
  - Oil Paint: default off.
  - Shadows/Highlights: default off.
  - Cutout: default off.
  - If effects need to come back, expose the existing hidden buttons/logic rather than rewriting the pipeline.

## Important Fixes Already Made
- Gradient Map no longer blanks the image.
- It first draws a stable indexed color map, then overlays uploaded/default texture layers using masks.
- This avoids local `file://` canvas pixel-read issues with texture images.
- Oil Paint algorithm was changed away from blocky binning toward smoother edge-aware/directional smoothing.
- Cutout was changed away from square block averaging toward contour-aware smoothing and quantization.
- Gradient Map rendering is stable because the base color map is drawn first, and texture layers are overlaid with masks.
- Number displays beside sliders are now editable `<input type="number">` controls and sync back to the sliders.
- Whole-page image drag/drop is enabled.
- Bottom control deck was tuned to use minimum column widths and horizontal overflow instead of squeezing controls off-canvas.
- Non-level number inputs now sit beside their labels, with only the range slider spanning the full row.
- Mobile deck panels now get bottom dividers and texture rows can expand naturally.
- Visual shell now mirrors the supplied Stitch screenshot while preserving the existing functional IDs and data attributes.
- Texture layer UI strings were normalized to English (`Tone`, `Upload`, `Remove`) and export filename is now `collage-studio.png`.
- Each Gradient Map texture layer now has an editable material preview. Clicking a preview enters canvas texture-edit mode: drag moves the material, wheel scales it, Shift+wheel rotates it, and clicking blank canvas/page exits.
- `PROPERTIES` was renamed to `LEVELS`; top nav links are gray by default and black on hover; `Archive` became `Advice` and opens a rating/feedback modal.
- The lower `RAW` process image now switches to the user's uploaded source image and resets when the image is cleared.
- `READ THE MANUAL` now opens a function introduction modal covering Input, Levels, Posterization, Gradient Map, Material Edit, Export, and Advice.

## Verification
- Last check run after latest UI edits: `node --check app.js`
- Result: passed.

## Next Likely Work
- Fine-tune Stitch UI spacing/typography if needed.
- If the user asks for visible effects controls again, restore them as a compact panel or toolbar using existing hidden buttons.
- Improve visual quality of Oil/Cutout if user compares against Photoshop again.
- Add texture positioning controls only if requested.
- Consider running from a local server if browser file-origin issues appear again.
