# SmartEverything kit: conventions

React Native components rendered on the web through react-native-web, styled with Tailwind 4 classes compiled by Uniwind. Everything ships in `_ds_bundle.js` (global `window.SmartEverything`) and `_ds_bundle.css`, which `styles.css` imports.

## Setup

- Wrap the whole tree in `<DsRoot theme="dark">` (or `"light"`). It starts the app theme, the gesture, safe-area, query and navigation contexts and fills the page with `bg-bg`. Without it components throw ("navigation object", "theme") or render unstyled.
- `theme` is global: it sets the `dark` or `light` class on `<html>` and rewrites the CSS variables. To show the other theme inside one subtree use `<ThemeScope theme="light">`. Overlays (`Sheet`, `Menu`, `Popover`, `Overlay`, `ConfirmHost`) render in a portal outside any `ThemeScope`, so switch the whole page with `DsRoot` instead.
- Fonts are `Geist-Regular`, `Geist-Medium`, `Geist-SemiBold`, `GeistMono-Regular` (bundled in `fonts/`).

## Styling idiom

Use the kit components first; they carry their own classes. For layout around them use these Tailwind classes only (the compiled sheet contains just the classes the app source uses, so grep `_ds_bundle.css` before inventing one). Colours are semantic roles, never raw hex.

| Family            | Names                                                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Surfaces          | `bg-bg`, `bg-surface-1`, `bg-surface-2`, `bg-surface-3`, `bg-surface-raised`, `bg-chrome`                                                                                                                                |
| Ink               | `text-on-surface`, `text-on-surface-variant`, `text-on-surface-faint`, `text-on-primary`                                                                                                                                 |
| Accent and status | `bg-primary`, `bg-primary-container`, `text-primary`, `text-positive`, `text-warning`, `text-critical`, `text-info`                                                                                                      |
| Lines             | `border-outline`, `border-outline-variant`, `border-hairline`                                                                                                                                                            |
| Type scale        | `text-large-title`, `text-title-1`, `text-title-2`, `text-title-3`, `text-body`, `text-callout`, `text-footnote`, `text-caption`, `text-label`; fonts `font-sans`, `font-sans-medium`, `font-sans-semibold`, `font-mono` |
| Radius and depth  | `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-full`, `elevation-2`                                                                                                                                    |
| Spacing roles     | `px-gutter`, `px-card-pad`, `h-control-h`, `min-h-touch-min`, `max-w-dialog`, `w-master`; plain `p-4`, `gap-2`, `gap-3` on a 4px unit                                                                                    |
| Data colours      | `bg-viz-1` to `bg-viz-6` (also valid as `colour="viz-1"` on charts)                                                                                                                                                      |

Typed props take literal names: `icon`/`name` take an icon name and `colour` takes a colour role. The full lists are in `guidelines/docs/icons-and-colours.md` (the `.d.ts` files show them as `unknown` because the unions are long). Text goes through `<Text variant tone>`, never a bare element. A `className` passed to a kit component that already sets the same property loses or wins by CSS order, so prefer the component's own props (`tone`, `variant`, `size`).

## Where to read

`components/<group>/<Name>/<Name>.d.ts` for props, `<Name>.prompt.md` for usage, `_ds_bundle.css` for the class and variable vocabulary (`:root`-level variables sit under `.dark` and `.light`), `guidelines/` for icon and colour names.

## Build snippet

```jsx
const { DsRoot, Screen, PageHeader, Section, List, ListRow, Switch, Button } =
  window.SmartEverything;

<DsRoot theme="dark">
  <Screen header={<PageHeader title="Devices" subtitle="23 devices in 6 rooms" />}>
    <Section title="Living room">
      <List>
        <ListRow title="Floor lamp" subtitle="On, 65%" icon="lamp" chevron />
        <ListRow
          title="Night mode"
          icon="moon"
          trailing={<Switch value onChange={() => {}} label="Night mode" />}
        />
      </List>
    </Section>
    <Button label="Add device" icon="plus" />
  </Screen>
</DsRoot>;
```
