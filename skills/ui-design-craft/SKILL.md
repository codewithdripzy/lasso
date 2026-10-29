---
name: ui-design-craft
description: Create, edit, refactor, or review user interfaces with strong layout judgment and fidelity to the product's existing design system.
metadata:
  short-description: Craft polished, product-native UI
---

# UI Design Craft: Layout Intelligence and Design System Fidelity

## Mission

Create and maintain beautiful, intentional, production-quality user interfaces that look like they were designed by an experienced product designer, not generated from generic AI templates.

This skill must be applied whenever the agent creates, edits, refactors, or reviews UI components, pages, layouts, design tokens, or frontend styling.

The objective is not simply to make interfaces minimal. It is to make them visually coherent, purposeful, distinctive, readable, and appropriate for the product.

Every design decision must have a reason.

The agent must actively recognize and eliminate visual patterns that make interfaces look cheap, cluttered, generic, inconsistent, overly decorative, or unfinished.

## 1. Priority hierarchy

Before making any UI change, follow this order of authority:

1. **User's explicit instructions:** Follow their requested appearance, behavior, and constraints.
2. **Existing product design system:** Preserve the established typography, colors, spacing, radii, borders, component conventions, and visual identity.
3. **Existing component architecture:** Reuse the project's components, tokens, utilities, and patterns wherever appropriate.
4. **Layout Intelligence:** Use Layout Intelligence to understand the page's structure, component relationships, hierarchy, alignment, density, and spatial composition.
5. **This design craft skill:** Apply the rules here to improve quality without conflicting with the preceding requirements.
6. **Reasoned design judgment:** Fill genuine gaps with the smallest set of coherent decisions necessary.

Never replace a user's design system with your own preferred aesthetic.

Never introduce a new color palette, font family, component library, radius system, or visual treatment merely because it is your default.

When the project already has a coherent design language, improve it rather than redesigning it unnecessarily.

## 2. Typography: Make hierarchy feel natural

Typography is one of the most important determinants of perceived quality. Use a small, consistent type scale and establish hierarchy through size, weight, color, and spacing.

### Labels and secondary interface text

Use these defaults for compact UI labels, metadata, field labels, table headings, navigation captions, and secondary interface information:

- Font size: 12–13px by default.
- Acceptable range: 10–14px when the context genuinely warrants it.
- Font weight: 400 for ordinary labels and 500 for subtle emphasis.
- Prefer 500 over 600 or 700 for ordinary interface labels.
- Use sentence case or natural title case.
- Use normal letter spacing.
- Use the existing font family and its supported weights.
- Maintain sufficient contrast against the background.

Do not make every label bold, uppercase, widely tracked, or visually dominant.

Labels should support the content they describe, not compete with it.

Important exception: do not shrink readable body text, form instructions, or essential information simply to satisfy the compact-label scale. Use approximately 14–16px or larger for ordinary body text where appropriate, with 16px as a good web default.

### Typography hierarchy

Use a restrained and intentional hierarchy:

- Display headings: Large enough to establish the page's identity, without overpowering its content.
- Section headings: Distinct enough to organize the interface, usually medium or semibold where justified.
- Body text: Readable, calm, and generally regular weight.
- Labels: Compact, subtle, typically 400–500.
- Metadata: Secondary in emphasis but still legible.
- Numbers and metrics: Emphasize only when the information deserves attention.

Avoid applying bold styling to everything. If every element is emphasized, nothing is emphasized.

Use one primary typeface unless the product's existing design system intentionally uses a pairing. A second typeface is permitted when it has a clear purpose.

Do not arbitrarily change fonts between components.

### Explicit typography prohibitions

Never use the following as a default styling pattern:

- ALL-CAPS labels throughout the application.
- Widely letter-spaced uppercase section labels.
- Bold uppercase eyebrow text above every heading.
- `font-bold` on ordinary form labels, table labels, navigation items, and metadata.
- Random font sizes that do not belong to a coherent scale.
- Extremely small text used to squeeze excessive content into a layout.
- Excessive italic text, decorative typography, or multiple competing typefaces.
- Low-contrast gray text that becomes difficult to read.

Uppercase is permitted for short acronyms, genuine abbreviations, and established product conventions. It must be intentional rather than decorative.

## 3. Visual effects: Restraint by default

A professional interface does not need shadows, glows, gradients, or blur to look sophisticated.

Prefer structure, typography, spacing, contrast, and surface relationships over decorative effects.

### Shadows

- Default to no shadow on ordinary content sections and cards.
- Never apply the same shadow to every card, button, container, or panel.
- Use subtle elevation only when an element genuinely sits above another surface.
- Reserve stronger elevation for appropriate overlays, popovers, dropdowns, dialogs, and floating elements.
- In dark themes, prefer carefully differentiated surfaces and borders over ineffective dark shadows.

### Glows and gradients

Do not introduce decorative glows, neon edges, blurred color orbs, animated gradient backgrounds, or purple-to-blue gradients as generic indicators of modern AI software.

Avoid gradients on ordinary application surfaces.

Gradients are allowed when they are an established part of the user's brand or serve a deliberate visual purpose.

### Glassmorphism and blur

Do not use glassmorphism, translucent panels, backdrop blur, or frosted surfaces as default styling.

Use them only when the product's design language calls for them and they improve layering or readability.

### Borders

- Prefer subtle, low-contrast borders.
- Use the existing semantic border tokens.
- Avoid thick outlines around every component.
- Avoid combining a strong border, heavy shadow, and prominent background tint on the same element without a clear reason.
- Use borders to define necessary boundaries, not to outline every region of the screen.
- When appropriate, replace unnecessary borders with spacing, alignment, surface contrast, or a single divider.

A border should clarify structure without drawing unnecessary attention to itself.

### Decorative effects prohibition

Do not add visual effects merely to make a design feel premium, modern, futuristic, or AI-powered.

If an effect can be removed without reducing clarity, affordance, brand expression, or meaningful hierarchy, remove it.

## 4. Layout Intelligence: Compose instead of decorating

Use Layout Intelligence as a structural reasoning system, not as a source of rigid templates.

Before generating or modifying a layout, determine:

- The page's primary purpose.
- The most important user action.
- The information hierarchy.
- The relationship between components.
- The appropriate content density.
- The alignment and spacing rules.
- The responsive behavior.
- The existing component boundaries.
- The visual patterns already established by the application.

Then select the layout that best communicates the content.

Do not force every page into the same structure.

### Avoid generic layout patterns

Do not default to:

- A centered hero with a headline, subtitle, and three equal cards.
- Dashboard pages made entirely of identical metric cards.
- Repeated three-column grids regardless of content.
- Every section having identical height, width, alignment, and padding.
- Nested cards inside cards inside bordered containers.
- Placing every component inside a rounded rectangle.
- Centering all text and content without a clear reason.
- Creating arbitrary empty space to imitate minimalism.
- Cramming unrelated content into a single dense region.

Use asymmetric layouts, editorial compositions, split layouts, lists, tables, timelines, sidebars, full-width regions, and grouped content when appropriate.

Symmetry and card grids are allowed when they genuinely serve the content. The problem is unthinking repetition, not the patterns themselves.

### Spacing and rhythm

Establish a consistent spacing scale based on the existing project tokens.

When no scale exists, use a practical base system such as:

4px, 8px, 12px, 16px, 24px, 32px, 48px, and 64px.

Use smaller values for tightly related elements and larger values to distinguish separate groups or sections.

Avoid arbitrary one-off margins and padding values when a design token would work.

Maintain consistent alignment between related elements. Ensure that headings, content blocks, controls, and surrounding sections follow an intentional visual rhythm.

Whitespace must clarify relationships and improve focus. It must not be added randomly or removed simply to fit more content.

## 5. Cards, containers, and surfaces

Cards are a component pattern, not a universal layout solution.

Before creating a card, ask whether the content actually needs a separate surface.

Use a plain layout when spacing and hierarchy already provide sufficient separation.

Use a card when it provides meaningful grouping, interaction, independent content identity, or a useful boundary.

### Anti-patterns

- A card for every heading and paragraph.
- Cards nested inside cards without a clear interaction reason.
- A separate card for every metric, filter, description, or label.
- Identical rounded corners and elevation on every surface.
- Borders, shadows, background tints, and padding all stacked unnecessarily.
- Excessively large corner radii on small controls and compact elements.
- Arbitrary radius changes between neighboring components.

Use the existing radius tokens. If the project has no radius system, establish a small scale appropriate to the product.

Use background differences, dividers, whitespace, and alignment to organize content without over-boxing the interface.

## 6. Color and contrast

Respect the existing palette and semantic color tokens.

Use color to communicate identity, hierarchy, status, and interaction.

- Keep the primary accent color purposeful.
- Use neutral surfaces to give content room to breathe.
- Reserve saturated colors for meaningful emphasis.
- Use semantic success, warning, error, and information colors consistently.
- Avoid introducing multiple unrelated accent colors.
- Avoid colored borders and accent strips on every card.
- Avoid using color as the only indicator of state.
- Do not use low contrast to create an artificial impression of sophistication.

For normal text, target a WCAG contrast ratio of at least 4.5:1. Large text and qualifying interface graphics have different applicable requirements.

Preserve legibility in both light and dark themes when the application supports them.

Never hardcode replacement colors throughout the UI when a semantic token already exists.

## 7. Icons and visual assets

Icons must communicate meaning or improve navigation.

- Reuse the project's established icon library.
- Maintain consistent icon sizes, stroke weights, and alignment.
- Use icons only where they improve comprehension, recognition, or scanning.
- Avoid decorative icons beside every heading.
- Do not use emoji as a substitute for professional interface icons.
- Do not mix unrelated icon families.
- Do not add icon backgrounds, circles, or badges to every icon by default.
- Never invent fake logos or use unrelated illustrations to fill empty space.

Use real product imagery, meaningful illustrations, or purposeful visualizations when the content benefits from them.

Do not introduce placeholder charts, invented statistics, meaningless decorative graphics, or fake product screenshots to make an interface look populated.

## 8. Components and interaction states

A beautiful interface must also work correctly.

Reuse existing components and their established behavior. Extend them when necessary instead of creating visually inconsistent replacements.

Every interactive element must communicate its role and respond appropriately.

Consider the following states wherever relevant:

- Default.
- Hover.
- Focus-visible.
- Active or pressed.
- Selected.
- Disabled.
- Loading.
- Success.
- Error.
- Empty.
- Expanded or collapsed.

Use restrained transitions that clarify changes in state.

Avoid excessive animation, bouncing, perpetual motion, gratuitous parallax, and universal fade-in effects.

Respect reduced-motion preferences.

Provide visible keyboard focus, accessible names for icon-only controls, appropriate semantic elements, and usable touch targets.

Never sacrifice functionality or accessibility for visual minimalism.

## 9. Product-specific design judgment

Different products require different visual personalities.

A developer tool may need compact information density, restrained colors, efficient navigation, and precise alignment.

A consumer product may need more expressive typography, imagery, and a warmer visual tone.

A financial dashboard may prioritize trustworthy information hierarchy and fast scanning.

An editorial or lifestyle product may benefit from asymmetric layouts and stronger visual storytelling.

Do not impose one universal aesthetic across all products.

Instead, determine what the product is, who uses it, and what visual language its existing design system establishes.

Make deliberate design decisions that fit that context.

## 10. Editing existing interfaces

When the user asks for a targeted change, preserve the existing interface unless broader changes are necessary or explicitly requested.

Before editing:

1. Inspect the selected element and its surrounding layout.
2. Identify the relevant component and styling source.
3. Read the existing design tokens and component conventions.
4. Understand how the requested change affects neighboring elements.
5. Identify existing visual inconsistencies relevant to the request.

During editing:

- Make the smallest coherent change.
- Preserve existing functionality and responsive behavior.
- Reuse existing components and tokens.
- Avoid introducing new design patterns unnecessarily.
- Keep spacing and alignment consistent with neighboring elements.
- Avoid unrelated redesigns.

After editing, review the result in the context of the whole page. A change that looks attractive in isolation can still disrupt the surrounding interface.

## 11. Mandatory visual quality review

Before considering a UI task complete, perform a design audit.

### Typography audit

- Are ordinary labels mostly 400–500 weight?
- Are compact labels appropriately sized without shrinking important content?
- Are uppercase and letter-spaced labels being used unnecessarily?
- Is bold styling reserved for meaningful hierarchy?
- Is the type scale consistent?

### Visual effects audit

- Are there unnecessary shadows, glows, gradients, or blur effects?
- Are borders too prominent?
- Are effects being stacked without a reason?
- Are decorative elements competing with content?

### Layout audit

- Does the layout reflect the content rather than a generic template?
- Are cards genuinely necessary?
- Are spacing and alignment consistent?
- Is the information hierarchy immediately understandable?
- Is the page unnecessarily crowded or empty?
- Does the layout work at different viewport sizes?

### Design system audit

- Were the existing tokens and components respected?
- Were any new colors, radii, typography styles, or interaction patterns introduced unnecessarily?
- Does the change feel native to the application?
- Has the change created inconsistencies elsewhere?

### Functional and accessibility audit

- Do interactions still work?
- Are keyboard navigation and visible focus supported?
- Is text readable and sufficiently contrasted?
- Do empty, loading, error, and success states remain understandable?
- Is responsive behavior preserved?

If a problem is found, correct it before finishing. Do not merely describe the issue while leaving an obvious, fixable defect in the implementation.

## 12. The design philosophy

Follow these principles consistently:

- Clarity over decoration.
- Intentional hierarchy over excessive emphasis.
- Typography over visual effects.
- Spacing over unnecessary borders.
- Meaningful structure over repetitive cards.
- Consistency over arbitrary styling.
- Product identity over generic AI aesthetics.
- Existing design systems over personal stylistic preferences.
- Readability over visual compactness.
- Functional simplicity over decorative complexity.

Do not interpret these rules as a demand to make every interface plain, monochromatic, or identical.

The goal is not minimalism for its own sake. The goal is a considered interface in which every important decision serves the product, the user, or the information being communicated.

**Final rule:** Before adding a visual element, justify its purpose. Before repeating a pattern, verify that repetition serves the layout. Before changing an existing style, verify that the change respects the user's design system.

The finished interface should feel deliberate, coherent, and professionally crafted—not like a collection of default components assembled by an AI.
