---
name: smarteverything-images
description: Generate or edit SmartEverything chat images with discovered endpoint capabilities, owned references and immediate background delivery.
---

# Image generation and editing

## Choose a supported endpoint

Use `list_image_endpoints` before `start_image_operation`. Read each endpoint's generation/edit/reference capabilities, prices and the initiating chat's separate image-provider readiness. Use the returned model, provider_tag and revision. Subscription chat authorization does not grant the metered image provider; a missing grant belongs in the app's account flow, not an automatic paid fallback.

Resolve an explicit image or the authoritative latest owned image with `resolve_image_input`. Use its stable attachment ID for the edit source and keep multiple references in the order the user intended. Preserve immutable originals. A path, thumbnail or image from another person's chat is not an owned input; an unavailable required reference needs the person's correction rather than a guessed substitute.

## Start and return

Build the prompt around the requested subject, composition, style and output constraints. Discover the operation schema through `tool_details` and select only supported options. Use one operation ID for this request; preserve that identity after an uncertain result. Never retry an unknown provider outcome automatically with a new ID.

`start_image_operation` returns Started while generation continues. Briefly say it started and finish the image request; the UI receives progress, saves the image and presents completion. Do not wait by reading receipt/history, reading chats repeatedly or running a polling loop. Continue unrelated work only when the person asked for it. `cancel_image_operation` cancels the active provider request and pending result persistence; do not claim billing is resolved when delivery is unknown.

The UI owns receipt status and history; `call_operation` cannot turn their human-only endpoints into an AI completion check. For further work the user requested that needs the saved images, use `wait_for_images` once: omit operation_ids to snapshot the initiating chat's active batch, or pass exact creation IDs to include already-finished outcomes. Jobs started later are excluded. Use returned attachment IDs for the requested edit or explicitly authorized send. A bounded timeout returns partial results; pending, failed, cancelled or unknown outcomes are not completion. Never loop, schedule a completion turn or wait merely to display images. Starting an operation is not proof that an image was produced.
