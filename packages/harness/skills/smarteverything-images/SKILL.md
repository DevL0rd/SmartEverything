---
name: smarteverything-images
description: Generate, edit, restyle or combine images in a SmartEverything chat from a description or from earlier or attached images.
---

# Image generation and editing

Call `list_image_endpoints` before `edit_image` action start and use the returned model and provider_tag with a capability that fits (generate, edit, references). A missing provider grant is fixed in the app, not by switching to another paid route.

Resolve a named or latest owned image with `edit_image` action resolve and use its attachment ID as the source; keep several references in the user's order. Only images the chat's person owns can be inputs: ask for a correction instead of guessing a substitute.

Write the prompt around subject, composition, style and output constraints; `tool_details` gives the schema. Use one operation ID per request and keep it after an uncertain result; never retry an unknown outcome with a new ID.

`start` returns Started while generation continues, so start every requested image at once, say briefly that it started and finish; the app shows progress and saves the result. `edit_image` action cancel stops an active request. Use `wait` once only when later work needs the saved images (see its description).
