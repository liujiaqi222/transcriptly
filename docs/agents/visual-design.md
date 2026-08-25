# Transcriptly visual design

Use this palette for extension UI so popup, injected controls, and future
surfaces feel like one product.

## Brand palette

- **Ink — `#202124`**: the Transcriptly wordmark and logo, primary text,
  neutral icons, and ordinary controls.
- **Action blue — `#1b90ed`**: links, selected controls, checkboxes, focus
  indicators, and other interactive state. Blue is not used for the logo.
- **Accessible blue text — `#0872b9`**: small link and control labels on white
  or pale-blue surfaces; the brighter action blue is reserved for non-text UI.
- **Action blue hover — `#147ac9`**: hover and pressed treatment for blue
  interactive elements.
- **Action blue soft — `#edf7ff`**: selected surfaces and quiet interactive
  backgrounds.
- **CTA yellow — `#f5c451`**: the popup's task-completing Save actions. Use
  ink text on yellow. CTA hover is `#e7b642`.
- **Muted text — Slate 500 `#64748b`**: supporting copy.
- **Border — Slate 200 `#e2e8f0`**: dividers and neutral control borders.

## Usage rules

- White and very light neutral surfaces should occupy most of the interface.
- The logo is a black Lucide icon without a colored tile or shadow.
- Use `#1b90ed` for interaction and selection, not for large filled areas.
- Reserve `#f5c451` for the few actions that advance or complete the primary
  task. Do not spend yellow on decoration, counters, or ordinary tools.
- Do not use yellow in controls injected into YouTube. The content-script
  panel uses an ink primary button so it stays visually quiet on the host page.
- Vertically center the batch-source popup task group in the available content
  area. Keep capture and error states content-led rather than forcing them into
  the same centering rule.
- Selection counters must handle their longest state. Give quota, ETA, and
  saved metadata a full-width summary row; keep Load more on its own row.
- During bounded auto-loading, keep the discovered count in a separate status
  label. Change the action to Stop while the 10-second/100-card loader is active
  and restore Load more when it finishes.
- Keep YouTube red out of Transcriptly branding. Reserve red for destructive
  actions and errors.
- Use icons to make action and state semantics scannable, but always retain a
  text label for non-decorative actions.
- Import icons directly from `lucide-react` in React surfaces and `lucide` in
  imperative DOM surfaces. Do not hand-write SVG paths or add icon proxy files.
- Different action types should not appear with equal visual weight. Keep one
  primary action per view; discovery and destructive/clearing actions are
  secondary or tertiary.
- Do not use box shadows in the popup or injected controls. Separate regions
  with borders, background color, and spacing instead.
- Use the Tailwind spacing rhythm: all margin, padding, and gap values are
  multiples of 4px (4, 8, 12, 16, 20, 24, and so on). Optical dimensions such
  as 1px borders, icon strokes, and type sizes are not spacing tokens.
- Maintain visible keyboard focus and at least 40px pointer targets for
  primary controls injected into YouTube.
