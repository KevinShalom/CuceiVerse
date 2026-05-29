import type {
  AssistantClarificationReason,
  AssistantClarifyDecision,
  AssistantContextState,
  AssistantDecision,
  ClarificationPlanner,
  ReplyPolisher,
} from './assistant.types';
import {
  clearPendingClarification,
  extractLocationFromMessage,
  looksLikeTopicChange,
  matchClarificationOption,
  normalizeText,
} from './assistant.utils';
import { buildClarificationReply, polishReply } from './assistant-replies';

type ClarificationMatch = {
  selectedOption: string | null;
  clearedContext: AssistantContextState;
};

function resolvePendingClarification(
  message: string,
  context: AssistantContextState,
): ClarificationMatch {
  const options = context.pendingClarificationOptions ?? [];
  const normalizedMessage = normalizeText(message);
  const selectedOption = matchClarificationOption(normalizedMessage, options);

  if (selectedOption) {
    return {
      selectedOption,
      clearedContext: clearPendingClarification(context),
    };
  }

  if (
    context.pendingClarificationType === 'missing_origin' &&
    extractLocationFromMessage(message)
  ) {
    return {
      selectedOption: message,
      clearedContext: clearPendingClarification(context),
    };
  }

  if (looksLikeTopicChange(normalizedMessage)) {
    return {
      selectedOption: null,
      clearedContext: clearPendingClarification(context),
    };
  }

  return {
    selectedOption: null,
    clearedContext: context,
  };
}

export function buildClarificationDecision(input: {
  reason: AssistantClarificationReason;
  reply: string;
  suggestions: string[];
  context: AssistantContextState;
  intent: 'navigation' | 'academic' | 'administrative' | 'platform' | 'general';
  confidence?: number;
}): AssistantClarifyDecision {
  return {
    conversation_mode: 'clarify',
    clarification_reason: input.reason,
    confidence: input.confidence ?? 0.72,
    reply: buildClarificationReply(input.reply),
    suggestions: input.suggestions,
    context: {
      ...input.context,
      pendingClarificationType: input.reason,
      pendingClarificationOptions: input.suggestions,
    },
    intent: input.intent,
  };
}

export class LocalClarificationPlanner implements ClarificationPlanner {
  decide(input: {
    message: string;
    normalizedMessage: string;
    context: AssistantContextState;
  }): AssistantDecision | null {
    const { context, message } = input;

    if (!context.pendingClarificationType) {
      return null;
    }

    const resolution = resolvePendingClarification(message, context);
    if (resolution.selectedOption) {
      return {
        conversation_mode: 'follow_up_resolution',
        confidence: 0.88,
        rewrittenMessage: resolution.selectedOption,
        context: resolution.clearedContext,
      };
    }

    if (resolution.clearedContext !== context) {
      return {
        conversation_mode: 'direct_answer',
        confidence: 0.6,
        context: resolution.clearedContext,
      };
    }

    return {
      conversation_mode: 'clarify',
      clarification_reason: context.pendingClarificationType,
      confidence: 0.76,
      reply:
        context.pendingClarificationType === 'missing_origin'
          ? 'Todavia necesito tu ubicacion para completar la ruta. Elige una opcion o escribe donde estas.'
          : 'Necesito que cierres primero la aclaracion pendiente para responder bien.',
      suggestions: context.pendingClarificationOptions ?? [],
      context,
      intent:
        context.lastResolvedIntent === 'navigation'
          ? 'navigation'
          : context.lastResolvedIntent === 'administrative'
            ? 'administrative'
            : 'academic',
    };
  }
}

export class LocalReplyPolisher implements ReplyPolisher {
  polish(reply: string): string {
    return polishReply(reply);
  }
}
