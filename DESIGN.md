---
name: Personal CFO
description: Clareza financeira para organizações portuguesas.
colors:
  ink: '#17171A'
  muted: '#686870'
  line: '#E8E6E2'
  primary: '#1B3A6B'
  primary-soft: '#EDF1F7'
  page: '#F7F6F4'
  surface: '#FFFFFF'
  success: '#196747'
  danger: '#A23C42'
typography:
  headline:
    fontFamily: 'Geist, Arial, sans-serif'
    fontWeight: 700
    letterSpacing: '-0.035em'
  body:
    fontFamily: 'Geist, Arial, sans-serif'
  metadata:
    fontFamily: 'Geist Mono, monospace'
rounded:
  control: '10px'
  card: '16px'
  pill: '999px'
spacing:
  compact: '10px'
  regular: '16px'
  panel: '24px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.surface}'
    rounded: '{rounded.pill}'
    padding: '12px 18px'
  card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.card}'
    padding: '24px'
---

# Design System: Personal CFO

## Overview

**Creative North Star: "O centro financeiro sereno"**

The approved CondoFlow-inspired visual language uses a warm sand canvas, precise navy actions, quiet white surfaces, and readable financial figures. The login and every accounting view share this system; real organization data remains distinct from the demonstration screen.

**Key Characteristics:** horizontal desktop navigation, compact accessible menu, colored metric accents, Portuguese task labels, and restrained depth.

## Colors

Navy is reserved for identity, active navigation, primary actions, and focus. Sand separates the page from white task surfaces. Overview figures may use restrained blue, green, coral, and lilac tints; those accents do not change the meaning of real values. Success and danger remain semantic.

**The Quiet Accent Rule.** Color clarifies a metric or state; it does not turn every card into a primary action.

## Typography

Geist is the interface font. Geist Mono is limited to compact metadata and codes. Headings use a tight, confident hierarchy; figures are tabular and prominent; supporting text stays readable without competing with totals.

## Layout

The authenticated shell uses a sticky horizontal header, organization selector, seven role-filtered destinations, a small context row, and a centered content area up to 1392px. At widths through 1180px, the desktop destinations collapse into a bounded, scrollable dialog. At 390px, the four overview metrics form two columns and two rows. Tables can scroll within their own surface without widening the page.

## Elevation & Depth

Thin neutral borders and low ambient shadows distinguish task surfaces. The compact menu uses a stronger shadow and dimmed backdrop; the backdrop blocks background interaction while the dialog is open.

## Shapes

Cards are softly rounded; controls use smaller radii; primary actions and active navigation may be pills. Focus is shown with a visible blue outline, not a shadow alone.

## Components

### Navigation

The desktop header is horizontal and the compact menu contains the same authorized destinations. The menu supports Escape, focus return, and internal scrolling on short screens.

### Buttons and fields

Primary actions use navy and white; secondary controls use pale blue or a neutral outline. Fields are white with a clear border and visible focus ring. Errors remain actionable and legible.

### Cards and status

Financial cards share white surfaces, neutral borders, and regular spacing. The four overview cards use distinct subtle tints. Status is conveyed by text as well as color.

## Do's and Don'ts

- **Do** keep the approved sand, navy, Geist, and colored metric accents consistent across login and accounting views.
- **Do** preserve actual financial values, permissions, and Portuguese labels.
- **Don't** revive the previous green sidebar in the authenticated workspace.
- **Don't** use demonstration figures as live data.
