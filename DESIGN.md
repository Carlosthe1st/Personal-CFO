---
name: Personal CFO
description: Um espaço financeiro claro para pequenas organizações portuguesas.
colors:
  ink: "#193129"
  muted: "#819187"
  line: "#e8ede7"
  primary-green: "#184f3d"
  deep-green: "#102d26"
  page: "#f7f9f6"
  surface: "#ffffff"
  active-green: "#e9f4ed"
  warning: "#a53f2d"
typography:
  headline:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-1.4px"
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "13px"
  label:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "10px"
    fontWeight: 800
    letterSpacing: "1.5px"
rounded:
  control: "8px"
  navigation: "9px"
  card: "16px"
  pill: "20px"
spacing:
  compact: "10px"
  regular: "16px"
  panel: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary-green}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
  button-secondary:
    backgroundColor: "{colors.active-green}"
    textColor: "{colors.primary-green}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "24px"
---

# Design System: Personal CFO

## Overview

**Creative North Star: "O centro financeiro claro"**

The authenticated workspace extends the green and white demo. Its visual language stays calm and practical: a fixed navigation rail, a slim context bar, a dark green summary hero, and light cards for discrete tasks. The same brand mark and type stack appear on the login screens.

**Key Characteristics:** Portuguese labels, compact task controls, generous card spacing, visible active navigation, and real data clearly distinguished from the demo.

## Colors

Deep green anchors the hero, brand mark, and primary actions. White surfaces sit on a pale green page; restrained green tints signal selection and live organization context. Dark green ink carries primary text, muted green gray carries supporting text, and a warm red is reserved for errors.

**The Green Hierarchy Rule.** Use the dark green for primary action and identity; use pale green for selected or supporting states.

## Typography

Arial with Helvetica and sans-serif fallbacks serves both display and body text. Page headings are bold with tight tracking; section headings are smaller; labels and status eyebrows are compact, often uppercase with wider tracking. Figures are larger and tighter tracked to scan quickly.

## Layout

The desktop shell has a 258px sidebar and a 74px top bar. The main content is centered and padded, with a 1280px maximum in the authenticated workspace. The overview uses four equal metric cards and two insight columns. At 720px the sidebar becomes a menu drawer, metrics become two columns, and insights stack. Form panels keep one task in view at a time.

## Elevation & Depth

Depth is quiet: white cards have thin pale borders and diffuse low opacity shadows. The dark hero carries a slightly stronger shadow; the login card uses a broad ambient shadow. Focus is shown with a visible green outline rather than elevation.

## Shapes

Controls have gently rounded corners, cards use larger rounded corners, and status badges are pills. The brand mark is a rounded square. Fine borders separate content without adding visual weight.

## Components

### Navigation

Sidebar links are compact rounded rows with icons. Hover adds a pale green background; the active view uses a stronger pale green fill and dark green text. On mobile, the drawer overlays the page and can be dismissed through its backdrop or close control.

### Buttons and fields

Primary submit buttons are dark green with white text; secondary task buttons are pale green with dark green text. Inputs are white with a pale green border and compact rounded corners. Hover darkens or enriches the green; keyboard focus has a three pixel green outline.

### Cards and status

Metric and task cards use white backgrounds, thin borders, soft shadows, and regular panel padding. The hero uses dark green with white content and a translucent balance tile. Status badges are small green pills. Errors use a warm red message on a pale peach surface.

## Do's and Don'ts

### Do:

- **Do** carry the demo's green mark, sidebar, top bar, and card language into authenticated screens.
- **Do** use actual organization data and plain Portuguese labels in the live workspace.
- **Do** keep primary actions and active navigation visibly distinct.

### Don't:

- **Don't** introduce a separate visual identity for login or accounting modules.
- **Don't** present demo figures as live financial data.
