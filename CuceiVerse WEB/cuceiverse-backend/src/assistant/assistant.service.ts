import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { PathfindingService } from '../mapa/pathfinding.service';
import { SiiauSessionCacheService } from '../siiau/siiau-session-cache.service';
import { OfferService } from '../offer/offer.service';
import { NlpService } from './nlp.service';
import type {
  AssistantChatDto,
  AssistantChatResponse,
} from './dto/assistant-chat.dto';
import { handleAcademicIntent } from './assistant-academic';
import { handleAdministrativeIntent } from './assistant-administrative';
import {
  LocalClarificationPlanner,
  LocalReplyPolisher,
} from './assistant-conversation';
import {
  handleNavigationIntent,
  resolvePoiFromText,
} from './assistant-navigation';
import { handleOfferSearchIntent } from './assistant-offer';
import { handlePlatformIntent } from './assistant-platform';
import type {
  AssistantPoiResolver,
  AssistantUser,
  ClarificationPlanner,
  IntentInterpreter,
  ReplyPolisher,
} from './assistant.types';
import {
  buildAssistantContextState,
  clearPendingClarification,
  extractLocationFromMessage,
  isAdministrativeFollowUpMessage,
  isAdministrativeMessage,
  isOfferFollowUpMessage,
  looksLikeAcademicSearchMessage,
  looksLikeNavigationMessage,
  normalizeText,
  withResolvedContext,
} from './assistant.utils';

class LocalIntentInterpreter implements IntentInterpreter {
  constructor(private readonly nlpService: NlpService) {}

  async interpret(message: string) {
    return this.nlpService.process(message);
  }
}

@Injectable()
export class AssistantService {
  private readonly intentInterpreter: IntentInterpreter;
  private readonly clarificationPlanner: ClarificationPlanner;
  private readonly replyPolisher: ReplyPolisher;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pathfindingService: PathfindingService,
    private readonly siiauSessionCacheService: SiiauSessionCacheService,
    private readonly offerService: OfferService,
    private readonly nlpService: NlpService,
  ) {
    this.intentInterpreter = new LocalIntentInterpreter(this.nlpService);
    this.clarificationPlanner = new LocalClarificationPlanner();
    this.replyPolisher = new LocalReplyPolisher();
  }

  private polish(response: AssistantChatResponse): AssistantChatResponse {
    return {
      ...response,
      reply: this.replyPolisher.polish(response.reply),
    };
  }

  async chat(
    user: AssistantUser,
    dto: AssistantChatDto,
  ): Promise<AssistantChatResponse> {
    let baseContext = buildAssistantContextState(dto.context);
    const originalMessage = dto.message.trim();
    let message = originalMessage;
    let normalizedMessage = normalizeText(message);
    let forcedIntent:
      | 'navigation'
      | 'administrative'
      | 'academic'
      | 'platform'
      | null = null;

    const clarificationDecision = this.clarificationPlanner.decide({
      message,
      normalizedMessage,
      context: baseContext,
    });

    if (clarificationDecision?.conversation_mode === 'clarify') {
      return this.polish({
        intent: clarificationDecision.intent,
        reply: clarificationDecision.reply,
        suggestions: clarificationDecision.suggestions,
        context: clarificationDecision.context,
      });
    }

    if (clarificationDecision?.conversation_mode === 'follow_up_resolution') {
      if (
        clarificationDecision.context.lastResolvedIntent === 'navigation' ||
        clarificationDecision.context.lastResolvedIntent === 'administrative' ||
        clarificationDecision.context.lastResolvedIntent === 'academic' ||
        clarificationDecision.context.lastResolvedIntent === 'platform'
      ) {
        forcedIntent = clarificationDecision.context.lastResolvedIntent;
      }
      baseContext = clarificationDecision.context;
      message = clarificationDecision.rewrittenMessage ?? message;
      normalizedMessage = normalizeText(message);
    } else if (clarificationDecision?.conversation_mode === 'direct_answer') {
      baseContext = clarificationDecision.context;
    }

    const nlpResult = await this.intentInterpreter.interpret(message);

    const poiResolver: AssistantPoiResolver = (text, context) =>
      resolvePoiFromText(text, context, this.prisma);

    if (
      baseContext.pendingDestinationPoiId &&
      extractLocationFromMessage(originalMessage)
    ) {
      const pendingLabel =
        baseContext.pendingDestinationLabel ?? originalMessage;
      const mergedPrompt = `como llego a ${pendingLabel} desde ${originalMessage}`;
      return this.polish(
        await handleNavigationIntent(mergedPrompt, baseContext, {
          prisma: this.prisma,
          pathfindingService: this.pathfindingService,
        }),
      );
    }

    if (
      forcedIntent === 'navigation' ||
      looksLikeNavigationMessage(normalizedMessage) ||
      (baseContext.pendingDestinationPoiId &&
        /^(ahi|alli|alli mismo|desde ahi|desde alli)$/i.test(normalizedMessage))
    ) {
      return this.polish(
        await handleNavigationIntent(message, baseContext, {
          prisma: this.prisma,
          pathfindingService: this.pathfindingService,
        }),
      );
    }

    if (
      forcedIntent === 'academic' ||
      isOfferFollowUpMessage(normalizedMessage, baseContext)
    ) {
      return this.polish(
        await handleOfferSearchIntent(nlpResult, message, baseContext, {
          offerService: this.offerService,
          resolvePoiFromText: poiResolver,
        }),
      );
    }

    if (
      forcedIntent === 'administrative' ||
      isAdministrativeFollowUpMessage(normalizedMessage, baseContext)
    ) {
      return this.polish(
        await handleAdministrativeIntent(
          message,
          normalizedMessage,
          baseContext,
          {
            resolvePoiFromText: poiResolver,
          },
        ),
      );
    }

    if (
      nlpResult.intent === 'academic_search' ||
      looksLikeAcademicSearchMessage(normalizedMessage)
    ) {
      return this.polish(
        await handleOfferSearchIntent(nlpResult, message, baseContext, {
          offerService: this.offerService,
          resolvePoiFromText: poiResolver,
        }),
      );
    }

    if (
      nlpResult.intent === 'administrative' ||
      isAdministrativeMessage(normalizedMessage)
    ) {
      return this.polish(
        await handleAdministrativeIntent(
          message,
          normalizedMessage,
          baseContext,
          {
            resolvePoiFromText: poiResolver,
          },
        ),
      );
    }

    if (nlpResult.intent === 'navigation') {
      return this.polish(
        await handleNavigationIntent(message, baseContext, {
          prisma: this.prisma,
          pathfindingService: this.pathfindingService,
        }),
      );
    }

    if (nlpResult.intent === 'platform') {
      return this.polish(
        handlePlatformIntent(
          normalizedMessage,
          withResolvedContext(clearPendingClarification(baseContext), {
            intent: 'platform',
            userGoal: originalMessage,
          }),
        ),
      );
    }

    return this.polish(
      await handleAcademicIntent(
        user.id,
        normalizedMessage,
        withResolvedContext(clearPendingClarification(baseContext), {
          intent: 'academic',
          userGoal: originalMessage,
        }),
        this.siiauSessionCacheService,
      ),
    );
  }
}
