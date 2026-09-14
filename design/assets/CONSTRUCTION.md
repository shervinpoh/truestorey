# Construction study

Local review build for `/progressive`.

## Why it exists

Connect a building milestone with the money due, the buyer's share, the bank's
draw and the resulting instalment. The architectural view identifies work
that is difficult to recognise in a percentage table. It is a conceptual
cutaway, never a real development, engineering design or progress forecast.

The first view selects framework (stage 3), where the model is recognisable.
All nine milestones are selectable directly, with previous/next controls.
Signing makes no claim about physical progress. Final completion keeps the
finished building and explains the contractual event. The payment bar is
explicitly a share of purchase price, never physical completion.

## Source and authorship

`construction.py` was executed through the live Blender MCP connection to
create a separate scene named `Truestorey • Construction study`. The existing
`Scene` was retained. The model, materials, cameras and lights are actual
Blender objects. `scenes/construction.blend` is a saved copy of that project.
Viewport inspection happened through MCP before rendering.

All website money and statutory wording come from `lib/calc/buc.js`. The
visual presentation takes the calculator's existing result as its input;
there is no independent loan implementation or image-generated figure.
The existing source review date is retained. The Singapore Statutes Online
page returned HTTP 403 to the automated browser during this build; no new
legal rules or percentages were introduced.

## Rendering

The live Blender scene remains available while a background Blender process
renders the saved model. Cycles CPU rendering is used: the Apple Metal
renderer spent several minutes compiling shaders without producing a frame.

From the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b design/assets/scenes/construction.blend --python-expr "import bpy; ns={'__name__':'renderer'}; exec(compile(open('design/assets/construction.py').read(),'construction.py','exec'),ns); ns['render_all'](bpy.data.scenes['Truestorey • Construction study'])"
node design/assets/encode-construction.mjs
```

Nine PNG masters become AVIF and WebP alternatives, each capped at 160 KB.
Only the selected image is mounted. The browser loads it lazily, with a fixed
aspect ratio, descriptive alternative text and a failure fallback. There is
no WebGL engine, added npm dependency, autoplay or scroll animation. GPT Image
is unnecessary here: it would not preserve exact construction geometry
across the nine states.

## Acceptance

- Every selection matches the existing calculator's percentage and wording.
- Changing price or loan assumptions updates the selected stage immediately.
- Foundation may include both buyer funds and bank drawdown.
- Signing includes the booking fee already paid.
- Completion exposes the original stakeholder wording.
- All stages work with keyboard and touch; mobile has no horizontal overflow.
- Reduced motion gets immediate states; no JavaScript retains the full schedule.
- A failed illustration cannot hide the financial answer.

`test/construction.test.js` covers financial linkage and asset budgets.
`check-construction.cjs` runs browser checks using the existing external
Playwright runtime and writes screenshots to `/tmp/construction-*.png`.
Comprehension by prospective buyers has not yet been user-tested.

Verified on 14 September 2026: all nine stage selections, updated purchase
price, original payment triggers, keyboard operation, 320px/390px widths,
dark mode, reduced motion, missing-image fallback and the no-JavaScript
schedule. The whole-purchase mobile strip is hidden while the construction
study is visible and returns below it. Browser console checks pass. The nine
AVIF files total 78,324 bytes; only the selected image is requested.
