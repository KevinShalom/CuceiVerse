import type { AssistantChatResponse } from './dto/assistant-chat.dto';
import type { NlpClassificationResult } from './nlp.service';

export type AssistantUser = {
  id: string;
  siiauCode: string;
};

export type AssistantContextState = {
  lastOriginPoiId?: string;
  lastOriginLabel?: string;
  lastDestinationPoiId?: string;
  lastDestinationLabel?: string;
  pendingDestinationPoiId?: string;
  pendingDestinationLabel?: string;
  lastOfferSubject?: string;
  lastOfferProfessor?: string;
  lastOfferBuilding?: string;
  lastOfferMode?: string;
  lastAdministrativeTramiteId?: string;
  lastAdministrativeTramiteTitle?: string;
  lastAdministrativeCategory?: string;
  lastAdministrativeLocation?: string;
  pendingClarificationType?:
    | 'ambiguous_destination'
    | 'ambiguous_subject'
    | 'missing_origin'
    | 'missing_reference';
  pendingClarificationOptions?: string[];
  lastResolvedIntent?: string;
  lastResolvedEntityType?: string;
  lastResolvedEntityLabel?: string;
  lastUserGoal?: string;
};

export type SessionEntry = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  snapshot: {
    profile?: {
      careerName?: string | null;
      average?: number | null;
      creditsEarned?: number | null;
      creditsTotal?: number | null;
      completedClasses?: Array<{
        id: string;
        name: string;
        grade?: number | null;
        description?: string | null;
      }>;
      pendingClasses?: Array<{
        id: string;
        name: string;
        xpReward: number;
      }>;
    };
    courses: Array<{
      nrc: string;
      materia: string;
      clave: string;
      creditos?: number | null;
      sessions?: Array<{
        hora?: string | null;
        dias?: string | null;
        aula?: string | null;
        profesor?: string | null;
        edif?: string | null;
      }>;
    }>;
  } | null;
  error: string | null;
};

export type Poi = {
  id: string;
  nombre: string;
  nearestPathNodeId: string | null;
};

export type DayReference = {
  label: string;
  token: string;
};

export type AssistantPoiResolution = {
  action: NonNullable<AssistantChatResponse['action']>;
  context: AssistantContextState;
};

export type AssistantPoiResolver = (
  text: string,
  baseContext: AssistantContextState,
) => Promise<AssistantPoiResolution | null>;

export type AssistantConversationMode =
  | 'direct_answer'
  | 'clarify'
  | 'follow_up_resolution';

export type AssistantClarificationReason =
  | 'ambiguous_destination'
  | 'ambiguous_subject'
  | 'missing_origin'
  | 'missing_reference';

export type AssistantClarifyDecision = {
  conversation_mode: 'clarify';
  clarification_reason: AssistantClarificationReason;
  confidence: number;
  reply: string;
  suggestions: string[];
  context: AssistantContextState;
  intent: 'navigation' | 'academic' | 'administrative' | 'platform' | 'general';
};

export type AssistantDirectDecision = {
  conversation_mode: 'direct_answer' | 'follow_up_resolution';
  confidence: number;
  rewrittenMessage?: string;
  context: AssistantContextState;
};

export type AssistantDecision =
  | AssistantClarifyDecision
  | AssistantDirectDecision;

export interface IntentInterpreter {
  interpret(message: string): Promise<NlpClassificationResult>;
}

export interface ClarificationPlanner {
  decide(input: {
    message: string;
    normalizedMessage: string;
    context: AssistantContextState;
  }): AssistantDecision | null;
}

export interface ReplyPolisher {
  polish(reply: string): string;
}
