/**
 * Design Tokens matching web/DESIGN.md and web/src/app/globals.css (.dark theme)
 * Used to theme and style the Lasso Shadow DOM components with 100% style isolation.
 */
export const DESIGN_TOKENS = {
  // Backgrounds & Surfaces
  bg: "#111214",             // web --background (dark)
  surface: "#18191d",        // web --surface (dark)
  surfaceSecondary: "#202124",// web --surface-secondary (dark)
  surfaceElevated: "#23262d", // elevated card surface
  surfaceHover: "#282a30",

  // Borders
  border: "#303238",         // web --border (dark)
  borderSubtle: "#282a2f",   // web --border-subtle (dark)
  borderActive: "rgba(255, 255, 255, 0.22)",

  // Text
  textPrimary: "#f8f9fc",    // web --text-primary (dark)
  textSecondary: "#b7bbc2",  // web --text-secondary (dark)
  textMuted: "#8b919a",      // web --text-muted (dark)

  // Brand & Accents
  primary: "#6ea0ff",        // web --primary (dark)
  primaryHover: "#5b8ff5",   // web --primary-hover (dark)
  primarySoft: "rgba(110, 160, 255, 0.14)",
  indigo: "#6366f1",
  purple: "#8b5cf6",
  amber: "#f59e0b",
  success: "#81c995",        // google green / web success dark
  warning: "#fdd663",        // google yellow / web warning dark
  error: "#f28b82",          // google red / web error dark

  // Radii
  radiusSm: "6px",
  radiusMd: "10px",
  radiusLg: "16px",
  radiusXl: "22px",
  radiusFull: "9999px",

  // Typography
  fontSans: '"Google Sans", "Google Sans Text", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontMono: 'ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace',

  // Shadows
  shadowSubtle: "0 1px 2px rgba(0, 0, 0, 0.2), 0 4px 14px rgba(0, 0, 0, 0.24)",
  shadowLg: "0 20px 50px rgba(0, 0, 0, 0.42), 0 4px 18px rgba(0, 0, 0, 0.28)",
  shadowCard: "0 16px 40px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.25)",
};

/**
 * Returns CSS variable declarations for the Shadow DOM :host root.
 */
export function hostTokensCss(): string {
  return `
    --lo-bg: ${DESIGN_TOKENS.bg};
    --lo-surface: ${DESIGN_TOKENS.surface};
    --lo-surface-2: ${DESIGN_TOKENS.surfaceSecondary};
    --lo-surface-elevated: ${DESIGN_TOKENS.surfaceElevated};
    --lo-surface-hover: ${DESIGN_TOKENS.surfaceHover};

    --lo-border: ${DESIGN_TOKENS.border};
    --lo-border-subtle: ${DESIGN_TOKENS.borderSubtle};
    --lo-border-active: ${DESIGN_TOKENS.borderActive};

    --lo-text: ${DESIGN_TOKENS.textPrimary};
    --lo-text-2: ${DESIGN_TOKENS.textSecondary};
    --lo-text-3: ${DESIGN_TOKENS.textMuted};

    --lo-primary: ${DESIGN_TOKENS.primary};
    --lo-primary-hover: ${DESIGN_TOKENS.primaryHover};
    --lo-primary-soft: ${DESIGN_TOKENS.primarySoft};
    --lo-indigo: ${DESIGN_TOKENS.indigo};
    --lo-purple: ${DESIGN_TOKENS.purple};
    --lo-amber: ${DESIGN_TOKENS.amber};
    --lo-success: ${DESIGN_TOKENS.success};
    --lo-warning: ${DESIGN_TOKENS.warning};
    --lo-error: ${DESIGN_TOKENS.error};

    --lo-radius-sm: ${DESIGN_TOKENS.radiusSm};
    --lo-radius-md: ${DESIGN_TOKENS.radiusMd};
    --lo-radius-lg: ${DESIGN_TOKENS.radiusLg};
    --lo-radius-xl: ${DESIGN_TOKENS.radiusXl};
    --lo-radius-full: ${DESIGN_TOKENS.radiusFull};

    --lo-font: ${DESIGN_TOKENS.fontSans};
    --lo-font-mono: ${DESIGN_TOKENS.fontMono};

    --lo-shadow-subtle: ${DESIGN_TOKENS.shadowSubtle};
    --lo-shadow-lg: ${DESIGN_TOKENS.shadowLg};
    --lo-shadow-card: ${DESIGN_TOKENS.shadowCard};
  `;
}
