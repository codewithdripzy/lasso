import { AgentPhase, AgentStatus, LassoAgentSession, AgentAction, AgentError, Observation, AgentPlan } from "./agent-runtime";

/**
 * Lasso Agent State Machine
 *
 * Controls phase transitions and validates state changes.
 * Lasso owns the transitions; the model can only suggest decisions.
 */

export class AgentStateMachine {
  /**
   * Valid phase transitions based on the current state
   */
  private static readonly TRANSITIONS: Record<AgentPhase, AgentPhase[]> = {
    understand: ["inspect", "complete"],
    inspect: ["plan", "understand", "complete"],
    plan: ["execute", "inspect", "understand", "complete"],
    execute: ["verify", "plan", "inspect", "understand"],
    verify: ["complete", "recover", "execute", "plan"],
    recover: ["inspect", "plan", "execute", "verify", "understand"],
    complete: [], // Terminal state
  };

  /**
   * Actions allowed in each phase
   */
  private static readonly ALLOWED_ACTIONS: Record<AgentPhase, string[]> = {
    understand: [],
    inspect: ["read_file", "search_code", "inspect_project", "browser_check"],
    plan: [],
    execute: ["edit_file", "create_file", "delete_file", "run_command"],
    verify: ["browser_check", "run_command"],
    recover: ["edit_file", "read_file", "run_command"],
    complete: [],
  };

  /**
   * Action types allowed in a phase (public, e.g. for model prompts).
   */
  static allowedActions(phase: AgentPhase): string[] {
    return [...(this.ALLOWED_ACTIONS[phase] || [])];
  }

  /**
   * Check if a phase transition is valid
   */
  static canTransition(session: LassoAgentSession, toPhase: AgentPhase): boolean {
    const currentPhase = session.phase;
    const allowed = this.TRANSITIONS[currentPhase] || [];
    return allowed.includes(toPhase);
  }

  /**
   * Attempt to transition to a new phase
   * Returns success status and error message if invalid
   */
  static transition(session: LassoAgentSession, toPhase: AgentPhase, reason?: string): { success: boolean; error?: string } {
    if (!this.canTransition(session, toPhase)) {
      return {
        success: false,
        error: `Invalid phase transition from ${session.phase} to ${toPhase}`,
      };
    }

    // Special checks for specific transitions
    if (toPhase === "complete") {
      if (session.actions.length === 0 && session.completedActions.length === 0) {
        return {
          success: false,
          error: "Cannot complete without executing any actions",
        };
      }
      if (session.status === "failed") {
        return {
          success: false,
          error: "Cannot complete a failed session",
        };
      }
    }

    if (toPhase === "recover") {
      if (session.errors.length === 0) {
        return {
          success: false,
          error: "Cannot enter recovery phase without errors",
        };
      }
    }

    return { success: true };
  }

  /**
   * Validate that an action is allowed in the current phase
   */
  static validateAction(
    session: LassoAgentSession,
    action: AgentAction
  ): {
    valid: boolean;
    error?: string;
  } {
    const allowedActions = this.ALLOWED_ACTIONS[session.phase] || [];
    const actionType = action.type;

    if (!allowedActions.includes(actionType)) {
      return {
        valid: false,
        error: `Action type "${actionType}" is not allowed in phase "${session.phase}"`,
      };
    }

    // Additional validation for specific actions
    if (action.type === "edit_file") {
      const data = action.data as any;
      if (!data.oldString && !data.newString) {
        return {
          valid: false,
          error: "Edit action must have oldString or newString",
        };
      }
    }

    if (action.type === "run_command") {
      const data = action.data as any;
      if (!data.command || !data.command.trim()) {
        return {
          valid: false,
          error: "Run command action must have a command",
        };
      }
    }

    return { valid: true };
  }

  /**
   * Determine the next phase based on current state and model decision
   */
  static determineNextPhase(session: LassoAgentSession, modelDecision: { type: string; goal: string }): AgentPhase {
    const currentPhase = session.phase;
    const decisionType = modelDecision.type;

    // If model explicitly asks for a phase, validate it
    if (decisionType === "inspect" && this.canTransition(session, "inspect")) {
      return "inspect";
    }
    if (decisionType === "plan" && this.canTransition(session, "plan")) {
      return "plan";
    }
    if (decisionType === "execute" && this.canTransition(session, "execute")) {
      return "execute";
    }
    if (decisionType === "verify" && this.canTransition(session, "verify")) {
      return "verify";
    }
    if (decisionType === "recover" && this.canTransition(session, "recover")) {
      return "recover";
    }

    // Default progression based on current phase
    switch (currentPhase) {
      case "understand":
        return "inspect";
      case "inspect":
        // If we have observations, move to plan
        if (session.observations.length > 0) {
          return "plan";
        }
        return "inspect";
      case "plan":
        // If we have a plan, move to execute
        if (session.plan) {
          return "execute";
        }
        return "plan";
      case "execute":
        // If we have completed actions, move to verify
        if (session.completedActions.length > 0) {
          return "verify";
        }
        return "execute";
      case "verify":
        // If verification succeeded, complete; if failed, recover
        const hasErrors = session.errors.some((e) => e.phase === "verify");
        if (hasErrors) {
          return "recover";
        }
        return "complete";
      case "recover":
        // After recovery attempt, go back to verify
        return "verify";
      case "complete":
        return "complete";
      default:
        return "understand";
    }
  }

  /**
   * Check if the session is in a terminal state
   */
  static isTerminal(session: LassoAgentSession): boolean {
    return session.phase === "complete" || session.status === "failed" || session.status === "cancelled";
  }

  /**
   * Check if the session can accept new actions
   */
  static canAcceptActions(session: LassoAgentSession): boolean {
    return session.status === "running" && session.phase !== "complete" && session.phase !== "understand";
  }

  /**
   * Check if the session should trigger verification
   */
  static shouldVerify(session: LassoAgentSession): boolean {
    return (
      session.phase === "execute" &&
      session.completedActions.length > 0 &&
      // Validation feedback (model proposed a rejected action) is teaching
      // material for the next prompt — it must not block verification.
      session.errors.filter((e) => e.phase === "execute" && e.type !== "validation").length === 0
    );
  }

  /**
   * Check if the session should trigger recovery
   */
  static shouldRecover(session: LassoAgentSession): boolean {
    return session.phase === "verify" && session.errors.filter((e) => e.phase === "verify").length > 0;
  }

  /**
   * Check if the session can switch models
   */
  static canSwitchModel(session: LassoAgentSession): boolean {
    return session.status === "running" && session.phase !== "complete";
  }

  /**
   * Calculate the estimated number of remaining turns
   */
  static estimateRemainingTurns(session: LassoAgentSession): number {
    const { phase, plan, completedActions, errors } = session;

    if (phase === "complete") return 0;
    if (phase === "understand") return 5; // understand → inspect → plan → execute → verify
    if (phase === "inspect") return 4; // inspect → plan → execute → verify
    if (phase === "plan") return 3; // plan → execute → verify
    if (phase === "execute") {
      const remaining = (plan?.estimatedActions || 5) - completedActions.length;
      return Math.max(remaining + 1, 2); // execute → verify
    }
    if (phase === "verify") {
      if (errors.length > 0) return 3; // verify → recover → verify
      return 1; // verify → complete
    }
    if (phase === "recover") return 2; // recover → verify
    return 5;
  }
}
