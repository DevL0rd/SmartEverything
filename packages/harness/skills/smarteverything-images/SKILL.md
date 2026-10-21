---
name: smarteverything-images
description: "Generates or edits raster images in a chat: photos, illustrations, textures, sprites, mockups, product shots and transparent cutouts, new or from references, or changes to an earlier image. Use for “draw me…”, “edit this photo” or “remove the background”. Load smarteverything-image-prompts to shape the prompt and smarteverything-image-samples for worked prompts. Not for work better done as SVG, HTML, CSS, code or a chart."
---

# Image generation

Images are metered and each model is billed differently, so the rules come first:

- `model_read` view images before the first image in a chat; use the person's `selected` model when set.
- `image_gen` action generate for new images, edit to change an existing one; both wait for the finished image. A call that errors or times out may still finish in the chat: never start it again.
- Make only the images the person asked for, and report the model used and any mismatch.

## Tools and rules

Images are made with two tools:

- `model_read` view images lists the image models and providers that can be used, with prices, the options each accepts, whether this chat may use them, and `selected`, the model the person picked in the app.
- `image_gen` has three actions: `generate` makes a new image (with no input image, or with images only as style, composition, mood or subject references), `edit` changes an existing image while preserving the rest, and `cancel` stops an active request with its operationId. The chat is always the one you are in: never pass a chat id. `generate` and `edit` wait and return when the image is finished. `tool_read` gives the exact schema.

Rules:

- Use `image_gen` action `generate` for new images and action `edit` for changing an existing image. There are no files, scripts, API keys or command lines to use, and nothing to set up.
- Call `model_read` view images before the first image request in a chat. When `selected` is set, use that model (and its providerTag when the model has several endpoints) for new images and for edits, restyles and reference images alike. The person picked it in the app, so do not swap it for a cheaper or different model unless it cannot take the references or options the request needs.
- When `selected` is null, use a returned model with a capability that fits, and its providerTag only when that model lists several endpoints (generate, edit, references). A reference the endpoint does not list is unsupported: do not send it.
- Quality and resolution are not yours to set: every request is made at the highest quality and resolution that endpoint offers. You only choose the `aspect_ratio` that suits the picture (or leave it out), how many variants `n`, and a transparent `background` for cutouts.
- A missing provider grant is fixed in the app, not by switching to another paid route.
- When a request fails because the provider has no quota, is unavailable or refused it, tell the person plainly which model failed and why, and ask before using a different model. Never start the same request again on that endpoint, and never switch to another model or provider on your own, because each one is billed differently.
- Image requests are metered. Do not start extra images, test renders or retries the person did not ask for.

Where images go:

- The app saves each result in the chat as an attachment and shows progress and the finished image itself. Do not describe file paths or copy images anywhere.
- An edit always makes a new image and leaves the original untouched, so nothing is overwritten.

Shared prompt guidance is in "Prompting best practices", "Use-case tips" and "Sample prompts" below.

## When to use

- Generate a new image (concept art, product shot, cover, website hero)
- Generate a new image using one or more reference images for style, composition, or mood
- Edit an existing image (inpainting-style changes, lighting or weather transformations, background replacement, object removal, compositing, transparent background)
- Produce many assets or variants for one task

## When not to use

- Extending or matching an existing SVG/vector icon set, logo system, or illustration library
- Creating simple shapes, diagrams, wireframes, or icons that are better produced directly in SVG, HTML/CSS, or a chart
- Making a small edit to an asset that already exists in an editable native format
- Any task where the person clearly wants deterministic code-native output instead of a generated bitmap

## Decision tree

Think about two separate questions:

1. **Intent:** is this a new image or an edit of an existing image?
2. **Execution strategy:** is this one asset or many assets/variants?

Intent:

- If the person wants to modify an existing image while preserving parts of it, use `image_gen` action `edit`, with the image as `source`.
- If the person provides images only as references for style, composition, mood, or subject guidance, use action `generate` and pass the images as `references`.
- If the person provides no images, use action `generate`.

Edit semantics:

- Action `edit` works on images that are already in the chat: attached images or images generated earlier in the conversation.
- Pass `latest`, `latestUploaded`, `latestGenerated` or an attachment ID (from `chat_read` view messages) as the source or a reference. Keep several references in the person's order.
- Only images the chat's person owns can be inputs. Ask for a correction instead of guessing a substitute.
- An image that is not in the chat cannot be edited until the person attaches it. Do not promise to edit files elsewhere.
- There are no masks. Describe the area to change in words and state what must stay unchanged.
- For edits, preserve invariants aggressively. Each edit makes a new image, so the original is always kept.

Execution strategy:

- Produce many assets or variants by issuing one `generate` or `edit` call per requested asset or variant in the same turn (parallel tool calls); the hub gives each its own operationId. Use the `n` option instead only for several variants of one prompt, within what the endpoint allows.

Assume the person wants a new image unless they clearly ask to change an existing one.

## Workflow

1. Read `model_read` view images (once per chat is enough) and choose the endpoint as described under "Tools and rules".
2. Decide the intent: generate, generate with references, or edit.
3. Decide the execution strategy: single asset vs several requests.
4. Collect inputs up front: prompt(s), exact text (verbatim), constraints/avoid list, and any input images.
5. For every input image, label its role explicitly:
   - reference image
   - edit target
   - supporting insert/style/compositing input
6. Pick each input image as `latest`, `latestUploaded`, `latestGenerated` or an attachment ID from `chat_read` view messages.
7. If the person asked for a photo, illustration, sprite, product image, banner, or other explicitly raster-style asset, make it with `image_gen` rather than substituting SVG/HTML/CSS placeholders. If the request is for an icon, logo, or UI graphic that should match existing vector or code assets, prefer working on those directly instead.
8. Augment the prompt based on specificity:
   - If the person's prompt is already specific and detailed, normalize it into a clear spec without adding creative requirements.
   - If the prompt is generic, add tasteful augmentation only when it materially improves output quality.
9. Call `image_gen` action `generate` (or `edit`) once per requested image, all in the same turn when there are several. The hub names each operation and returns its operationId; after an uncertain result do not start the request again, because it may still finish in the chat.
10. `generate` and `edit` wait for their own result. They return the final state (`completed`, `failed`, `cancelled` or `unknown`), the reason when there is one, the model used and, for a completed image, the saved attachments with their IDs. The app shows progress and the saved image in the chat meanwhile; do not describe file paths or copy images.
11. If a `generate` or `edit` call errors or runs out of time, the image may still be running or already saved: say so, point to the chat, and never start the same request again. An `unknown` state means billing and delivery could not be confirmed; report it and ask before any new attempt. Use `cancel` with its operationId to stop an active request.
12. When the call returns, check the result against what the person asked: subject, style, composition, text accuracy, and invariants/avoid items. Report which model made it and any mismatch plainly.
13. When the person asks for changes, iterate with one targeted change, then check the new result the same way. Make each iteration a new edit from the latest image (use its attachment ID) and repeat the invariants.

## Prompt augmentation

Reformat prompts into a structured, production-oriented spec. Make the person's goal clearer and more actionable, but do not blindly add detail.

Treat this as prompt-shaping guidance, not a closed schema. Use only the lines that help, and add a short extra labeled line when it materially improves clarity.

### Specificity policy

Use the person's prompt specificity to decide how much augmentation is appropriate:

- If the prompt is already specific and detailed, preserve that specificity and only normalize/structure it.
- If the prompt is generic, you may add tasteful augmentation when it will materially improve the result.

Allowed augmentations:

- composition or framing hints
- polish level or intended-use hints
- practical layout guidance
- reasonable scene concreteness that supports the stated request

Not allowed augmentations:

- extra characters or objects that are not implied by the request
- brand names, slogans, palettes, or narrative beats that are not implied
- arbitrary side-specific placement unless the surrounding layout supports it

## Image options

The request `options` take only these. Quality, resolution and size are always set for you to the highest the endpoint offers, so never send them.

- `aspect_ratio`: the shape that suits the picture, for example 1:1 for an avatar or icon, 16:9 for a wide scene or banner, 9:16 for a phone wallpaper or story, 4:3 or 3:2 for a photo, 2:3 or 3:4 for a portrait or poster. Leave it out to let the model choose. The endpoint's `parameters` list the ratios it accepts, and the nearest is used when a listed one differs.
- `n`: how many variants of one prompt (1-4), where the endpoint allows more than one.
- `background`: `transparent` for a cutout with no background (the format is switched to one that supports transparency), otherwise leave it out. It is not the scene in the prompt.
- References: up to 10 images per request, only on endpoints that list reference support. Edits and reference images both use it, so an endpoint without it can only generate.

Notes:

- Masking is prompt-guided here: describe the region and the invariants in words. Exact shapes are not guaranteed.
- If the request fails because an endpoint refuses something, change the request and call `generate` or `edit` again; that is a new operation.
- If an endpoint cannot take the references an edit needs, choose another endpoint from the list instead of dropping the references.

## Source

Adapted from the imagegen skill in OpenAI's skills repository (https://github.com/openai/skills, Apache License 2.0), with the tool, option and chat details changed to SmartEverything's.
