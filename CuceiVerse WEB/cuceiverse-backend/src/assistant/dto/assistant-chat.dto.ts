import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class AssistantHistoryMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(2000)
  content!: string;
}

class AssistantContextDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastOriginPoiId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  lastOriginLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastDestinationPoiId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  lastDestinationLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  pendingDestinationPoiId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  pendingDestinationLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  lastOfferSubject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  lastOfferProfessor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastOfferBuilding?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  lastOfferMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  lastAdministrativeTramiteId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  lastAdministrativeTramiteTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastAdministrativeCategory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  lastAdministrativeLocation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  pendingClarificationType?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  pendingClarificationOptions?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  lastResolvedIntent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  lastResolvedEntityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  lastResolvedEntityLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  lastUserGoal?: string;
}

export class AssistantChatDto {
  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssistantHistoryMessageDto)
  history?: AssistantHistoryMessageDto[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AssistantContextDto)
  context?: AssistantContextDto;
}

export type AssistantChatResponse = {
  reply: string;
  intent: 'navigation' | 'academic' | 'administrative' | 'platform' | 'general';
  suggestions: string[];
  context: {
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
    pendingClarificationType?: string;
    pendingClarificationOptions?: string[];
    lastResolvedIntent?: string;
    lastResolvedEntityType?: string;
    lastResolvedEntityLabel?: string;
    lastUserGoal?: string;
  };
  action?: {
    type: 'highlight-route';
    destinationPoiId?: string;
    destinationLabel?: string;
    originPoiId?: string;
    originLabel?: string;
  };
};
