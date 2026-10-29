import { hostTokensCss } from "./tokens";
import { baseStyles } from "./styles/base";
import { selectionStyles } from "./styles/selection";
import { promptStyles } from "./styles/prompt";
import { reviewStyles } from "./styles/review";
import { gitStyles } from "./styles/git";
import { commandbarStyles } from "./styles/commandbar";
import { panelsStyles } from "./styles/panels";

export function buildStyles(): string {
  return [baseStyles(hostTokensCss()), selectionStyles, promptStyles, reviewStyles, gitStyles, commandbarStyles, panelsStyles].join("");
}
